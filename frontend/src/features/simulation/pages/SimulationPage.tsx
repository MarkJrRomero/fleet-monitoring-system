import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Database, Radio, Send, Timer } from 'lucide-react';
import { clearSession, getUsername } from '../../auth/services/authService';
import { getMainNavItems } from '../../../shared/config/navItems';
import { VEHICLE_BASE_URL } from '../../../shared/config/runtime';
import { usePageSeo } from '../../../shared/hooks/usePageSeo';
import { AppShell } from '../../../shared/layouts/AppShell';
import { confirmAction, showError, showSuccess } from '../../../shared/ui/alerts';

type Vehicle = {
  vehicle_id: string;
  lat: number;
  lng: number;
  created_at?: string;
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

type SimulationTraceItem = {
  id: number;
  vehicle_id: string;
  kind: 'normal' | 'duplicado' | 'error_formato';
  result: 'ok' | 'duplicado' | 'error_controlado' | 'error';
  note: string;
  status_code: number;
  timestamp: string;
};

type SimulationTraceResponse = {
  items: SimulationTraceItem[];
};

type SimulationProfileKey = 'soft' | 'medium' | 'high' | 'total';

type SimulationProfile = {
  key: SimulationProfileKey;
  label: string;
  ratio: number;
  description: string;
};

const SIMULATION_PROFILES: SimulationProfile[] = [
  { key: 'soft', label: 'Suave', ratio: 0.1, description: '10% de vehiculos activos' },
  { key: 'medium', label: 'Media', ratio: 0.3, description: '30% de vehiculos activos' },
  { key: 'high', label: 'Alta', ratio: 0.5, description: '50% de vehiculos activos' },
  { key: 'total', label: 'Total', ratio: 1, description: '100% de vehiculos activos' }
];

const defaultSimulationStatus: SimulationStatus = {
  running: false,
  selected_count: 0,
  tick_ms: 900,
  requests_sent: 0,
  errors_count: 0
};

export function SimulationPage() {
  usePageSeo({
    title: 'SMTF | Simulacion',
    description: 'Control y trazabilidad de la simulacion de telemetria de flota.'
  });

  const username = getUsername();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [simulationStatus, setSimulationStatus] = useState<SimulationStatus>(defaultSimulationStatus);
  const [isSimulationSubmitting, setIsSimulationSubmitting] = useState(false);
  const [isCreatingVehicles, setIsCreatingVehicles] = useState(false);
  const [isClearingDatabase, setIsClearingDatabase] = useState(false);
  const [isLoadingVehicles, setIsLoadingVehicles] = useState(false);
  const [lastCreateResult, setLastCreateResult] = useState<string>('');
  const [lastClearResult, setLastClearResult] = useState<string>('');
  const [traceItems, setTraceItems] = useState<SimulationTraceItem[]>([]);
  const [simulationProfile, setSimulationProfile] = useState<SimulationProfileKey>('soft');

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
    } catch {
      setSimulationStatus(defaultSimulationStatus);
    }
  };

  const loadSimulationTrace = async () => {
    try {
      const response = await fetch(`${VEHICLE_BASE_URL}/api/v1/simulation/trace`);
      if (!response.ok) {
        throw new Error('No fue posible consultar trazas de simulacion');
      }
      const data = (await response.json()) as SimulationTraceResponse;
      setTraceItems(data.items ?? []);
    } catch {
      setTraceItems([]);
    }
  };

  useEffect(() => {
    void loadSimulationStatus();
    void loadSimulationTrace();

    const interval = window.setInterval(() => {
      void loadSimulationStatus();
      void loadSimulationTrace();
    }, 2000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const onAdd200Vehicles = async () => {
    setIsCreatingVehicles(true);
    setLastCreateResult('');

    try {
      const response = await fetch(`${VEHICLE_BASE_URL}/api/v1/vehicles/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 200 })
      });

      if (!response.ok) {
        throw new Error('No fue posible crear vehiculos');
      }

      const data = (await response.json()) as { created?: number; total?: number };
      setLastCreateResult(`Creados: ${data.created ?? 0} | Total BD: ${data.total ?? 0}`);
      await showSuccess('Vehiculos creados', `Se agregaron ${data.created ?? 0} vehiculos. Total en BD: ${data.total ?? 0}.`);
      await loadVehicles();
    } catch {
      setLastCreateResult('Error creando vehiculos en base de datos');
      await showError('No se pudieron crear vehiculos', 'Verifica el estado del servicio y vuelve a intentar.');
    } finally {
      setIsCreatingVehicles(false);
    }
  };

  const onClearDatabase = async () => {
    const confirmed = await confirmAction({
      title: 'Limpiar base de datos',
      text: 'Esto borrara todos los vehiculos y posiciones historicas. Esta accion no se puede deshacer.',
      confirmText: 'Si, limpiar',
      cancelText: 'Cancelar'
    });
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

      setTraceItems([]);
      setLastCreateResult('');
      setLastClearResult('Base de datos limpiada: vehiculos y posiciones eliminados.');
      await showSuccess('Base de datos limpiada', 'Los vehiculos y posiciones historicas fueron eliminados correctamente.');

      await loadVehicles();
      await loadSimulationStatus();
    } catch {
      setLastClearResult('Error limpiando la base de datos');
      await showError('No se pudo limpiar la base de datos', 'Intenta nuevamente en unos segundos.');
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
          await showSuccess('Simulacion detenida', 'Se detuvo el envio de datos del simulador.');
        } else {
          if (vehicles.length === 0) {
            await showError('Sin vehiculos', 'Debes crear vehiculos en BD antes de iniciar la simulacion.');
            return;
          }

          const selectedProfile = SIMULATION_PROFILES.find((profile) => profile.key === simulationProfile) ?? SIMULATION_PROFILES[0];
          const selectedCount = Math.max(1, Math.round(vehicles.length * selectedProfile.ratio));

          const response = await fetch(`${VEHICLE_BASE_URL}/api/v1/simulation/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              selected_count: selectedCount,
              tick_ms: Math.max(simulationStatus.tick_ms || 1000, 1400)
            })
          });
          if (!response.ok) {
            throw new Error('No fue posible iniciar simulacion');
          }
          await showSuccess('Simulacion iniciada', `Se simularan ${selectedCount} vehiculos con perfil ${selectedProfile.label.toLowerCase()}.`);
        }

        await loadSimulationStatus();
        await loadSimulationTrace();
      } catch {
        await showError('Operacion de simulacion fallida', 'No fue posible completar la solicitud de simulacion.');
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

  const activeVehicles = simulationStatus.running ? simulationStatus.selected_count : 0;

  const selectedProfile = useMemo(
    () => SIMULATION_PROFILES.find((profile) => profile.key === simulationProfile) ?? SIMULATION_PROFILES[0],
    [simulationProfile]
  );

  const selectedVehiclesPreview = useMemo(() => {
    if (vehicles.length === 0) {
      return 0;
    }
    return Math.max(1, Math.round(vehicles.length * selectedProfile.ratio));
  }, [selectedProfile, vehicles.length]);

  const simulationRatio = useMemo(() => {
    if (vehicles.length <= 0) {
      return 0;
    }
    return Math.min(100, Math.round((activeVehicles / vehicles.length) * 100));
  }, [activeVehicles, vehicles.length]);

  const onExportLogs = () => {
    const header = ['vehiculo_id', 'tipo', 'resultado', 'nota', 'status_http', 'timestamp'];
    const rows = traceItems.map((item) => [
      item.vehicle_id,
      item.kind,
      item.result,
      item.note.replace(/\n/g, ' '),
      String(item.status_code || ''),
      item.timestamp
    ]);

    const csv = [header, ...rows]
      .map((cols) => cols.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `simulation-trace-${new Date().toISOString()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const barMetrics = useMemo(() => {
    const sample = traceItems.slice(0, 200);
    const metrics = [
      {
        key: 'requests',
        label: 'Peticiones',
        value: simulationStatus.requests_sent,
        tone: 'bg-sky-500'
      },
      {
        key: 'ok',
        label: 'Exito',
        value: sample.filter((item) => item.result === 'ok').length,
        tone: 'bg-emerald-500'
      },
      {
        key: 'duplicado',
        label: 'Duplicado',
        value: sample.filter((item) => item.result === 'duplicado').length,
        tone: 'bg-cyan-500'
      },
      {
        key: 'error_controlado',
        label: 'Error controlado',
        value: sample.filter((item) => item.result === 'error_controlado').length,
        tone: 'bg-amber-500'
      },
      {
        key: 'error',
        label: 'Error no controlado',
        value: sample.filter((item) => item.result === 'error').length,
        tone: 'bg-rose-500'
      }
    ];

    const maxValue = Math.max(1, ...metrics.map((item) => item.value));

    return metrics.map((item) => ({
      ...item,
      percent: Math.max(6, Math.round((item.value / maxValue) * 100))
    }));
  }, [traceItems, simulationStatus.requests_sent]);

  return (
    <AppShell
      headerRight={
        <div className="flex items-center">
          <div
            className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 ${simulationStatus.running ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800' : 'border-slate-300 bg-slate-100 text-slate-700'}`}
          >
            <span
              className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${simulationStatus.running ? 'bg-emerald-500/20 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}
            >
              <Activity className={`h-4 w-4 ${simulationStatus.running ? 'animate-pulse' : ''}`} />
            </span>
            <div className="leading-tight">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em]">Vehiculos activos</p>
              <p className="text-sm font-bold">{formatNumber(activeVehicles)}</p>
            </div>
          </div>
        </div>
      }
      navItems={getMainNavItems('/simulacion')}
      onLogout={onLogout}
      title="Modulo de Simulacion"
      username={username}
    >
      <section className="rounded-[28px] border border-outline-variant/20 bg-surface-container-lowest p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-headline text-3xl font-black tracking-tight text-slate-900">Modulo de Simulacion</h2>
            <p className="text-sm text-slate-500">{formatNumber(vehicles.length)} vehiculos activos en el entorno virtual.</p>
          </div>
          <div className="flex gap-2">
            <button
              className="rounded-xl border border-outline-variant/35 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 transition hover:border-primary/70 hover:text-slate-900"
              onClick={onExportLogs}
              type="button"
            >
              Exportar Logs
            </button>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          <MetricCard icon="database" label="Total BD" value={formatNumber(vehicles.length)} hint="Flota registrada" />
          <MetricCard icon="settings_input_component" label="Simulando" value={formatNumber(activeVehicles)} hint={`${simulationRatio}% cargado`} />
          <MetricCard icon="send" label="Requests" value={formatCompact(simulationStatus.requests_sent)} hint="Ultimos ciclos" />
          <MetricCard icon="warning" label="Errores" value={formatNumber(simulationStatus.errors_count)} hint="Critico" tone="danger" />
          <MetricCard icon="schedule" label="Tick" value={`${simulationStatus.tick_ms || 1000}ms`} hint="Controlado" />
          <MetricCard icon="hub" label="Estado" value={simulationStatus.running ? 'Online' : 'Idle'} hint={simulationStatus.started_at ? new Date(simulationStatus.started_at).toLocaleTimeString() : 'Sin iniciar'} tone={simulationStatus.running ? 'ok' : 'neutral'} />
        </div>

        <div className="grid grid-cols-12 gap-4">
          <aside className="col-span-12 space-y-4 xl:col-span-3">
            <article className="rounded-2xl border border-outline-variant/25 bg-white p-4 shadow-sm">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Gestion de Flota</p>
              <button
                className="w-full rounded-lg bg-slate-100 px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
                disabled={isCreatingVehicles}
                onClick={onAdd200Vehicles}
              >
                {isCreatingVehicles ? 'Creando...' : 'Crear Vehiculos'}
              </button>
              <button
                className="mt-2 w-full rounded-lg bg-slate-100 px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
                disabled={isLoadingVehicles}
                onClick={() => void loadVehicles()}
              >
                {isLoadingVehicles ? 'Actualizando...' : 'Actualizar Lista'}
              </button>
              <button
                className="mt-4 w-full rounded-lg border border-rose-300/80 px-3 py-2 text-left text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
                disabled={isClearingDatabase}
                onClick={() => void onClearDatabase()}
              >
                {isClearingDatabase ? 'Limpiando...' : 'Reiniciar Base de Datos'}
              </button>
            </article>

            <article className="rounded-2xl border border-outline-variant/25 bg-white p-4 shadow-sm">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Configuracion</p>
              <div className="space-y-3">
                <div>
                  <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase text-slate-400">
                    <span>Perfil de simulacion</span>
                    <span>{simulationStatus.running ? `${formatNumber(simulationStatus.selected_count)} activos` : `${formatNumber(selectedVehiclesPreview)} estimados`}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {SIMULATION_PROFILES.map((profile) => {
                      const isActive = simulationProfile === profile.key;
                      return (
                        <button
                          key={profile.key}
                          className={`rounded-xl border px-3 py-2 text-left transition ${isActive ? 'border-teal-300 bg-teal-50 text-teal-700 shadow-sm' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white'}`}
                          disabled={simulationStatus.running}
                          onClick={() => setSimulationProfile(profile.key)}
                          type="button"
                        >
                          <p className="text-xs font-bold uppercase tracking-wide">{profile.label}</p>
                          <p className="text-[10px] opacity-75">{profile.description}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase text-slate-400">
                    <span>Frecuencia de refresco</span>
                    <span>{simulationStatus.tick_ms || 1000}ms</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div className="h-full w-[50%] rounded-full bg-primary" />
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase text-slate-400">
                    <span>Nivel de caos</span>
                    <span>15%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div className="h-full w-[15%] rounded-full bg-rose-400" />
                  </div>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-slate-500">Perfil actual: {selectedProfile.description}. Caos activo: 10% duplicados y 5% payload invalido.</p>
              <button
                className={`mt-4 w-full rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-65 ${simulationStatus.running ? 'border border-rose-300/80 bg-rose-50 text-rose-600 hover:bg-rose-100' : 'bg-primary text-on-primary hover:opacity-90'}`}
                disabled={isSimulationSubmitting || (!simulationStatus.running && vehicles.length === 0)}
                onClick={(event) => {
                  event.preventDefault();
                  const fake = { preventDefault: () => undefined } as FormEvent;
                  onSubmit(fake);
                }}
                type="button"
              >
                {simulationStatus.running ? 'Detener Simulacion' : 'Iniciar Simulacion'}
              </button>
            </article>
          </aside>

          <div className="col-span-12 space-y-4 xl:col-span-9">
            <article className="rounded-2xl border border-outline-variant/25 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Grafico de barras en tiempo real</p>
                <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">{simulationStatus.running ? 'Stream activo' : 'Stream en pausa'}</span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="space-y-3">
                  {barMetrics.map((metric) => (
                    <div key={metric.key}>
                      <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-600">
                        <span>{metric.label}</span>
                        <span>{formatNumber(metric.value)}</span>
                      </div>
                      <div className="h-4 overflow-hidden rounded-md bg-white">
                        <div className={`h-full rounded-md ${metric.tone}`} style={{ width: `${metric.percent}%` }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex items-center justify-end gap-2 text-xs text-slate-500">
                  <span className="rounded bg-white px-2 py-1 shadow-sm">Muestra: {traceItems.length > 200 ? 'ultimos 200' : `ultimos ${traceItems.length}`}</span>
                  <span className="rounded bg-white px-2 py-1 shadow-sm">{simulationStatus.running ? 'ingiriendo' : 'idle'}</span>
                </div>
              </div>
            </article>

            <article className="rounded-2xl border border-outline-variant/25 bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-headline text-xl font-bold text-slate-900">Log de Trazas Recientes</h3>
                  <p className="text-xs text-slate-500">Monitoreo de flujo de eventos HTTP y simulacion.</p>
                </div>
                <div className="rounded-full border border-outline-variant/30 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">Ultimos {traceItems.length}</div>
              </div>

              <div className="h-[420px] overflow-y-auto overflow-x-auto rounded-xl border border-outline-variant/20">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Vehiculo</th>
                      <th className="px-4 py-3">Tipo de evento</th>
                      <th className="px-4 py-3">Resultado</th>
                      <th className="px-4 py-3">Nota</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {traceItems.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3 font-semibold text-slate-700">{item.vehicle_id}</td>
                        <td className="px-4 py-3 text-slate-600">{formatTraceKind(item.kind)}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${traceResultBadge(item.result)}`}>
                            {formatTraceResult(item.result)}
                          </span>
                        </td>
                        <td className="max-w-[340px] truncate px-4 py-3 text-slate-500" title={item.note}>{item.note}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${traceHttpBadge(item.status_code)}`}>
                            {item.status_code || '--'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500">{new Date(item.timestamp).toLocaleTimeString()}</td>
                      </tr>
                    ))}
                    {traceItems.length === 0 ? (
                      <tr>
                        <td className="px-4 py-12 text-center text-sm text-slate-400" colSpan={6}>
                          Sin trazas por ahora. Inicia simulacion para ver eventos en tiempo real.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              {simulationStatus.last_error ? (
                <div className="mt-3 rounded-xl border border-rose-300/60 bg-rose-50 p-3 text-xs text-rose-700">
                  Ultimo error backend: {simulationStatus.last_error}
                </div>
              ) : null}
            </article>
          </div>
        </div>

        {(lastCreateResult || lastClearResult) ? (
          <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
            {lastCreateResult ? <p className="rounded-xl border border-outline-variant/20 bg-white p-3 text-xs text-slate-600">{lastCreateResult}</p> : null}
            {lastClearResult ? <p className="rounded-xl border border-outline-variant/20 bg-white p-3 text-xs text-slate-600">{lastClearResult}</p> : null}
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}

function formatCompact(value: number): string {
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return `${value}`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('es-CO').format(value);
}

function formatTraceKind(kind: SimulationTraceItem['kind']): string {
  if (kind === 'duplicado') {
    return 'Heartbeat_Sync';
  }
  if (kind === 'error_formato') {
    return 'Payload_Invalido';
  }
  return 'Telemetry_Update';
}

function formatTraceResult(result: SimulationTraceItem['result']): string {
  if (result === 'ok') {
    return 'Exito';
  }
  if (result === 'duplicado') {
    return 'Duplicado';
  }
  if (result === 'error_controlado') {
    return 'Advertencia';
  }
  return 'Error';
}

function traceResultBadge(result: SimulationTraceItem['result']): string {
  if (result === 'ok') {
    return 'bg-emerald-100 text-emerald-700';
  }
  if (result === 'duplicado') {
    return 'bg-sky-100 text-sky-700';
  }
  if (result === 'error_controlado') {
    return 'bg-amber-100 text-amber-700';
  }
  return 'bg-rose-100 text-rose-700';
}

function traceHttpBadge(statusCode: number): string {
  if (statusCode >= 200 && statusCode < 300) {
    return 'bg-emerald-100 text-emerald-700';
  }
  if (statusCode >= 400) {
    return 'bg-rose-100 text-rose-700';
  }
  return 'bg-slate-100 text-slate-600';
}

function MetricCard({
  icon,
  label,
  value,
  hint,
  tone = 'neutral'
}: {
  icon: string;
  label: string;
  value: string;
  hint: string;
  tone?: 'neutral' | 'ok' | 'danger';
}) {
  const toneClasses = tone === 'ok'
    ? 'text-emerald-700'
    : tone === 'danger'
      ? 'text-rose-700'
      : 'text-slate-800';

  return (
    <div className="rounded-2xl border border-outline-variant/20 bg-white p-3 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <MetricIcon name={icon} />
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</span>
      </div>
      <div className={`text-2xl font-black tracking-tight ${toneClasses}`}>{value}</div>
      <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">{hint}</div>
    </div>
  );
}

function MetricIcon({ name }: { name: string }) {
  const cls = 'h-4 w-4 text-slate-400';

  if (name === 'database') {
    return <Database className={cls} />;
  }
  if (name === 'settings_input_component') {
    return <Activity className={cls} />;
  }
  if (name === 'send') {
    return <Send className={cls} />;
  }
  if (name === 'warning') {
    return <AlertTriangle className={cls} />;
  }
  if (name === 'schedule') {
    return <Timer className={cls} />;
  }
  if (name === 'hub') {
    return <Radio className={cls} />;
  }

  return <Activity className={cls} />;
}
