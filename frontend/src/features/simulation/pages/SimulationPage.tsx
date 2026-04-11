import { FormEvent, useEffect, useMemo, useState } from 'react';
import { clearSession, getUsername } from '../../auth/services/authService';
import { POSITIONS_WS_URL, VEHICLE_BASE_URL } from '../../../shared/config/runtime';
import { AppShell } from '../../../shared/layouts/AppShell';

type Vehicle = {
  vehicle_id: string;
  lat: number;
  lng: number;
  created_at?: string;
};

type PositionEvent = {
  vehicle_id: string;
  lat: number;
  lng: number;
  recorded_at: string;
};

type VehiclesResponse = {
  vehicles: Vehicle[];
  total: number;
};

type SimulationStatus = {
  running: boolean;
  selected_count: number;
  tick_ms: number;
  requests_sent: number;
  errors_count: number;
  started_at?: string;
  last_error?: string;
};

const defaultSimulationStatus: SimulationStatus = {
  running: false,
  selected_count: 0,
  tick_ms: 1500,
  requests_sent: 0,
  errors_count: 0
};

export function SimulationPage() {
  const username = getUsername();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedCount, setSelectedCount] = useState(50);
  const [tickMs, setTickMs] = useState(1500);
  const [simulationStatus, setSimulationStatus] = useState<SimulationStatus>(defaultSimulationStatus);
  const [isSimulationSubmitting, setIsSimulationSubmitting] = useState(false);
  const [isWsActive, setIsWsActive] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [events, setEvents] = useState<PositionEvent[]>([]);
  const [isCreatingVehicles, setIsCreatingVehicles] = useState(false);
  const [isClearingDatabase, setIsClearingDatabase] = useState(false);
  const [isLoadingVehicles, setIsLoadingVehicles] = useState(false);
  const [lastCreateResult, setLastCreateResult] = useState<string>('');
  const [lastClearResult, setLastClearResult] = useState<string>('');

  const loadVehicles = async () => {
    setIsLoadingVehicles(true);
    try {
      const response = await fetch(`${VEHICLE_BASE_URL}/api/v1/vehicles`);
      if (!response.ok) {
        throw new Error('No fue posible consultar los vehiculos');
      }
      const data = (await response.json()) as VehiclesResponse;
      setVehicles(data.vehicles ?? []);
    } catch {
      setVehicles([]);
    } finally {
      setIsLoadingVehicles(false);
    }
  };

  useEffect(() => {
    void loadVehicles();
  }, []);

  const loadSimulationStatus = async () => {
    try {
      const response = await fetch(`${VEHICLE_BASE_URL}/api/v1/simulation/status`);
      if (!response.ok) {
        throw new Error('No fue posible consultar estado de simulacion');
      }

      const data = (await response.json()) as SimulationStatus;
      setSimulationStatus(data);

      if (data.running) {
        setSelectedCount(data.selected_count);
        setTickMs(data.tick_ms);
      }
    } catch {
      setSimulationStatus(defaultSimulationStatus);
    }
  };

  useEffect(() => {
    void loadSimulationStatus();

    const interval = window.setInterval(() => {
      void loadSimulationStatus();
    }, 2000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    setSelectedCount((prev) => {
      if (vehicles.length === 0) {
        return 0;
      }
      if (prev <= 0) {
        return Math.min(50, vehicles.length);
      }
      return Math.min(prev, vehicles.length);
    });
  }, [vehicles.length]);

  useEffect(() => {
    if (!isWsActive) {
      setWsConnected(false);
      return;
    }

    const socket = new WebSocket(POSITIONS_WS_URL);

    socket.onopen = () => setWsConnected(true);
    socket.onclose = () => setWsConnected(false);
    socket.onerror = () => setWsConnected(false);
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as PositionEvent;
        setEvents((prev) => [payload, ...prev].slice(0, 120));
      } catch {
        // noop
      }
    };

    return () => {
      socket.close();
    };
  }, [isWsActive]);

  const activeVehicles = useMemo(() => vehicles.slice(0, selectedCount), [vehicles, selectedCount]);

  const onAdd100Vehicles = async () => {
    setIsCreatingVehicles(true);
    setLastCreateResult('');

    try {
      const response = await fetch(`${VEHICLE_BASE_URL}/api/v1/vehicles/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 100 })
      });

      if (!response.ok) {
        throw new Error('No fue posible crear vehiculos');
      }

      const data = (await response.json()) as { created?: number; total?: number };
      setLastCreateResult(`Creados: ${data.created ?? 0} | Total BD: ${data.total ?? 0}`);
      await loadVehicles();
    } catch {
      setLastCreateResult('Error creando vehiculos en base de datos');
    } finally {
      setIsCreatingVehicles(false);
    }
  };

  const onClearDatabase = async () => {
    const confirmed = window.confirm('Esto borrara TODOS los vehiculos y posiciones historicas. Deseas continuar?');
    if (!confirmed) {
      return;
    }

    setIsClearingDatabase(true);
    setLastClearResult('');

    try {
      const response = await fetch(`${VEHICLE_BASE_URL}/api/v1/admin/clear-db`, {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error('No fue posible limpiar la base de datos');
      }

      setEvents([]);
      setLastCreateResult('');
      setLastClearResult('Base de datos limpiada: vehiculos y posiciones eliminados.');

      await loadVehicles();
      await loadSimulationStatus();
    } catch {
      setLastClearResult('Error limpiando la base de datos');
    } finally {
      setIsClearingDatabase(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (isSimulationSubmitting) {
      return;
    }

    const run = async () => {
      setIsSimulationSubmitting(true);
      try {
        if (simulationStatus.running) {
          const response = await fetch(`${VEHICLE_BASE_URL}/api/v1/simulation/stop`, {
            method: 'POST'
          });
          if (!response.ok) {
            throw new Error('No fue posible detener simulacion');
          }
        } else {
          if (vehicles.length === 0 || selectedCount <= 0) {
            return;
          }

          const response = await fetch(`${VEHICLE_BASE_URL}/api/v1/simulation/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ selected_count: selectedCount, tick_ms: tickMs })
          });
          if (!response.ok) {
            throw new Error('No fue posible iniciar simulacion');
          }
        }

        await loadSimulationStatus();
      } catch {
        // noop
      } finally {
        setIsSimulationSubmitting(false);
      }
    };

    void run();
  };

  const onLogout = () => {
    clearSession();
    window.location.href = '/login';
  };

  return (
    <AppShell
      headerRight={<span>Vehiculos creados: {vehicles.length}</span>}
      navItems={[
        { to: '/', label: 'Dashboard', icon: 'map', subtitle: 'Mapa en tiempo real' },
        { to: '/simulacion', label: 'Simulacion', icon: 'smart_toy', subtitle: 'Generador de flota', active: true }
      ]}
      onLogout={onLogout}
      statusLabel="WebSocket"
      statusOk={wsConnected}
      statusValue={wsConnected ? 'conectado' : 'desconectado'}
      title="Modulo de simulacion"
      username={username}
    >
      <div className="grid grid-cols-12 gap-6">
        <section className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-5 col-span-12 xl:col-span-4">
          <h2 className="font-headline text-lg font-bold">Gestion de vehiculos (BD)</h2>
          <p className="mt-1 text-sm text-on-surface-variant">La creacion de vehiculos es independiente de la simulacion.</p>

          <button
            className="mt-4 w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-on-primary disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isCreatingVehicles}
            onClick={onAdd100Vehicles}
          >
            {isCreatingVehicles ? 'Creando...' : 'Crear 100 vehiculos en BD'}
          </button>

          <button
            className="mt-2 w-full rounded-xl border border-outline-variant/20 bg-surface px-4 py-2 text-sm font-semibold"
            disabled={isLoadingVehicles}
            onClick={() => void loadVehicles()}
          >
            {isLoadingVehicles ? 'Actualizando...' : 'Refrescar vehiculos de BD'}
          </button>

          <button
            className="mt-2 w-full rounded-xl border border-error/35 bg-error/10 px-4 py-2 text-sm font-semibold text-error disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isClearingDatabase}
            onClick={() => void onClearDatabase()}
          >
            {isClearingDatabase ? 'Limpiando BD...' : 'Limpiar base de datos'}
          </button>

          {lastCreateResult ? (
            <div className="mt-3 rounded-xl border border-outline-variant/20 bg-surface p-3 text-xs text-on-surface-variant">
              {lastCreateResult}
            </div>
          ) : null}

          {lastClearResult ? (
            <div className="mt-2 rounded-xl border border-outline-variant/20 bg-surface p-3 text-xs text-on-surface-variant">
              {lastClearResult}
            </div>
          ) : null}

          <div className="mt-6 border-t border-outline-variant/15 pt-5">
            <h3 className="font-headline text-base font-bold">Simulador de ingesta</h3>
            <p className="mt-1 text-sm text-on-surface-variant">Solo simula posiciones de vehiculos existentes en base de datos.</p>
          </div>

          <form className="mt-5 space-y-4" onSubmit={onSubmit}>
            <label className="block text-sm font-medium text-on-surface-variant">
              Cantidad de vehiculos existentes a simular
              <input
                className="mt-1 w-full rounded-xl border border-outline-variant/30 bg-surface px-3 py-2"
                max={Math.max(vehicles.length, 1)}
                min={vehicles.length > 0 ? 1 : 0}
                type="number"
                value={selectedCount}
                onChange={(e) => {
                  const nextValue = Number(e.target.value) || 0;
                  setSelectedCount(Math.max(0, Math.min(nextValue, vehicles.length)));
                }}
              />
            </label>

            <label className="block text-sm font-medium text-on-surface-variant">
              Intervalo por tick (ms)
              <input
                className="mt-1 w-full rounded-xl border border-outline-variant/30 bg-surface px-3 py-2"
                min={200}
                step={100}
                type="number"
                value={tickMs}
                onChange={(e) => setTickMs(Math.max(200, Number(e.target.value) || 1500))}
              />
            </label>

            <div className="flex gap-2">
              <button
                className="flex-1 rounded-xl bg-secondary px-4 py-2 text-sm font-semibold text-on-secondary disabled:cursor-not-allowed disabled:opacity-70"
                disabled={isSimulationSubmitting || (!simulationStatus.running && (vehicles.length === 0 || selectedCount <= 0))}
                type="submit"
              >
                {simulationStatus.running ? 'Detener simulacion' : 'Iniciar simulacion'}
              </button>
              <button
                className="flex-1 rounded-xl border border-outline-variant/20 bg-surface px-4 py-2 text-sm font-semibold"
                type="button"
                onClick={() => setIsWsActive((prev) => !prev)}
              >
                {isWsActive ? 'Desactivar WS' : 'Activar WS'}
              </button>
            </div>
          </form>

          <div className="mt-5 grid grid-cols-2 gap-2 text-sm">
            <StatCard label="Vehiculos en BD" value={vehicles.length} />
            <StatCard label="Simulando" value={Math.min(selectedCount, vehicles.length)} />
            <StatCard label="Solicitudes enviadas" value={simulationStatus.requests_sent} />
            <StatCard label="Errores" value={simulationStatus.errors_count} />
          </div>

          <div className="mt-4 rounded-xl border border-outline-variant/20 bg-surface p-3 text-xs text-on-surface-variant">
            WebSocket: <strong className={wsConnected ? 'text-secondary' : 'text-error'}>{wsConnected ? 'conectado' : 'desconectado'}</strong>
          </div>

          <div className="mt-2 rounded-xl border border-outline-variant/20 bg-surface p-3 text-xs text-on-surface-variant">
            Simulador backend: <strong className={simulationStatus.running ? 'text-secondary' : 'text-on-surface'}>{simulationStatus.running ? 'activo' : 'detenido'}</strong>
            {simulationStatus.started_at ? <span className="ml-2">Inicio: {new Date(simulationStatus.started_at).toLocaleTimeString()}</span> : null}
          </div>

          {simulationStatus.last_error ? (
            <div className="mt-2 rounded-xl border border-error/30 bg-error/10 p-3 text-xs text-error">Ultimo error: {simulationStatus.last_error}</div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-5 col-span-12 xl:col-span-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-headline text-lg font-bold">Feed en tiempo real (WebSocket)</h2>
            <span className="text-xs text-on-surface-variant">Canal: gps:stream</span>
          </div>

          <div className="mb-4 h-[320px] overflow-hidden rounded-2xl border border-outline-variant/20 bg-[radial-gradient(circle_at_15%_20%,rgba(0,83,219,0.2),transparent_28%),radial-gradient(circle_at_85%_70%,rgba(0,107,98,0.2),transparent_28%),linear-gradient(120deg,#dfeaff_0%,#eef4ff_100%)] p-4">
            <div className="grid h-full w-full grid-cols-2 gap-2 rounded-xl border border-white/60 bg-white/45 p-3 backdrop-blur">
              {activeVehicles.slice(0, 30).map((vehicle) => (
                <div key={vehicle.vehicle_id} className="flex items-center gap-2 rounded-lg bg-white/70 px-2 py-1 text-xs shadow-sm">
                  <span className="inline-block h-2 w-2 rounded-full bg-primary" />
                  <span className="font-semibold">{vehicle.vehicle_id}</span>
                  <span className="text-slate-500">{vehicle.lat.toFixed(4)}, {vehicle.lng.toFixed(4)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="max-h-[260px] overflow-auto rounded-xl border border-outline-variant/20">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-surface-container-low">
                <tr>
                  <th className="px-3 py-2">Vehiculo</th>
                  <th className="px-3 py-2">Lat</th>
                  <th className="px-3 py-2">Lng</th>
                  <th className="px-3 py-2">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={`${event.vehicle_id}-${event.recorded_at}`} className="border-t border-outline-variant/10">
                    <td className="px-3 py-2 font-medium">{event.vehicle_id}</td>
                    <td className="px-3 py-2">{event.lat.toFixed(5)}</td>
                    <td className="px-3 py-2">{event.lng.toFixed(5)}</td>
                    <td className="px-3 py-2">{new Date(event.recorded_at).toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-outline-variant/20 bg-surface p-3">
      <div className="text-[11px] uppercase tracking-wider text-on-surface-variant">{label}</div>
      <div className="mt-1 text-lg font-bold">{value}</div>
    </div>
  );
}
