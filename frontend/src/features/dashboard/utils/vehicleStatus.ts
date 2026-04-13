const ALERT_STATUSES = new Set(['low_battery', 'overspeed', 'alert', 'panic', 'stopped']);
const ONLINE_STATUSES = new Set(['online', 'active']);
const GRAY_STATUSES = new Set(['no_signal', 'unknown', 'offline']);

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
    return 'Offline';
  }
  return normalized;
}

export function getVehicleMapColor(status?: string): string {
  const normalized = normalizeVehicleStatus(status);
  if (ONLINE_STATUSES.has(normalized)) {
    return '#16a34a';
  }
  if (GRAY_STATUSES.has(normalized)) {
    return '#64748b';
  }
  if (normalized === 'alert' || ALERT_STATUSES.has(normalized)) {
    return '#dc2626';
  }
  return '#64748b';
}

export function getVehicleStatusBadgeClasses(status?: string): string {
  const normalized = normalizeVehicleStatus(status);
  if (ONLINE_STATUSES.has(normalized)) {
    return 'bg-emerald-100 text-emerald-700';
  }
  if (GRAY_STATUSES.has(normalized)) {
    return 'bg-slate-100 text-slate-600';
  }
  if (normalized === 'alert' || ALERT_STATUSES.has(normalized)) {
    return 'bg-red-100 text-red-700';
  }
  return 'bg-slate-100 text-slate-600';
}
