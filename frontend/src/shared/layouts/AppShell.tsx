import { ReactNode, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Car, ChevronDown, Home, LayoutDashboard, LogOut, Map, Menu, PanelLeftClose, PanelLeftOpen, Radar, X } from 'lucide-react';

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

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'fleet-monitoring.sidebar-collapsed';

export function AppShell({
  title,
  username,
  navItems,
  headerRight,
  onLogout,
  children
}: AppShellProps) {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    try {
      return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
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
        setIsMobileSidebarOpen(false);
      }
    };

    document.addEventListener('mousedown', onDocumentClick);
    document.addEventListener('keydown', onEscape);

    return () => {
      document.removeEventListener('mousedown', onDocumentClick);
      document.removeEventListener('keydown', onEscape);
    };
  }, []);

  useEffect(() => {
    if (!isMobileSidebarOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileSidebarOpen]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, isSidebarCollapsed ? '1' : '0');
    } catch {
      // noop: persistencia opcional
    }
  }, [isSidebarCollapsed]);

  const initial = username?.trim()?.charAt(0)?.toUpperCase() || 'U';
  const desktopSidebarClass = isSidebarCollapsed ? 'lg:w-20' : 'lg:w-72';
  const desktopHeaderClass = isSidebarCollapsed ? 'lg:left-20 lg:w-[calc(100%-80px)]' : 'lg:left-72 lg:w-[calc(100%-288px)]';
  const desktopMainClass = isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-72';

  return (
    <div className="min-h-screen bg-surface text-on-surface antialiased">
      {isMobileSidebarOpen ? (
        <div
          className="fixed inset-0 z-[1200] bg-slate-950/40 backdrop-blur-[1px] lg:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed left-0 top-0 z-[1300] flex h-full w-72 -translate-x-full flex-col border-r border-outline-variant/20 bg-surface-container-lowest/95 p-4 transition-transform duration-300 lg:translate-x-0 ${desktopSidebarClass} ${isMobileSidebarOpen ? 'translate-x-0' : ''}`}
      >
        <div className="mb-8 flex items-start justify-between gap-3">
          <div>
            <p className="font-headline text-xl font-extrabold tracking-tight">SMTF</p>
            <p className={`${isSidebarCollapsed ? 'text-xs text-on-surface-variant lg:hidden' : 'text-xs text-on-surface-variant'}`}>Centro de monitoreo</p>
          </div>

          <div className="flex items-center gap-1">
            <button
              className="inline-flex rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container lg:hidden"
              onClick={() => setIsMobileSidebarOpen(false)}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className={`${isSidebarCollapsed ? 'mb-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-on-surface-variant lg:hidden' : 'mb-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-on-surface-variant'}`}>Navegacion</div>
        <nav className="space-y-2">
          {navItems.map((item) => {
            const isMainMapItem = item.to === '/';
            const renderedLabel = isMainMapItem ? 'Mapa' : item.label;
            const renderedIcon = isMainMapItem ? 'map' : item.icon;

            return (
              <Link
                key={item.to}
                className={
                  item.active
                    ? `flex w-full items-center gap-3 rounded-xl bg-primary py-3 text-left text-on-primary shadow-md shadow-primary/30 ${isSidebarCollapsed ? 'px-4 lg:justify-center lg:px-0' : 'px-4'}`
                    : `flex w-full items-center gap-3 rounded-xl py-3 text-left text-on-surface-variant transition-colors hover:bg-surface-container ${isSidebarCollapsed ? 'px-4 lg:justify-center lg:px-0' : 'px-4'}`
                }
                to={item.to}
                onClick={() => setIsMobileSidebarOpen(false)}
              >
                <NavIcon name={renderedIcon} />
                <div className={isSidebarCollapsed ? 'lg:hidden' : ''}>
                  <p className="text-sm font-semibold">{renderedLabel}</p>
                  {item.subtitle ? <p className="text-[11px] opacity-80">{item.subtitle}</p> : null}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-outline-variant/20 pt-3">
          <button
            className={`hidden w-full items-center gap-2 rounded-lg border border-outline-variant/30 bg-surface px-3 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container lg:flex ${isSidebarCollapsed ? 'justify-center px-0' : ''}`}
            onClick={() => setIsSidebarCollapsed((prev) => !prev)}
            type="button"
          >
            {isSidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            <span className={isSidebarCollapsed ? 'lg:hidden' : ''}>{isSidebarCollapsed ? 'Expandir' : 'Colapsar sidebar'}</span>
          </button>
        </div>
      </aside>

      <header className={`fixed right-0 top-0 z-[1200] flex h-16 w-full items-center justify-between border-b border-outline-variant/20 bg-surface px-4 sm:px-5 lg:px-8 ${desktopHeaderClass}`}>
        <div className="flex items-center gap-3">
          <button
            className="inline-flex rounded-lg border border-outline-variant/30 bg-surface-container-low p-2 text-on-surface-variant hover:bg-surface-container lg:hidden"
            onClick={() => setIsMobileSidebarOpen(true)}
            type="button"
          >
            <Menu className="h-4 w-4" />
          </button>
          <h1 className="font-headline text-lg font-extrabold tracking-tight text-on-surface sm:text-xl">{title}</h1>
        </div>
        <div className="flex items-center gap-3 text-sm text-on-surface-variant">
          <div className="hidden sm:block">{headerRight}</div>
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

      <main className={`min-h-screen pt-16 ${desktopMainClass}`}>
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
