import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable
} from '@tanstack/react-table';
import { useEffect, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
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
  const tbodyRef = useRef<HTMLTableSectionElement | null>(null);

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

  useEffect(() => {
    if (!tbodyRef.current) return;
    const trs = tbodyRef.current.querySelectorAll('tr');
    gsap.fromTo(
      trs,
      { y: 16, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.35, stagger: 0.03, ease: 'power2.out', clearProps: 'transform,opacity' }
    );
  }, [table.getState().pagination.pageIndex, table.getState().pagination.pageSize]);

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/60 bg-white/80 shadow-sm backdrop-blur-xl">
      <table className="w-full min-w-[900px] border-collapse text-left">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-slate-100">
              {headerGroup.headers.map((header) => (
                <th key={header.id} className="px-5 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody ref={tbodyRef} className="divide-y divide-slate-100">
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="transition-colors hover:bg-slate-50/70">
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-5 py-3.5 text-sm text-slate-600">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-3.5 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="text-slate-400">
          Mostrando {table.getRowModel().rows.length} de {rows.length} vehiculos
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            Anterior
          </button>
          <button
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            Siguiente
          </button>

          <span className="px-2 text-slate-400">
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
