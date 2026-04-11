import { clearSession, getUsername } from '../../auth/services/authService';

export function DashboardPage() {
  const username = getUsername();

  const onLogout = () => {
    clearSession();
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface antialiased">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_10%_10%,rgba(0,83,219,0.07),transparent_30%),radial-gradient(circle_at_90%_80%,rgba(0,107,98,0.08),transparent_28%)]" />

      <aside className="fixed left-0 top-0 z-50 hidden h-full w-72 border-r border-outline-variant/20 bg-surface-container-lowest/80 p-5 backdrop-blur-xl lg:flex lg:flex-col">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-on-primary shadow-lg shadow-primary/30">
            <span className="material-symbols-outlined">precision_manufacturing</span>
          </div>
          <div>
            <p className="font-headline text-lg font-extrabold tracking-tight">FleetCore</p>
            <p className="text-xs text-on-surface-variant">Centro de monitoreo</p>
          </div>
        </div>

        <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-on-surface-variant">Navegacion</div>
        <nav className="space-y-2">
          <button className="flex w-full items-center gap-3 rounded-xl bg-primary px-4 py-3 text-left text-on-primary shadow-md shadow-primary/25 transition-transform hover:-translate-y-0.5">
            <span className="material-symbols-outlined">local_shipping</span>
            <div>
              <p className="text-sm font-semibold">Dashboard</p>
              <p className="text-[11px] opacity-80">Mapa y metricas</p>
            </div>
          </button>
          <button className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-on-surface-variant transition-colors hover:bg-surface-container">
            <span className="material-symbols-outlined">route</span>
            <span className="text-sm font-medium">Rutas</span>
          </button>
          <button className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-on-surface-variant transition-colors hover:bg-surface-container">
            <span className="material-symbols-outlined">sensors</span>
            <span className="text-sm font-medium">Telemetria</span>
          </button>
          <button className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-on-surface-variant transition-colors hover:bg-surface-container">
            <span className="material-symbols-outlined">table_chart</span>
            <span className="text-sm font-medium">Dispositivos</span>
          </button>
        </nav>

        <div className="mt-8 rounded-2xl border border-outline-variant/20 bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Sesion activa</p>
          <p className="mt-2 text-sm font-semibold text-on-surface">{username}</p>
          <p className="text-xs text-on-surface-variant">fleet-monitoring</p>
        </div>

        <div className="mt-auto">
          <button
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-outline-variant/25 bg-surface px-4 py-3 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container"
            onClick={onLogout}
          >
            <span className="material-symbols-outlined text-base">logout</span>
            Cerrar sesion
          </button>
        </div>
      </aside>

      <header className="fixed right-0 top-0 z-40 flex h-16 w-full items-center justify-between border-b border-slate-200/20 bg-surface/80 px-5 backdrop-blur-md lg:w-[calc(100%-288px)] lg:px-8">
        <div className="flex items-center space-x-8">
          <h1 className="font-headline text-xl font-extrabold tracking-tighter text-slate-900">Fleet Dashboard</h1>
          <div className="relative group">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <span className="material-symbols-outlined text-sm">search</span>
            </span>
            <input
              className="w-44 rounded-lg border-none bg-slate-100 py-2 pl-10 pr-4 text-sm transition-all duration-200 focus:ring-1 focus:ring-primary/40 sm:w-64"
              placeholder="Buscar activos de flota..."
              type="text"
            />
          </div>
        </div>

        <div className="flex items-center space-x-6">
          <div className="hidden text-sm font-medium text-on-surface-variant md:block">Usuario: {username}</div>
          <button className="rounded-xl bg-surface-container p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high">
            <span className="material-symbols-outlined">notifications</span>
          </button>
        </div>
      </header>

      <main className="min-h-screen pt-16 lg:ml-72">
        <div className="mx-auto max-w-[1600px] p-5 sm:p-8">
          <div className="mb-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <span className="mb-2 block text-sm font-bold uppercase tracking-[0.15em] text-primary">
                Inteligencia de sistema
              </span>
              <h2 className="font-headline text-4xl font-extrabold tracking-tight text-on-surface">Dinamica activa de flota</h2>
            </div>

            <div className="grid grid-cols-1 gap-1 md:grid-cols-3">
              <div className="flex min-w-[180px] flex-col rounded-l-xl border border-outline-variant/15 bg-surface-container-low p-6">
                <span className="mb-4 text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">Flota total</span>
                <div className="flex items-baseline space-x-2">
                  <span className="text-3xl font-bold tracking-tighter">1,284</span>
                  <span className="text-xs font-medium text-secondary">+2%</span>
                </div>
              </div>
              <div className="flex min-w-[180px] flex-col border border-outline-variant/15 bg-surface-container-low p-6">
                <span className="mb-4 text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">
                  Alertas activas
                </span>
                <div className="flex items-baseline space-x-2">
                  <span className="text-3xl font-bold tracking-tighter text-error">12</span>
                  <span className="rounded-full bg-error-container px-2 py-0.5 text-[10px] text-on-error-container">Critico</span>
                </div>
              </div>
              <div className="flex min-w-[180px] flex-col rounded-r-xl border border-outline-variant/15 bg-surface-container-low p-6">
                <span className="mb-4 text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">
                  Velocidad prom.
                </span>
                <div className="flex items-baseline space-x-2">
                  <span className="text-3xl font-bold tracking-tighter">64.2</span>
                  <span className="text-sm font-medium text-on-surface-variant">km/h</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-8">
            <div className="group col-span-12 xl:col-span-8">
              <div className="brand-shadow relative h-[600px] w-full overflow-hidden rounded-2xl border border-outline-variant/10 bg-slate-200">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,83,219,0.18),transparent_32%),radial-gradient(circle_at_72%_65%,rgba(0,107,98,0.2),transparent_30%),linear-gradient(120deg,#e7efff_0%,#d9e7ff_45%,#edf4ff_100%)]" />
                <div className="absolute inset-0 bg-gradient-to-tr from-surface/90 via-transparent to-transparent" />

                <div className="absolute right-6 top-6 flex flex-col space-y-2">
                  <button className="rounded-lg bg-surface-container-lowest/90 p-3 shadow-sm backdrop-blur transition-colors hover:bg-white">
                    <span className="material-symbols-outlined text-on-surface">add</span>
                  </button>
                  <button className="rounded-lg bg-surface-container-lowest/90 p-3 shadow-sm backdrop-blur transition-colors hover:bg-white">
                    <span className="material-symbols-outlined text-on-surface">remove</span>
                  </button>
                </div>

                <div className="group/marker absolute left-1/3 top-1/4 cursor-pointer">
                  <div className="relative">
                    <div className="h-10 w-10 animate-pulse rounded-full bg-primary/20" />
                    <div className="absolute inset-0 m-auto h-4 w-4 rounded-full border-2 border-white bg-primary shadow-lg" />
                    <div className="pointer-events-none absolute bottom-full left-1/2 mb-3 w-40 -translate-x-1/2 rounded-xl bg-white p-3 opacity-0 shadow-2xl transition-all duration-300 group-hover/marker:opacity-100">
                      <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Asset ID</div>
                      <div className="text-sm font-bold text-slate-900">FC-9022 (Transit)</div>
                      <div className="mt-2 flex items-center text-[10px] text-primary">
                        <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-primary" /> En movimiento • 42km/h
                      </div>
                    </div>
                  </div>
                </div>

                <div className="absolute bottom-1/3 right-1/4">
                  <div className="relative">
                    <div className="h-10 w-10 animate-pulse rounded-full bg-secondary/20" />
                    <div className="absolute inset-0 m-auto h-4 w-4 rounded-full border-2 border-white bg-secondary shadow-lg" />
                  </div>
                </div>

                <div className="absolute bottom-6 left-6 max-w-xs rounded-xl border border-outline-variant/10 bg-surface-container-lowest/90 p-4 backdrop-blur">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-sm font-bold">Filtros de mapa</h3>
                    <span className="material-symbols-outlined text-sm text-slate-400">tune</span>
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center space-x-3 text-xs text-on-surface-variant">
                      <input
                        checked
                        className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/20"
                        readOnly
                        type="checkbox"
                      />
                      <span>Vehiculos comerciales</span>
                    </label>
                    <label className="flex items-center space-x-3 text-xs text-on-surface-variant">
                      <input className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/20" type="checkbox" />
                      <span>Courier privado</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="col-span-12 flex flex-col space-y-6 xl:col-span-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold tracking-tight">Inteligencia reciente</h3>
                <button className="text-xs font-bold uppercase tracking-widest text-primary transition-opacity hover:opacity-70">
                  Ver todo
                </button>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border border-outline-variant/5 bg-surface-container-low p-5 transition-all duration-300 hover:border-outline-variant/30">
                  <div className="mb-3 flex items-start justify-between">
                    <div className="rounded-lg bg-error-container/30 p-2">
                      <span className="material-symbols-outlined text-lg text-error">warning</span>
                    </div>
                    <span className="text-[10px] font-medium text-slate-400">14:02</span>
                  </div>
                  <h4 className="mb-1 text-sm font-bold text-on-surface">Frenado brusco detectado</h4>
                  <p className="text-xs leading-relaxed text-on-surface-variant">
                    El activo #8821 reporto niveles anomalos de fuerza G en I-90 Oeste. Protocolo de seguridad inicializado.
                  </p>
                </div>

                <div className="rounded-xl border border-outline-variant/5 bg-surface-container-low p-5 transition-all duration-300 hover:border-outline-variant/30">
                  <div className="mb-3 flex items-start justify-between">
                    <div className="rounded-lg bg-secondary-container/30 p-2">
                      <span className="material-symbols-outlined text-lg text-secondary">task_alt</span>
                    </div>
                    <span className="text-[10px] font-medium text-slate-400">13:45</span>
                  </div>
                  <h4 className="mb-1 text-sm font-bold text-on-surface">Ruta completada</h4>
                  <p className="text-xs leading-relaxed text-on-surface-variant">
                    El activo #4410 llego con exito al hub principal de Chicago. Descarga en proceso.
                  </p>
                </div>

                <div className="rounded-xl border border-outline-variant/5 bg-surface-container-low p-5 transition-all duration-300 hover:border-outline-variant/30">
                  <div className="mb-3 flex items-start justify-between">
                    <div className="rounded-lg bg-surface-container-highest p-2">
                      <span className="material-symbols-outlined text-lg text-primary">local_gas_station</span>
                    </div>
                    <span className="text-[10px] font-medium text-slate-400">12:12</span>
                  </div>
                  <h4 className="mb-1 text-sm font-bold text-on-surface">Autorizacion de combustible</h4>
                  <p className="text-xs leading-relaxed text-on-surface-variant">
                    Billetera digital autorizada por $142.50 en estacion 77B.
                  </p>
                </div>
              </div>

              <div className="relative mt-4 overflow-hidden rounded-2xl bg-primary p-6 text-on-primary shadow-xl">
                <div className="relative z-10">
                  <h4 className="mb-2 text-lg font-bold">Indice de salud de flota</h4>
                  <div className="mb-4 text-4xl font-bold tracking-tighter">
                    98.2<span className="ml-1 text-lg opacity-60">/100</span>
                  </div>
                  <div className="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-on-primary/20">
                    <div className="h-full w-[98%] rounded-full bg-white" />
                  </div>
                  <button className="w-full rounded-xl bg-white py-3 text-xs font-bold uppercase tracking-widest text-primary transition-colors hover:bg-slate-50">
                    Auditoria detallada
                  </button>
                </div>
                <div className="absolute -bottom-8 -right-8 opacity-10">
                  <span className="material-symbols-outlined text-[140px]">monitoring</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-12">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-2xl font-bold tracking-tight">Tabla de dispositivos</h3>
              <div className="flex space-x-2">
                <button className="rounded-lg border border-outline-variant/20 bg-surface-container-low px-4 py-2 text-xs font-semibold transition-colors hover:bg-surface-container">
                  Filtros
                </button>
                <button className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-on-primary shadow-md transition-colors hover:bg-primary-dim">
                  Exportar CSV
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-outline-variant/10 bg-surface-container-lowest">
              <table className="w-full min-w-[900px] border-collapse text-left">
                <thead>
                  <tr className="bg-surface-container-low/50">
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Dispositivo</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">VIN</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Estado</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Velocidad</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Ubicacion</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Combustible</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/5">
                  <tr className="transition-colors hover:bg-slate-50/50">
                    <td className="px-6 py-5">
                      <div className="flex items-center space-x-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                          <span className="material-symbols-outlined text-sm">memory</span>
                        </div>
                        <div>
                          <div className="text-sm font-bold text-on-surface">Tracker-9920</div>
                          <div className="text-[10px] text-slate-400">Heavy Duty Trailer</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-sm text-on-surface-variant">1FTFW1E50NFA22031</td>
                    <td className="px-6 py-5">
                      <span className="inline-flex items-center rounded-full bg-secondary-container px-2.5 py-0.5 text-[10px] font-bold text-on-secondary-container">
                        Activo
                      </span>
                    </td>
                    <td className="px-6 py-5 text-sm font-semibold">68 km/h</td>
                    <td className="px-6 py-5 text-sm text-on-surface-variant">Seattle Hub A</td>
                    <td className="px-6 py-5">
                      <div className="flex items-center space-x-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full w-[82%] bg-secondary" />
                        </div>
                        <span className="text-[10px] font-bold text-slate-500">82%</span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <button className="rounded-lg p-2 transition-colors hover:bg-slate-100">
                        <span className="material-symbols-outlined text-slate-400">more_vert</span>
                      </button>
                    </td>
                  </tr>

                  <tr className="transition-colors hover:bg-slate-50/50">
                    <td className="px-6 py-5">
                      <div className="flex items-center space-x-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                          <span className="material-symbols-outlined text-sm">memory</span>
                        </div>
                        <div>
                          <div className="text-sm font-bold text-on-surface">Tracker-4402</div>
                          <div className="text-[10px] text-slate-400">Refrigerated Van</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-sm text-on-surface-variant">2HGFC2F69KH512884</td>
                    <td className="px-6 py-5">
                      <span className="inline-flex items-center rounded-full bg-error-container px-2.5 py-0.5 text-[10px] font-bold text-on-error-container">
                        Alerta
                      </span>
                    </td>
                    <td className="px-6 py-5 text-sm font-semibold">0 km/h</td>
                    <td className="px-6 py-5 text-sm text-on-surface-variant">Portland Service Center</td>
                    <td className="px-6 py-5">
                      <div className="flex items-center space-x-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full w-[15%] bg-error" />
                        </div>
                        <span className="text-[10px] font-bold text-slate-500">15%</span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <button className="rounded-lg p-2 transition-colors hover:bg-slate-100">
                        <span className="material-symbols-outlined text-slate-400">more_vert</span>
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      <div className="fixed bottom-8 right-8 z-50">
        <button className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-2xl transition-all duration-150 hover:scale-105 active:scale-95">
          <span className="material-symbols-outlined">add</span>
        </button>
      </div>
    </div>
  );
}