import { useEffect, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { AlertTriangle, Car, CirclePause, MapPin, Gauge, Wifi, WifiOff, X } from 'lucide-react';
import { CircleMarker, MapContainer, TileLayer } from 'react-leaflet';
import { useMap } from 'react-leaflet/hooks';
import MarkerClusterGroup from 'react-leaflet-cluster';
import 'leaflet/dist/leaflet.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css';
import { clearSession, getUsername } from '../../auth/services/authService';
import { POSITIONS_WS_URL, VEHICLE_BASE_URL } from '../../../shared/config/runtime';
import { getMainNavItems } from '../../../shared/config/navItems';
import { StyledSelect, type SelectOption } from '../../../shared/components/StyledSelect';
import { usePageSeo } from '../../../shared/hooks/usePageSeo';
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

function FocusMapOnVehicle({ target }: { target: [number, number] | null }) {
  const map = useMap();

  useEffect(() => {
    if (!target) {
      return;
    }

    const currentZoom = map.getZoom();
    const currentCenter = map.getCenter();
    const distance = map.distance(currentCenter, target);
    const focusZoom = Math.min(Math.max(currentZoom, 16), 17);

    if (currentZoom >= 16 && distance < 180) {
      map.panTo(target, { animate: true, duration: 0.55 });
      return;
    }

    map.flyTo(target, focusZoom, { duration: 0.95, easeLinearity: 0.18 });
  }, [map, target]);

  return null;
}

function AnimatedVehicleMarker({
  vehicle,
  selected,
  onMarkerClick
}: {
  vehicle: DashboardVehicle;
  selected: boolean;
  onMarkerClick: () => void;
}) {
  const [displayPosition, setDisplayPosition] = useState<[number, number]>([vehicle.lat, vehicle.lng]);
  const currentPositionRef = useRef({ lat: vehicle.lat, lng: vehicle.lng });
  const tweenRef = useRef<gsap.core.Tween | null>(null);

  useEffect(() => {
    const from = currentPositionRef.current;
    const deltaLat = Math.abs(vehicle.lat - from.lat);
    const deltaLng = Math.abs(vehicle.lng - from.lng);
    if (deltaLat < 0.0000001 && deltaLng < 0.0000001) {
      return;
    }

    tweenRef.current?.kill();
    tweenRef.current = gsap.to(currentPositionRef.current, {
      lat: vehicle.lat,
      lng: vehicle.lng,
      duration: 1.45,
      ease: 'sine.out',
      overwrite: 'auto',
      onUpdate: () => {
        setDisplayPosition([currentPositionRef.current.lat, currentPositionRef.current.lng]);
      }
    });

    return () => {
      tweenRef.current?.kill();
    };
  }, [vehicle.lat, vehicle.lng]);

  return (
    <CircleMarker
      center={displayPosition}
      fillColor={getVehicleMapColor(vehicle.status)}
      fillOpacity={vehicle.isReporting ? 0.88 : 0.64}
      pathOptions={{ color: selected ? '#0ea5e9' : '#ffffff', weight: selected ? 2.3 : 1.8 }}
      radius={VEHICLE_PIN_RADIUS}
      eventHandlers={{ click: onMarkerClick }}
    />
  );
}

interface VehicleDetailCardProps {
  vehicle: DashboardVehicle;
  onClose: () => void;
}

function VehicleDetailCard({ vehicle, onClose }: VehicleDetailCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!cardRef.current) return;
    gsap.fromTo(
      cardRef.current,
      { y: 18, opacity: 0, scale: 0.96 },
      { y: 0, opacity: 1, scale: 1, duration: 0.32, ease: 'power3.out' }
    );
  }, []);

  const accentColor = getVehicleMapColor(vehicle.status);

  return (
    <div
      ref={cardRef}
      className="absolute bottom-5 right-5 z-[1000] w-72 rounded-2xl border border-white/70 border-t-[3px] bg-white/95 shadow-2xl backdrop-blur-xl"
      style={{ borderTopColor: accentColor }}
    >
      <div className="p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold text-slate-800" title={vehicle.vehicle_id}>
              {vehicle.vehicle_id}
            </p>
            <p className="truncate text-[11px] text-slate-400">IMEI: {vehicle.imei}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm"
              style={{ backgroundColor: accentColor }}
            >
              {vehicle.latest_alert_type || getVehicleStatusLabel(vehicle.status)}
            </span>
            <button
              className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
              onClick={onClose}
              type="button"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
            <Gauge className="h-4 w-4 shrink-0 text-slate-400" />
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Velocidad</p>
              <p className="text-sm font-bold text-slate-700">{(vehicle.speed_kmh ?? 0).toFixed(1)} km/h</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
            {vehicle.isReporting
              ? <Wifi className="h-4 w-4 shrink-0 text-teal-500" />
              : <WifiOff className="h-4 w-4 shrink-0 text-slate-400" />}
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Conexion</p>
              <p className={`text-sm font-bold ${vehicle.isReporting ? 'text-teal-600' : 'text-slate-400'}`}>
                {vehicle.isReporting ? 'En linea' : 'Sin senal'}
              </p>
            </div>
          </div>
        </div>

        {(vehicle.location_label && vehicle.location_label !== 'Sin ubicacion') && (
          <div className="mt-2 flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <p className="line-clamp-2 text-[11px] font-medium text-slate-600">{vehicle.location_label}</p>
          </div>
        )}

        <div className="mt-2.5 space-y-0.5">
          <p className="text-[11px] text-slate-400">
            {vehicle.lat.toFixed(5)}, {vehicle.lng.toFixed(5)}
          </p>
          {vehicle.last_reported_at && (
            <p className="text-[11px] text-slate-400">
              Ultimo reporte: {new Date(vehicle.last_reported_at).toLocaleString()}
            </p>
          )}
        </div>

        {vehicle.latest_alert_type && (
          <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2">
            <p className="text-[9px] font-bold uppercase tracking-wider text-rose-400">Alerta activa</p>
            <p className="text-[11px] font-semibold text-rose-700">{vehicle.latest_alert_type}</p>
            {vehicle.latest_alert_message && (
              <p className="text-[11px] text-rose-500">{vehicle.latest_alert_message}</p>
            )}
            {vehicle.latest_alert_at && (
              <p className="text-[10px] text-rose-400">{new Date(vehicle.latest_alert_at).toLocaleString()}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface VehicleCardListProps {
  vehicles: DashboardVehicle[];
  selectedVehicleId: string | null;
  flashingVehicleIds: Set<string>;
  onVehicleCardClick: (vehicle: DashboardVehicle) => void;
}

function VehicleCardList({ vehicles, selectedVehicleId, flashingVehicleIds, onVehicleCardClick }: VehicleCardListProps) {
  return (
    <div className="space-y-2">
      {vehicles.map((vehicle) => (
        <div key={vehicle.vehicle_id} className="vehicle-card" data-vehicle-id={vehicle.vehicle_id}>
          <button
            data-vehicle-id={vehicle.vehicle_id}
            className={`w-full overflow-hidden rounded-2xl border bg-white/90 p-3.5 text-left shadow-sm transition-[border-color,box-shadow,background-color] duration-300 hover:shadow-md hover:border-teal-300/70 ${
              flashingVehicleIds.has(vehicle.vehicle_id)
                ? 'border-sky-500'
                : selectedVehicleId === vehicle.vehicle_id
                ? 'border-teal-500 bg-white shadow-md ring-2 ring-teal-200/60'
                : 'border-slate-200/70'
            }`}
            onClick={() => onVehicleCardClick(vehicle)}
            type="button"
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-800" title={vehicle.vehicle_id}>{vehicle.vehicle_id}</p>
                <p className="truncate text-[11px] text-slate-400" title={`IMEI: ${vehicle.imei}`}>IMEI: {vehicle.imei}</p>
              </div>

              <span
                className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm"
                style={{ backgroundColor: getVehicleMapColor(vehicle.status) }}
                title={vehicle.latest_alert_type || getVehicleStatusLabel(vehicle.status)}
              >
                {vehicle.latest_alert_type || getVehicleStatusLabel(vehicle.status)}
              </span>
            </div>

            <p
              className="mt-1 max-h-9 overflow-hidden text-[11px] leading-5 text-slate-500"
              title={vehicle.latest_alert_message || vehicle.location_label || 'Sin novedades de alerta'}
            >
              {vehicle.latest_alert_message || vehicle.location_label || 'Sin novedades de alerta'}
            </p>

            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <div className="min-w-0 rounded-xl bg-slate-50 px-2.5 py-1.5">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Velocidad</p>
                <p className="truncate text-[11px] font-semibold text-slate-700">{(vehicle.speed_kmh ?? 0).toFixed(1)} km/h</p>
              </div>
              <div className="min-w-0 rounded-xl bg-slate-50 px-2.5 py-1.5">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Conexion</p>
                <p className={`truncate text-[11px] font-semibold ${vehicle.isReporting ? 'text-teal-600' : 'text-slate-400'}`}>
                  {vehicle.isReporting ? 'En linea' : 'Sin senal'}
                </p>
              </div>
            </div>

            <p className="mt-2 truncate text-[10px] text-slate-400" title={`${vehicle.lat.toFixed(5)}, ${vehicle.lng.toFixed(5)}`}>
              {vehicle.lat.toFixed(5)}, {vehicle.lng.toFixed(5)}
            </p>

            <p className="text-[10px] text-slate-400">
              {vehicle.latest_alert_at
                ? `Alerta: ${new Date(vehicle.latest_alert_at).toLocaleString()}`
                : 'Monitoreo en tiempo real'}
            </p>
          </button>

          {selectedVehicleId === vehicle.vehicle_id ? (
            <div className="my-2 border-t-2 border-dashed border-teal-300/50" />
          ) : null}

        </div>
      ))}
    </div>
  );
}

export function DashboardPage() {
  usePageSeo({
    title: 'SMTF | Dashboard',
    description: 'Mapa en tiempo real, alertas activas y estado de la flota.'
  });

  const username = getUsername();
  const [events, setEvents] = useState<PositionEvent[]>([]);
  const [vehiclesCatalog, setVehiclesCatalog] = useState<VehicleCatalog[]>([]);
  const [visibleCount, setVisibleCount] = useState(VEHICLES_PAGE_SIZE);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [focusedPosition, setFocusedPosition] = useState<[number, number] | null>(null);
  const [statusPriority, setStatusPriority] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [flashingVehicleIds, setFlashingVehicleIds] = useState<Set<string>>(new Set());
  const previousVehicleSnapshotRef = useRef<Map<string, string>>(new Map());
  const flashTimeoutsRef = useRef<Map<string, number>>(new Map());
  const lastFlashAtRef = useRef<Map<string, number>>(new Map());
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

    ws.onopen = () => {};
    ws.onerror = () => {};
    ws.onclose = () => {};

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as PositionEvent;
        setEvents((prev) => [payload, ...prev].slice(0, 300));
      } catch {
        // noop
      }
    };

    return () => {
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

    const now = Date.now();
    const flashCooldownMs = 1300;
    const eligibleIds = changedIds.filter((id) => {
      const lastAt = lastFlashAtRef.current.get(id) ?? 0;
      if (now - lastAt < flashCooldownMs) {
        return false;
      }
      lastFlashAtRef.current.set(id, now);
      return true;
    });

    if (eligibleIds.length === 0) {
      return;
    }

    setFlashingVehicleIds((prev) => {
      const next = new Set(prev);
      for (const id of eligibleIds) {
        next.add(id);
      }
      return next;
    });

    for (const id of eligibleIds) {
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
      }, 1200);

      flashTimeoutsRef.current.set(id, timeoutId);
    }
  }, [allVehicles]);

  useEffect(() => {
    return () => {
      flashTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      flashTimeoutsRef.current.clear();
      lastFlashAtRef.current.clear();
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

  const markers = useMemo(() => allVehicles, [allVehicles]);
  const mapCenter = useMemo<[number, number]>(() => [4.7110, -74.0721], []);

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

  const onDetailClose = () => {
    setSelectedVehicleId(null);
    setFocusedPosition(null);
  };

  const activeDetailVehicle = useMemo(
    () => (selectedVehicleId ? allVehicles.find((v) => v.vehicle_id === selectedVehicleId) ?? null : null),
    [selectedVehicleId, allVehicles]
  );

  const onMarkerClick = (vehicle: DashboardVehicle) => {
    setSelectedVehicleId(vehicle.vehicle_id);
    setFocusedPosition([vehicle.lat, vehicle.lng]);
  };

  const metricsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!metricsRef.current) return;
    const items = metricsRef.current.querySelectorAll('.metric-item');
    gsap.fromTo(
      items,
      { y: 12, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.45, stagger: 0.1, ease: 'power2.out' }
    );
  }, []);

  const onLogout = () => {
    clearSession();
    window.location.href = '/login';
  };

  return (
    <AppShell
      title="Mapa en tiempo real y alertas de la flota"
      username={username}
      navItems={getMainNavItems('/')}
      headerRight={
        <div ref={metricsRef} className="flex flex-wrap items-center gap-2">
          <div className="metric-item flex min-w-[110px] items-center gap-2 rounded-xl border border-teal-200/60 bg-white/80 px-3 py-1.5 shadow-sm backdrop-blur-sm">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
              <Car className="h-4 w-4" />
            </span>
            <div className="leading-tight">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-teal-600">Vehiculos</p>
              <p className="text-sm font-bold text-slate-800">{allVehicles.length}</p>
            </div>
          </div>

          <div className="metric-item flex min-w-[110px] items-center gap-2 rounded-xl border border-amber-200/60 bg-white/80 px-3 py-1.5 shadow-sm backdrop-blur-sm">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <AlertTriangle className="h-4 w-4" />
            </span>
            <div className="leading-tight">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-600">Alertas</p>
              <p className="text-sm font-bold text-slate-800">{alertSummary.total}</p>
            </div>
          </div>

          <div className="metric-item flex min-w-[110px] items-center gap-2 rounded-xl border border-rose-200/60 bg-white/80 px-3 py-1.5 shadow-sm backdrop-blur-sm">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
              <CirclePause className="h-4 w-4" />
            </span>
            <div className="leading-tight">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-rose-600">Detenidos</p>
              <p className="text-sm font-bold text-slate-800">{alertSummary.stopped}</p>
            </div>
          </div>
        </div>
      }
      onLogout={onLogout}
    >
      <section className="overflow-visible xl:h-[calc(100vh-110px)] xl:overflow-hidden">
        <div className="grid min-h-0 grid-cols-1 gap-4 xl:h-full xl:grid-cols-12">
          <div className="min-h-0 xl:col-span-5 xl:h-full">
            <article className="flex h-full min-h-0 max-h-full flex-col rounded-2xl border border-white/60 bg-white/80 p-4 shadow-sm backdrop-blur-xl">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-headline text-xl font-bold text-slate-800">Alertas activas</h2>
              </div>

              <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <StyledSelect options={STATUS_PRIORITY_OPTIONS} value={statusPriority} onChange={setStatusPriority} />

                <input
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 placeholder:text-slate-400 focus:border-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-200/50"
                  placeholder="Buscar por placa o IMEI"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>

              <div ref={alertsContainerRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1" onScroll={onAlertsScroll}>
                {allVehicles.length === 0 ? (
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-400">Sin vehiculos en catalogo.</div>
                ) : (
                  <VehicleCardList
                    vehicles={visibleVehicles}
                    selectedVehicleId={selectedVehicleId}
                    flashingVehicleIds={flashingVehicleIds}
                    onVehicleCardClick={onVehicleCardClick}
                  />
                )}
              </div>
            </article>
          </div>

          <article className="relative min-h-0 rounded-2xl border border-white/60 bg-white/80 p-3 shadow-sm backdrop-blur-xl xl:col-span-7 xl:h-full">
            <div className="relative h-[52vh] min-h-[320px] overflow-hidden rounded-xl border border-slate-100 sm:h-[420px] xl:h-full">
              <MapContainer center={mapCenter} className="h-full w-full" scrollWheelZoom zoom={12}>
                <FocusMapOnVehicle target={focusedPosition} />
                <TileLayer
                  attribution='&copy; OpenStreetMap contributors &copy; CARTO'
                  url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                />

                <MarkerClusterGroup
                  chunkedLoading
                  disableClusteringAtZoom={17}
                  maxClusterRadius={52}
                  spiderfyOnMaxZoom={false}
                  showCoverageOnHover={false}
                >
                  {markers.map((vehicle) => (
                    <AnimatedVehicleMarker
                      key={vehicle.vehicle_id}
                      selected={selectedVehicleId === vehicle.vehicle_id}
                      vehicle={vehicle}
                      onMarkerClick={() => onMarkerClick(vehicle)}
                    />
                  ))}
                </MarkerClusterGroup>
              </MapContainer>
            </div>

            {activeDetailVehicle && (
              <VehicleDetailCard
                key={activeDetailVehicle.vehicle_id}
                vehicle={activeDetailVehicle}
                onClose={onDetailClose}
              />
            )}
          </article>
        </div>
      </section>
    </AppShell>
  );
}
