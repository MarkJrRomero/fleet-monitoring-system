import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';
import { useMap } from 'react-leaflet/hooks';
import MarkerClusterGroup from 'react-leaflet-cluster';
import 'leaflet/dist/leaflet.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css';
import { clearSession, getUsername } from '../../auth/services/authService';
import { POSITIONS_WS_URL, VEHICLE_BASE_URL } from '../../../shared/config/runtime';
import { StyledSelect, type SelectOption } from '../../../shared/components/StyledSelect';
import { AppShell } from '../../../shared/layouts/AppShell';
import { getVehicleMapColor, getVehicleStatusLabel } from '../utils/vehicleStatus';

type AlertEvent = {
  type: string;
  vehicle_id: string;
  lat: number;
  lng: number;
  detected_at: string;
  message?: string;
};

type PositionEvent = {
  vehicle_id: string;
  lat: number;
  lng: number;
  speed_kmh?: number;
  status?: string;
  panic_button?: boolean;
  alert?: AlertEvent;
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
  imei?: string;
  lat: number;
  lng: number;
  status: string;
  created_at: string;
};

type VehiclesResponse = {
  vehicles: VehicleCatalog[];
  total: number;
};

type DashboardVehicle = {
  vehicle_id: string;
  imei: string;
  lat: number;
  lng: number;
  status: string;
  speed_kmh: number;
  location_label: string;
  last_reported_at?: string;
  latest_alert_type?: string;
  latest_alert_message?: string;
  latest_alert_at?: string;
  isReporting: boolean;
};

const VEHICLES_PAGE_SIZE = 30;
const VEHICLE_PIN_RADIUS = 9;
const STATUS_PRIORITY_OPTIONS: SelectOption[] = [
  { value: 'all', label: 'Prioridad: Todos' },
  { value: 'overspeed', label: 'Primero Exceso de velocidad' },
  { value: 'stopped', label: 'Primero Detenidos' },
  { value: 'panic', label: 'Primero Boton de panico' },
  { value: 'online', label: 'Primero Online' },
  { value: 'with_alert', label: 'Primero Con alerta activa' }
];

function normalizeAlertType(type?: string): string {
  return (type || '').trim().toLowerCase();
}

function statusFromAlert(type?: string, fallback?: string): string {
  const normalized = normalizeAlertType(type);
  if (normalized === 'vehiculo detenido') {
    return 'stopped';
  }
  if (normalized === 'exceso de velocidad') {
    return 'overspeed';
  }
  if (normalized === 'boton de panico') {
    return 'panic';
  }
  return fallback || 'unknown';
}

function getMapBadgeStyle(status?: string): React.CSSProperties {
  return {
    backgroundColor: getVehicleMapColor(status),
    color: '#ffffff'
  };
}

function FocusMapOnVehicle({ target }: { target: [number, number] | null }) {
  const map = useMap();

  useEffect(() => {
    if (!target) {
      return;
    }

    const maxZoom = map.getMaxZoom();
    const zoomToUse = Number.isFinite(maxZoom) ? maxZoom : 19;
    map.flyTo(target, zoomToUse, { duration: 0.8 });
  }, [map, target]);

  return null;
}

function AnimatedVehicleMarker({
  vehicle,
  selected
}: {
  vehicle: DashboardVehicle;
  selected: boolean;
}) {
  const [displayPosition, setDisplayPosition] = useState<[number, number]>([vehicle.lat, vehicle.lng]);
  const currentPositionRef = useRef<[number, number]>([vehicle.lat, vehicle.lng]);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const from = currentPositionRef.current;
    const to: [number, number] = [vehicle.lat, vehicle.lng];

    const deltaLat = Math.abs(to[0] - from[0]);
    const deltaLng = Math.abs(to[1] - from[1]);
    if (deltaLat < 0.0000001 && deltaLng < 0.0000001) {
      return;
    }

    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
    }

    const start = performance.now();
    const duration = 900;

    const step = (timestamp: number) => {
      const progress = Math.min((timestamp - start) / duration, 1);
      const eased = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      const next: [number, number] = [
        from[0] + (to[0] - from[0]) * eased,
        from[1] + (to[1] - from[1]) * eased
      ];

      currentPositionRef.current = next;
      setDisplayPosition(next);

      if (progress < 1) {
        frameRef.current = window.requestAnimationFrame(step);
      } else {
        frameRef.current = null;
      }
    };

    frameRef.current = window.requestAnimationFrame(step);

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [vehicle.lat, vehicle.lng]);

  return (
    <CircleMarker
      center={displayPosition}
      fillColor={getVehicleMapColor(vehicle.status)}
      fillOpacity={vehicle.isReporting ? 0.88 : 0.64}
      pathOptions={{ color: selected ? '#00F1C6' : '#ffffff', weight: 1.8 }}
      radius={VEHICLE_PIN_RADIUS}
    >
      <Popup>
        <div className="text-xs text-slate-900">
          <div className="font-semibold">{vehicle.vehicle_id}</div>
          <div>IMEI: {vehicle.imei}</div>
          <div>
            {vehicle.lat.toFixed(5)}, {vehicle.lng.toFixed(5)}
          </div>
          <div>Velocidad: {(vehicle.speed_kmh ?? 0).toFixed(1)} km/h</div>
          <div>Ubicacion: {vehicle.location_label || 'Sin ubicacion'}</div>
          <div>Estado: {getVehicleStatusLabel(vehicle.status)}</div>
          <div>{vehicle.last_reported_at ? `Ultimo reporte: ${new Date(vehicle.last_reported_at).toLocaleString()}` : 'Sin reporte reciente'}</div>
        </div>
      </Popup>
    </CircleMarker>
  );
}

export function DashboardPage() {
  const username = getUsername();
  const [events, setEvents] = useState<PositionEvent[]>([]);
  const [vehiclesCatalog, setVehiclesCatalog] = useState<VehicleCatalog[]>([]);
  const [visibleCount, setVisibleCount] = useState(VEHICLES_PAGE_SIZE);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [focusedPosition, setFocusedPosition] = useState<[number, number] | null>(null);
  const [statusPriority, setStatusPriority] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isPositionsWsConnected, setIsPositionsWsConnected] = useState(false);
  const [flashingVehicleIds, setFlashingVehicleIds] = useState<Set<string>>(new Set());
  const previousVehicleSnapshotRef = useRef<Map<string, string>>(new Map());
  const flashTimeoutsRef = useRef<Map<string, number>>(new Map());
  const alertsContainerRef = useRef<HTMLDivElement | null>(null);

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

    ws.onopen = () => {
      setIsPositionsWsConnected(true);
    };

    ws.onerror = () => {
      setIsPositionsWsConnected(false);
    };

    ws.onclose = () => {
      setIsPositionsWsConnected(false);
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as PositionEvent;
        setEvents((prev) => [payload, ...prev].slice(0, 300));
      } catch {
        // noop
      }
    };

    return () => {
      setIsPositionsWsConnected(false);
      ws.close();
    };
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

  const allVehicles = useMemo<DashboardVehicle[]>(() => {
    return vehiclesCatalog.map((vehicle) => {
      const latestEvent = latestByVehicleMap.get(vehicle.vehicle_id);
      const latestAlert = latestEvent?.alert;
      const locationLabel = latestEvent?.location?.display_name || latestEvent?.location?.name || latestEvent?.location?.city || 'Sin ubicacion';
      const status = latestAlert
        ? statusFromAlert(latestAlert.type, vehicle.status)
        : latestEvent?.status
          ? latestEvent.status
        : latestEvent?.panic_button
          ? 'panic'
          : (latestEvent?.speed_kmh ?? 0) > 100
            ? 'overspeed'
            : vehicle.status;
      return {
        vehicle_id: vehicle.vehicle_id,
        imei: vehicle.imei || '--',
        lat: latestEvent?.lat ?? vehicle.lat,
        lng: latestEvent?.lng ?? vehicle.lng,
        status,
        speed_kmh: latestEvent?.speed_kmh ?? 0,
        location_label: locationLabel,
        last_reported_at: latestEvent?.recorded_at,
        latest_alert_type: latestAlert?.type,
        latest_alert_message: latestAlert?.message,
        latest_alert_at: latestAlert?.detected_at,
        isReporting: Boolean(latestEvent)
      };
    });
  }, [vehiclesCatalog, latestByVehicleMap]);

  useEffect(() => {
    const nextSnapshot = new Map<string, string>();
    const changedIds: string[] = [];

    for (const vehicle of allVehicles) {
      const signature = [
        vehicle.status,
        vehicle.last_reported_at || '',
        vehicle.latest_alert_at || '',
        vehicle.latest_alert_type || ''
      ].join('|');

      nextSnapshot.set(vehicle.vehicle_id, signature);

      const previous = previousVehicleSnapshotRef.current.get(vehicle.vehicle_id);
      if (previous && previous !== signature) {
        changedIds.push(vehicle.vehicle_id);
      }
    }

    previousVehicleSnapshotRef.current = nextSnapshot;

    if (changedIds.length === 0) {
      return;
    }

    setFlashingVehicleIds((prev) => {
      const next = new Set(prev);
      for (const id of changedIds) {
        next.add(id);
      }
      return next;
    });

    for (const id of changedIds) {
      const existingTimeout = flashTimeoutsRef.current.get(id);
      if (existingTimeout) {
        window.clearTimeout(existingTimeout);
      }

      const timeoutId = window.setTimeout(() => {
        setFlashingVehicleIds((prev) => {
          if (!prev.has(id)) {
            return prev;
          }
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        flashTimeoutsRef.current.delete(id);
      }, 850);

      flashTimeoutsRef.current.set(id, timeoutId);
    }
  }, [allVehicles]);

  useEffect(() => {
    return () => {
      flashTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      flashTimeoutsRef.current.clear();
    };
  }, []);

  const filteredVehicles = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) {
      return allVehicles;
    }

    return allVehicles.filter((vehicle) => {
      return vehicle.vehicle_id.toLowerCase().includes(query) || vehicle.imei.toLowerCase().includes(query);
    });
  }, [allVehicles, searchTerm]);

  const sortedVehicles = useMemo(() => {
    const priorityScore = (vehicle: DashboardVehicle): number => {
      if (statusPriority === 'all') {
        return 0;
      }
      if (statusPriority === 'with_alert') {
        return vehicle.latest_alert_type ? 0 : 1;
      }
      return vehicle.status === statusPriority ? 0 : 1;
    };

    return [...filteredVehicles].sort((a, b) => {
      if (selectedVehicleId) {
        if (a.vehicle_id === selectedVehicleId && b.vehicle_id !== selectedVehicleId) {
          return -1;
        }
        if (b.vehicle_id === selectedVehicleId && a.vehicle_id !== selectedVehicleId) {
          return 1;
        }
      }

      const psA = priorityScore(a);
      const psB = priorityScore(b);
      if (psA !== psB) {
        return psA - psB;
      }

      const at = a.latest_alert_at ? new Date(a.latest_alert_at).getTime() : 0;
      const bt = b.latest_alert_at ? new Date(b.latest_alert_at).getTime() : 0;
      if (bt !== at) {
        return bt - at;
      }
      return a.vehicle_id.localeCompare(b.vehicle_id);
    });
  }, [filteredVehicles, statusPriority, selectedVehicleId]);

  useEffect(() => {
    setVisibleCount((prev) => {
      if (sortedVehicles.length === 0) {
        return VEHICLES_PAGE_SIZE;
      }
      return Math.min(Math.max(prev, VEHICLES_PAGE_SIZE), sortedVehicles.length);
    });
  }, [sortedVehicles.length]);

  const visibleVehicles = useMemo(() => sortedVehicles.slice(0, visibleCount), [sortedVehicles, visibleCount]);

  const alertSummary = useMemo(() => {
    let stopped = 0;
    let activeAlerts = 0;

    for (const vehicle of allVehicles) {
      if (vehicle.latest_alert_type) {
        activeAlerts += 1;
      }
      if (vehicle.status === 'stopped') {
        stopped += 1;
      }
    }

    const summary = {
      total: activeAlerts,
      stopped
    };
    return summary;
  }, [allVehicles]);

  const markers = useMemo(() => allVehicles.slice(0, 400), [allVehicles]);
  const mapCenter = useMemo<[number, number]>(() => [4.7110, -74.0721], []);
  const isWsConnected = isPositionsWsConnected;

  const onAlertsScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (remaining > 120) {
      return;
    }

    setVisibleCount((prev) => Math.min(prev + VEHICLES_PAGE_SIZE, sortedVehicles.length));
  };

  const onVehicleCardClick = (vehicle: DashboardVehicle) => {
    setSelectedVehicleId((prev) => {
      if (prev === vehicle.vehicle_id) {
        setFocusedPosition(null);
        return null;
      }

      setFocusedPosition([vehicle.lat, vehicle.lng]);
      alertsContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      return vehicle.vehicle_id;
    });
  };

  const onLogout = () => {
    clearSession();
    window.location.href = '/login';
  };

  return (
    <AppShell
      title="Fleet Dashboard"
      username={username}
      navItems={[
        { to: '/', label: 'Dashboard', icon: 'home', subtitle: 'Alertas y mapa', active: true },
        { to: '/vehiculos', label: 'Vehiculos', icon: 'directions_car', subtitle: 'Tabla y creacion' },
        { to: '/simulacion', label: 'Simulacion', icon: 'smart_toy', subtitle: 'Generador de flota' }
      ]}
      headerRight={
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-surface-container px-3 py-1">Vehiculos: {allVehicles.length}</span>
          <span className="rounded-full bg-surface-container px-3 py-1">Alertas: {alertSummary.total}</span>
          <span className="rounded-full bg-surface-container px-3 py-1">Detenidos: {alertSummary.stopped}</span>
        </div>
      }
      onLogout={onLogout}
    >
      <section className="h-[calc(100vh-110px)] overflow-hidden rounded-[22px] border border-outline-variant/15 bg-surface-container-low p-4 md:p-6">
        <div className="grid h-full min-h-0 grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="min-h-0 xl:col-span-5 xl:h-full">
            <article className="flex h-full min-h-0 max-h-full flex-col rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-headline text-xl font-bold">Alertas activas</h2>
              </div>

              <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <StyledSelect options={STATUS_PRIORITY_OPTIONS} value={statusPriority} onChange={setStatusPriority} />

                <input
                  className="w-full rounded-lg border border-outline-variant/25 bg-surface px-3 py-2 text-xs text-on-surface"
                  placeholder="Buscar por placa o IMEI"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>

              <div ref={alertsContainerRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1" onScroll={onAlertsScroll}>
                {allVehicles.length === 0 ? (
                  <div className="rounded-xl border border-outline-variant/20 bg-surface p-4 text-sm text-on-surface-variant">Sin vehiculos en catalogo.</div>
                ) : (
                  visibleVehicles.map((vehicle) => (
                    <div key={vehicle.vehicle_id}>
                      <button
                        className={`w-full overflow-hidden rounded-xl border bg-gradient-to-br from-surface to-surface-container-low p-3 text-left transition-colors duration-500 hover:border-primary/60 ${selectedVehicleId === vehicle.vehicle_id ? 'border-primary/80 ring-1 ring-primary/40' : 'border-outline-variant/20'} ${flashingVehicleIds.has(vehicle.vehicle_id) ? 'bg-violet-100/70 border-violet-400' : ''}`}
                        onClick={() => onVehicleCardClick(vehicle)}
                        type="button"
                      >
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-base font-bold text-on-surface" title={vehicle.vehicle_id}>{vehicle.vehicle_id}</p>
                            <p className="truncate text-[11px] text-on-surface-variant" title={`IMEI: ${vehicle.imei}`}>IMEI: {vehicle.imei}</p>
                          </div>

                          <span
                            className="shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider"
                            style={getMapBadgeStyle(vehicle.status)}
                            title={vehicle.latest_alert_type || getVehicleStatusLabel(vehicle.status)}
                          >
                            {vehicle.latest_alert_type || getVehicleStatusLabel(vehicle.status)}
                          </span>
                        </div>

                        <p
                          className="mt-1 max-h-10 overflow-hidden text-xs leading-5 text-on-surface-variant"
                          title={vehicle.latest_alert_message || vehicle.location_label || 'Sin novedades de alerta'}
                        >
                          {vehicle.latest_alert_message || vehicle.location_label || 'Sin novedades de alerta'}
                        </p>

                        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-on-surface-variant">
                          <div className="min-w-0 rounded-lg bg-surface-container px-2 py-1">
                            <p className="text-[10px] uppercase tracking-wide">Velocidad</p>
                            <p className="truncate font-medium">{(vehicle.speed_kmh ?? 0).toFixed(1)} km/h</p>
                          </div>
                          <div className="min-w-0 rounded-lg bg-surface-container px-2 py-1">
                            <p className="text-[10px] uppercase tracking-wide">Conexion</p>
                            <p className="truncate font-medium">{vehicle.isReporting ? 'En linea' : 'Sin senal'}</p>
                          </div>
                        </div>

                        <p className="mt-2 truncate text-[11px] text-on-surface-variant" title={`${vehicle.lat.toFixed(5)}, ${vehicle.lng.toFixed(5)}`}>
                          {vehicle.lat.toFixed(5)}, {vehicle.lng.toFixed(5)}
                        </p>

                        <p className="text-[11px] text-on-surface-variant">
                          {vehicle.latest_alert_at
                            ? `Alerta: ${new Date(vehicle.latest_alert_at).toLocaleString()}`
                            : 'Monitoreo en tiempo real'}
                        </p>
                      </button>

                      {selectedVehicleId === vehicle.vehicle_id ? (
                        <div className="my-3 border-t-2 border-dashed border-primary/45" />
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </article>
          </div>

          <article className="min-h-0 rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-3 xl:col-span-7 xl:h-full">
            <div className="relative h-[420px] min-h-0 overflow-hidden rounded-xl border border-outline-variant/20 xl:h-full">
              <MapContainer center={mapCenter} className="h-full w-full" scrollWheelZoom zoom={12}>
                <FocusMapOnVehicle target={focusedPosition} />
                <TileLayer
                  attribution='&copy; OpenStreetMap contributors &copy; CARTO'
                  url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                />

                <MarkerClusterGroup chunkedLoading maxClusterRadius={52} spiderfyOnMaxZoom showCoverageOnHover={false}>
                  {markers.map((vehicle) => (
                    <AnimatedVehicleMarker
                      key={`${vehicle.vehicle_id}-${vehicle.status}`}
                      selected={selectedVehicleId === vehicle.vehicle_id}
                      vehicle={vehicle}
                    />
                  ))}
                </MarkerClusterGroup>
              </MapContainer>

              <div className="absolute right-3 top-3 rounded-full bg-surface/85 p-2">
                <span className="relative inline-flex h-2.5 w-2.5">
                  <span className={`absolute inline-flex h-full w-full rounded-full opacity-70 ${isWsConnected ? 'animate-ping bg-emerald-400' : 'animate-ping bg-rose-400'}`} />
                  <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${isWsConnected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                </span>
              </div>
            </div>
          </article>
        </div>
      </section>
    </AppShell>
  );
}
