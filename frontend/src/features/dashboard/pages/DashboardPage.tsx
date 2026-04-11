import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { clearSession, getUsername } from '../../auth/services/authService';
import { POSITIONS_WS_URL, VEHICLE_BASE_URL } from '../../../shared/config/runtime';
import { AppShell } from '../../../shared/layouts/AppShell';
import { VehicleTableRow, VehiclesDataTable } from '../components/VehiclesDataTable';

type PositionEvent = {
  vehicle_id: string;
  lat: number;
  lng: number;
  speed_kmh?: number;
  location?: {
    name?: string;
    display_name?: string;
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    state?: string;
    country?: string;
  };
  recorded_at: string;
};

type VehicleCatalog = {
  vehicle_id: string;
  lat: number;
  lng: number;
  status: string;
  created_at: string;
};

type VehiclesResponse = {
  vehicles: VehicleCatalog[];
  total: number;
};

export function DashboardPage() {
  const username = getUsername();
  const [wsConnected, setWsConnected] = useState(false);
  const [events, setEvents] = useState<PositionEvent[]>([]);
  const [vehiclesCatalog, setVehiclesCatalog] = useState<VehicleCatalog[]>([]);

  const loadVehiclesCatalog = async () => {
    try {
      const response = await fetch(`${VEHICLE_BASE_URL}/api/v1/vehicles`);
      if (!response.ok) {
        throw new Error('No fue posible consultar vehiculos');
      }
      const data = (await response.json()) as VehiclesResponse;
      setVehiclesCatalog(data.vehicles ?? []);
    } catch {
      setVehiclesCatalog([]);
    }
  };

  useEffect(() => {
    void loadVehiclesCatalog();

    const interval = window.setInterval(() => {
      void loadVehiclesCatalog();
    }, 8000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const ws = new WebSocket(POSITIONS_WS_URL);

    ws.onopen = () => setWsConnected(true);
    ws.onerror = () => setWsConnected(false);
    ws.onclose = () => setWsConnected(false);
    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as PositionEvent;
        setEvents((prev) => [payload, ...prev].slice(0, 300));
      } catch {
        // noop
      }
    };

    return () => ws.close();
  }, []);

  const latestByVehicleMap = useMemo(() => {
    const map = new Map<string, PositionEvent>();
    for (const item of events) {
      if (!map.has(item.vehicle_id)) {
        map.set(item.vehicle_id, item);
      }
    }
    return map;
  }, [events]);

  const allVehicles = useMemo<VehicleTableRow[]>(() => {
    return vehiclesCatalog.map((vehicle) => {
      const latestEvent = latestByVehicleMap.get(vehicle.vehicle_id);
      const locationLabel = latestEvent?.location?.display_name || latestEvent?.location?.name || latestEvent?.location?.city || 'Sin ubicacion';
      return {
        vehicle_id: vehicle.vehicle_id,
        lat: latestEvent?.lat ?? vehicle.lat,
        lng: latestEvent?.lng ?? vehicle.lng,
        status: vehicle.status,
        speed_kmh: latestEvent?.speed_kmh ?? 0,
        location_label: locationLabel,
        last_reported_at: latestEvent?.recorded_at,
        isReporting: Boolean(latestEvent)
      };
    });
  }, [vehiclesCatalog, latestByVehicleMap]);

  const markers = useMemo(() => allVehicles.slice(0, 400), [allVehicles]);
  const mapCenter = useMemo<[number, number]>(() => [4.7110, -74.0721], []);

  const onLogout = () => {
    clearSession();
    window.location.href = '/login';
  };

  return (
    <AppShell
      headerRight={
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full px-2 py-1 text-xs font-semibold ${
              wsConnected ? 'bg-secondary-container text-on-secondary-container' : 'bg-error-container text-on-error-container'
            }`}
          >
            {wsConnected ? 'WS online' : 'WS offline'}
          </span>
          <span>Vehiculos totales: {allVehicles.length}</span>
        </div>
      }
      navItems={[
        { to: '/', label: 'Dashboard', icon: 'map', subtitle: 'Mapa en tiempo real', active: true },
        { to: '/simulacion', label: 'Simulacion', icon: 'smart_toy', subtitle: 'Generador de flota' }
      ]}
      onLogout={onLogout}
      statusLabel="WebSocket"
      statusOk={wsConnected}
      statusValue={wsConnected ? 'conectado' : 'desconectado'}
      title="Fleet Dashboard"
      username={username}
    >
          <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            <KpiCard label="Eventos recibidos" value={events.length} extra="WebSocket" />
            <KpiCard label="Vehiculos en mapa" value={allVehicles.length} extra="reporten o no" />
            <KpiCard label="Ultimo update" value={events[0] ? new Date(events[0].recorded_at).toLocaleTimeString() : '--'} extra="timestamp" />
          </div>

          <div className="grid grid-cols-12 gap-8">
            <div className="col-span-12 xl:col-span-8">
              <div className="brand-shadow relative h-[580px] w-full overflow-hidden rounded-2xl border border-outline-variant/10 bg-slate-200">
                <MapContainer center={mapCenter} className="h-full w-full" scrollWheelZoom zoom={12}>
                  <TileLayer
                    attribution='&copy; OpenStreetMap contributors &copy; CARTO'
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                  />

                  {markers.map((vehicle) => (
                    <CircleMarker
                      key={vehicle.vehicle_id}
                      center={[vehicle.lat, vehicle.lng]}
                      fillColor={vehicle.isReporting ? '#0053db' : '#64748b'}
                      fillOpacity={vehicle.isReporting ? 0.85 : 0.55}
                      pathOptions={{ color: '#ffffff', weight: 1.5 }}
                      radius={vehicle.isReporting ? 7 : 5}
                    >
                      <Popup>
                        <div className="text-xs">
                          <div className="font-semibold">{vehicle.vehicle_id}</div>
                          <div>
                            {vehicle.lat.toFixed(5)}, {vehicle.lng.toFixed(5)}
                          </div>
                          <div>Velocidad: {(vehicle.speed_kmh ?? 0).toFixed(1)} km/h</div>
                          <div>Ubicacion: {vehicle.location_label || 'Sin ubicacion'}</div>
                          <div>Estado: {vehicle.status}</div>
                          <div>{vehicle.last_reported_at ? `Ultimo reporte: ${new Date(vehicle.last_reported_at).toLocaleString()}` : 'Sin reporte reciente'}</div>
                        </div>
                      </Popup>
                    </CircleMarker>
                  ))}
                </MapContainer>

                <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3">
                  <div className="rounded-full bg-surface/90 px-3 py-1 text-xs font-medium text-on-surface shadow">
                    Capa carreteras activa
                  </div>
                </div>

                {allVehicles.length === 0 ? (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-medium text-on-surface-variant">
                    Sin vehiculos en base de datos. Ve a Simulacion y crea flota.
                  </div>
                ) : null}
              </div>
            </div>

            <div className="col-span-12 flex flex-col gap-4 xl:col-span-4">
              <h3 className="font-headline text-lg font-bold tracking-tight">Feed reciente</h3>
              <div className="max-h-[580px] overflow-auto rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-3">
                {events.slice(0, 40).map((event) => (
                  <div key={`${event.vehicle_id}-${event.recorded_at}`} className="mb-2 rounded-lg border border-outline-variant/10 bg-surface p-3">
                    <div className="text-sm font-semibold">{event.vehicle_id}</div>
                    <div className="text-xs text-on-surface-variant">
                      {event.lat.toFixed(5)}, {event.lng.toFixed(5)}
                    </div>
                    <div className="text-[11px] text-on-surface-variant">Velocidad: {(event.speed_kmh ?? 0).toFixed(1)} km/h</div>
                    <div className="text-[11px] text-on-surface-variant">Ubicacion: {event.location?.display_name || event.location?.name || event.location?.city || 'Sin ubicacion'}</div>
                    <div className="text-[11px] text-on-surface-variant">{new Date(event.recorded_at).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-10">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-headline text-2xl font-bold tracking-tight">Tabla de dispositivos</h3>
              <Link className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-on-primary" to="/simulacion">
                Abrir simulador
              </Link>
            </div>

            <VehiclesDataTable rows={allVehicles} />
          </div>
    </AppShell>
  );
}

function KpiCard({ label, value, extra }: { label: string; value: number | string; extra: string }) {
  return (
    <div className="rounded-2xl border border-outline-variant/15 bg-surface-container-low p-5">
      <div className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">{label}</div>
      <div className="mt-2 text-3xl font-bold tracking-tighter text-on-surface">{value}</div>
      <div className="text-xs text-on-surface-variant">{extra}</div>
    </div>
  );
}
