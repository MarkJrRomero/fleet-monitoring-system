import { ReactNode } from 'react';
import { Link } from 'react-router-dom';

type NavItem = {
  to: string;
  label: string;
  icon: string;
  subtitle?: string;
  active?: boolean;
};

type AppShellProps = {
  title: string;
  username: string;
  navItems: NavItem[];
  statusLabel?: string;
  statusValue?: string;
  statusOk?: boolean;
  headerRight?: ReactNode;
  onLogout: () => void;
  children: ReactNode;
};

export function AppShell({
  title,
  username,
  navItems,
  statusLabel,
  statusValue,
  statusOk,
  headerRight,
  onLogout,
  children
}: AppShellProps) {
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
          {navItems.map((item) => (
            <Link
              key={item.to}
              className={
                item.active
                  ? 'flex w-full items-center gap-3 rounded-xl bg-primary px-4 py-3 text-left text-on-primary shadow-md shadow-primary/25'
                  : 'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-on-surface-variant transition-colors hover:bg-surface-container'
              }
              to={item.to}
            >
              <span className="material-symbols-outlined">{item.icon}</span>
              <div>
                <p className="text-sm font-semibold">{item.label}</p>
                {item.subtitle ? <p className="text-[11px] opacity-80">{item.subtitle}</p> : null}
              </div>
            </Link>
          ))}
        </nav>

        <div className="mt-8 rounded-2xl border border-outline-variant/20 bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Sesion activa</p>
          <p className="mt-2 text-sm font-semibold text-on-surface">{username}</p>
          {statusLabel && statusValue ? (
            <p className="text-xs text-on-surface-variant">
              {statusLabel}:{' '}
              <span className={statusOk ? 'text-secondary' : 'text-error'}>{statusValue}</span>
            </p>
          ) : null}
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

      <header className="fixed right-0 top-0 z-40 flex h-16 w-full items-center justify-between border-b border-slate-200/20 bg-surface/90 px-5 backdrop-blur-md lg:w-[calc(100%-288px)] lg:px-8">
        <h1 className="font-headline text-xl font-extrabold tracking-tight text-slate-900">{title}</h1>
        <div className="text-sm text-on-surface-variant">{headerRight}</div>
      </header>

      <main className="min-h-screen pt-16 lg:ml-72">
        <div className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
