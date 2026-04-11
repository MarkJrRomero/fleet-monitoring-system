const ALERT_STATUSES = new Set(['low_battery', 'overspeed', 'alert', 'panic', 'stopped']);
const ONLINE_STATUSES = new Set(['online', 'active']);
const GRAY_STATUSES = new Set(['no_signal', 'unknown', 'offline', 'stopped']);

export function normalizeVehicleStatus(status?: string): string {
  const normalized = (status || '').trim().toLowerCase();
  return normalized || 'unknown';
}

export function getVehicleStatusLabel(status?: string): string {
  const normalized = normalizeVehicleStatus(status);
  if (normalized === 'online' || normalized === 'active') {
    return 'Online';
  }
  if (normalized === 'low_battery') {
    return 'Sin bateria';
  }
  if (normalized === 'overspeed') {
    return 'Exceso de velocidad';
  }
  if (normalized === 'panic') {
    return 'Boton de panico';
  }
  if (normalized === 'no_signal') {
    return 'Sin senal';
  }
  if (normalized === 'stopped') {
    return 'Vehiculo detenido';
  }
  if (normalized === 'unknown' || normalized === 'offline') {
    return 'Desconocido';
  }
  return normalized;
}

export function getVehicleMapColor(status?: string): string {
  const normalized = normalizeVehicleStatus(status);
  if (normalized === 'stopped') {
    return '#f59e0b';
  }
  if (normalized === 'overspeed') {
    return '#ef4444';
  }
  if (normalized === 'panic') {
    return '#0ea5e9';
  }
  if (normalized === 'low_battery') {
    return '#f97316';
  }
  if (normalized === 'alert' || ALERT_STATUSES.has(normalized)) {
    return '#dc2626';
  }
  if (ONLINE_STATUSES.has(normalized)) {
    return '#16a34a';
  }
  if (GRAY_STATUSES.has(normalized)) {
    return '#64748b';
  }
  return '#64748b';
}

export function getVehicleStatusBadgeClasses(status?: string): string {
  const normalized = normalizeVehicleStatus(status);
  if (normalized === 'stopped') {
    return 'bg-amber-100 text-amber-800';
  }
  if (normalized === 'overspeed') {
    return 'bg-rose-100 text-rose-700';
  }
  if (normalized === 'panic') {
    return 'bg-sky-100 text-sky-700';
  }
  if (normalized === 'low_battery') {
    return 'bg-orange-100 text-orange-700';
  }
  if (normalized === 'alert' || ALERT_STATUSES.has(normalized)) {
    return 'bg-red-100 text-red-700';
  }
  if (ONLINE_STATUSES.has(normalized)) {
    return 'bg-secondary-container text-on-secondary-container';
  }
  return 'bg-surface-container-high text-on-surface-variant';
}
