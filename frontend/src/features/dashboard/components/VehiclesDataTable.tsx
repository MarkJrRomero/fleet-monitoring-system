import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable
} from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { StyledSelect, type SelectOption } from '../../../shared/components/StyledSelect';
import { StatusBadge } from '../../../shared/components/StatusBadge';
import { getVehicleStatusBadgeClasses, getVehicleStatusLabel } from '../utils/vehicleStatus';

export type VehicleTableRow = {
  vehicle_id: string;
  lat: number;
  lng: number;
  status: string;
  speed_kmh: number;
  location_label: string;
  last_reported_at?: string;
  isReporting: boolean;
};

type VehiclesDataTableProps = {
  rows: VehicleTableRow[];
};

const columnHelper = createColumnHelper<VehicleTableRow>();
const PAGE_SIZE_OPTIONS: SelectOption[] = [
  { value: '10', label: '10 por pagina' },
  { value: '25', label: '25 por pagina' },
  { value: '50', label: '50 por pagina' },
  { value: '100', label: '100 por pagina' }
];

export function VehiclesDataTable({ rows }: VehiclesDataTableProps) {
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 25
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor('vehicle_id', {
        header: 'Dispositivo',
        cell: (info) => <span className="font-semibold">{info.getValue()}</span>
      }),
      columnHelper.accessor('isReporting', {
        header: 'Estado',
        cell: (info) => {
          const status = info.row.original.status;
          return (
            <StatusBadge
              className={getVehicleStatusBadgeClasses(status)}
              label={getVehicleStatusLabel(status)}
            />
          );
        }
      }),
      columnHelper.accessor('lat', {
        header: 'Lat',
        cell: (info) => info.getValue().toFixed(5)
      }),
      columnHelper.accessor('lng', {
        header: 'Lng',
        cell: (info) => info.getValue().toFixed(5)
      }),
      columnHelper.accessor('speed_kmh', {
        header: 'Velocidad',
        cell: (info) => `${info.getValue().toFixed(1)} km/h`
      }),
      columnHelper.accessor('location_label', {
        header: 'Ubicacion',
        cell: (info) => info.getValue() || 'Sin ubicacion'
      }),
      columnHelper.accessor('last_reported_at', {
        header: 'Ultimo reporte',
        cell: (info) => {
          const value = info.getValue();
          return value ? new Date(value).toLocaleString() : 'Sin reporte reciente';
        }
      })
    ],
    []
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { pagination },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel()
  });

  return (
    <div className="overflow-x-auto rounded-2xl border border-outline-variant/10 bg-surface-container-lowest">
      <table className="w-full min-w-[900px] border-collapse text-left">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="bg-surface-container-low/50">
              {headerGroup.headers.map((header) => (
                <th key={header.id} className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y divide-outline-variant/5">
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="transition-colors hover:bg-slate-50/50">
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-6 py-4 text-sm text-on-surface-variant">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-col gap-3 border-t border-outline-variant/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="text-on-surface-variant">
          Mostrando {table.getRowModel().rows.length} de {rows.length} vehiculos
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            className="rounded-lg border border-outline-variant/30 bg-surface px-3 py-1.5 disabled:opacity-50"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            Anterior
          </button>
          <button
            className="rounded-lg border border-outline-variant/30 bg-surface px-3 py-1.5 disabled:opacity-50"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            Siguiente
          </button>

          <span className="px-2 text-on-surface-variant">
            Pagina {table.getState().pagination.pageIndex + 1} / {Math.max(table.getPageCount(), 1)}
          </span>

          <div className="min-w-[150px]">
            <StyledSelect
              isSearchable={false}
              options={PAGE_SIZE_OPTIONS}
              value={String(table.getState().pagination.pageSize)}
              onChange={(value) => {
                table.setPageSize(Number(value));
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
