import { useEffect, useMemo, useState } from 'react';
import { Car, RefreshCw } from 'lucide-react';
import { clearSession, getUsername } from '../../auth/services/authService';
import { getVehicleStatusBadgeClasses, getVehicleStatusLabel } from '../../dashboard/utils/vehicleStatus';
import { getMainNavItems } from '../../../shared/config/navItems';
import { VEHICLE_BASE_URL } from '../../../shared/config/runtime';
import { StatusBadge } from '../../../shared/components/StatusBadge';
import { usePageSeo } from '../../../shared/hooks/usePageSeo';
import { AppShell } from '../../../shared/layouts/AppShell';

type Vehicle = {
  vehicle_id: string;
  imei: string;
  lat: number;
  lng: number;
  status: string;
  created_at?: string;
};

type VehiclesResponse = {
  vehicles: Vehicle[];
  total: number;
};

export function VehiclesPage() {
  usePageSeo({
    title: 'SMTF | Vehiculos',
    description: 'Listado y estado operativo de los vehiculos de la flota.'
  });

  const username = getUsername();
  const pageSize = 10;
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);

  const loadVehicles = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${VEHICLE_BASE_URL}/api/v1/vehicles`);
      if (!response.ok) {
        throw new Error('No fue posible cargar vehiculos');
      }
      const data = (await response.json()) as VehiclesResponse;
      setVehicles(data.vehicles ?? []);
    } catch {
      setVehicles([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadVehicles();
  }, []);

  const sortedVehicles = useMemo(
    () => [...vehicles].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '')).reverse(),
    [vehicles]
  );

  const totalPages = useMemo(() => Math.max(1, Math.ceil(sortedVehicles.length / pageSize)), [sortedVehicles.length]);

  const paginatedVehicles = useMemo(() => {
    const start = pageIndex * pageSize;
    return sortedVehicles.slice(start, start + pageSize);
  }, [sortedVehicles, pageIndex]);

  useEffect(() => {
    setPageIndex((prev) => Math.min(prev, totalPages - 1));
  }, [totalPages]);

  const onLogout = () => {
    clearSession();
    window.location.href = '/login';
  };

  return (
    <>
      <AppShell
        headerRight={
          <div className="flex items-center">
            <div className="flex min-w-[120px] items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-on-surface">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-700">
                <Car className="h-4 w-4" />
              </span>
              <div className="leading-tight">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800">Vehiculos</p>
                <p className="text-sm font-bold">{vehicles.length}</p>
              </div>
            </div>
          </div>
        }
        navItems={getMainNavItems('/vehiculos')}
        onLogout={onLogout}
        title="Modulo de vehiculos"
        username={username}
      >
        <section className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-headline text-xl font-bold">Tabla de vehiculos</h2>
            <div className="flex gap-2">
              <button
                aria-label="Refrescar vehiculos"
                className="rounded-lg border border-outline-variant/30 bg-surface p-2 text-sm text-on-surface-variant transition hover:bg-surface-container"
                onClick={() => void loadVehicles()}
                type="button"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-outline-variant/20">
            <table className="w-full min-w-[760px] text-left">
              <thead className="bg-surface-container-low">
                <tr>
                  <th className="px-4 py-3 text-xs uppercase tracking-widest text-on-surface-variant">ID</th>
                  <th className="px-4 py-3 text-xs uppercase tracking-widest text-on-surface-variant">IMEI</th>
                  <th className="px-4 py-3 text-xs uppercase tracking-widest text-on-surface-variant">Estado</th>
                  <th className="px-4 py-3 text-xs uppercase tracking-widest text-on-surface-variant">Lat</th>
                  <th className="px-4 py-3 text-xs uppercase tracking-widest text-on-surface-variant">Lng</th>
                  <th className="px-4 py-3 text-xs uppercase tracking-widest text-on-surface-variant">Creado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10 bg-surface">
                {paginatedVehicles.map((vehicle) => (
                  <tr key={vehicle.vehicle_id}>
                    <td className="px-4 py-3 text-sm font-semibold">{vehicle.vehicle_id}</td>
                    <td className="px-4 py-3 text-sm">{vehicle.imei || '--'}</td>
                    <td className="px-4 py-3 text-sm">
                      <StatusBadge
                        className={getVehicleStatusBadgeClasses(vehicle.status)}
                        label={getVehicleStatusLabel(vehicle.status)}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm">{vehicle.lat.toFixed(5)}</td>
                    <td className="px-4 py-3 text-sm">{vehicle.lng.toFixed(5)}</td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant">
                      {vehicle.created_at ? new Date(vehicle.created_at).toLocaleString() : '--'}
                    </td>
                  </tr>
                ))}
                {sortedVehicles.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-sm text-on-surface-variant" colSpan={6}>
                      Sin vehiculos registrados. Puedes crear uno desde el boton Crear individual.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-on-surface-variant">
            <span>
              Mostrando {sortedVehicles.length === 0 ? 0 : pageIndex * pageSize + 1} - {Math.min((pageIndex + 1) * pageSize, sortedVehicles.length)} de {sortedVehicles.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                className="rounded-lg border border-outline-variant/30 bg-surface px-3 py-1.5 disabled:opacity-50"
                disabled={pageIndex === 0}
                onClick={() => setPageIndex((prev) => Math.max(0, prev - 1))}
                type="button"
              >
                Anterior
              </button>
              <span>
                Pagina {totalPages === 0 ? 0 : pageIndex + 1} de {totalPages}
              </span>
              <button
                className="rounded-lg border border-outline-variant/30 bg-surface px-3 py-1.5 disabled:opacity-50"
                disabled={pageIndex >= totalPages - 1}
                onClick={() => setPageIndex((prev) => Math.min(totalPages - 1, prev + 1))}
                type="button"
              >
                Siguiente
              </button>
            </div>
          </div>
        </section>

      </AppShell>
    </>
  );
}
