import { ReactNode, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Car, ChevronDown, Home, LayoutDashboard, LogOut, Map, Radar } from 'lucide-react';

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
  headerRight?: ReactNode;
  onLogout: () => void;
  children: ReactNode;
};

export function AppShell({
  title,
  username,
  navItems,
  headerRight,
  onLogout,
  children
}: AppShellProps) {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (!userMenuRef.current) {
        return;
      }
      const targetNode = event.target as Node;
      if (!userMenuRef.current.contains(targetNode)) {
        setIsUserMenuOpen(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', onDocumentClick);
    document.addEventListener('keydown', onEscape);

    return () => {
      document.removeEventListener('mousedown', onDocumentClick);
      document.removeEventListener('keydown', onEscape);
    };
  }, []);

  const initial = username?.trim()?.charAt(0)?.toUpperCase() || 'U';

  return (
    <div className="min-h-screen bg-surface text-on-surface antialiased">
      <aside className="fixed left-0 top-0 z-50 hidden h-full w-72 border-r border-outline-variant/20 bg-surface-container-lowest/95 p-5 lg:flex lg:flex-col">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-on-primary">
            <LayoutDashboard className="h-5 w-5" strokeWidth={2.3} />
          </div>
          <div>
            <p className="font-headline text-xl font-extrabold tracking-tight">FleetTrips</p>
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
                  ? 'flex w-full items-center gap-3 rounded-xl bg-primary px-4 py-3 text-left text-on-primary shadow-md shadow-primary/30'
                  : 'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-on-surface-variant transition-colors hover:bg-surface-container'
              }
              to={item.to}
            >
              <NavIcon name={item.icon} />
              <div>
                <p className="text-sm font-semibold">{item.label}</p>
                {item.subtitle ? <p className="text-[11px] opacity-80">{item.subtitle}</p> : null}
              </div>
            </Link>
          ))}
        </nav>

        <div className="mt-auto" />
      </aside>

      <header className="fixed right-0 top-0 z-[1200] flex h-16 w-full items-center justify-between border-b border-outline-variant/20 bg-surface/90 px-5 backdrop-blur-md lg:w-[calc(100%-288px)] lg:px-8">
        <h1 className="font-headline text-xl font-extrabold tracking-tight text-on-surface">{title}</h1>
        <div className="flex items-center gap-3 text-sm text-on-surface-variant">
          {headerRight}
          <div className="relative" ref={userMenuRef}>
            <button
              aria-expanded={isUserMenuOpen}
              aria-haspopup="menu"
              className="flex items-center gap-2 rounded-full border border-outline-variant/30 bg-surface-container-low px-2 py-1.5 text-on-surface transition-colors hover:bg-surface-container"
              onClick={() => setIsUserMenuOpen((prev) => !prev)}
              type="button"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary">{initial}</span>
              <ChevronDown className="h-4 w-4" />
            </button>

            {isUserMenuOpen ? (
              <div className="absolute right-0 top-12 z-[1300] min-w-[220px] rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-3 shadow-xl" role="menu">
                <div className="mb-3 rounded-lg border border-outline-variant/20 bg-surface p-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-on-surface-variant">Usuario</p>
                  <p className="mt-1 text-sm font-semibold text-on-surface">{username}</p>
                </div>
                <button
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-outline-variant/30 bg-surface px-3 py-2 text-sm font-semibold text-on-surface hover:bg-surface-container"
                  onClick={onLogout}
                  type="button"
                >
                  <LogOut className="h-4 w-4" />
                  Cerrar sesion
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main className="min-h-screen pt-16 lg:ml-72">
        <div className="p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}

function NavIcon({ name }: { name: string }) {
  const iconClass = 'h-[18px] w-[18px]';

  if (name === 'home') {
    return <Home className={iconClass} />;
  }
  if (name === 'map') {
    return <Map className={iconClass} />;
  }
  if (name === 'directions_car') {
    return <Car className={iconClass} />;
  }
  if (name === 'smart_toy') {
    return <Radar className={iconClass} />;
  }

  return <LayoutDashboard className={iconClass} />;
}
