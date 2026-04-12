import { ReactNode, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { gsap } from 'gsap';
import { Car, ChevronDown, Home, LayoutDashboard, LogOut, Map, Menu, PanelLeftClose, PanelLeftOpen, Radar, X } from 'lucide-react';

export type NavItem = {
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
const SIDEBAR_W_EXPANDED = 288;
const SIDEBAR_W_COLLAPSED = 80;

export function AppShell({
  title,
  username,
  navItems,
  headerRight,
  onLogout,
  children
}: AppShellProps) {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') {
      return true;
    }

    return window.matchMedia('(min-width: 1024px)').matches;
  });
  const [isWideDesktop, setIsWideDesktop] = useState(() => {
    if (typeof window === 'undefined') {
      return true;
    }

    return window.matchMedia('(min-width: 1280px)').matches;
  });
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
  const sidebarRef = useRef<HTMLElement | null>(null);
  const headerElRef = useRef<HTMLElement | null>(null);
  const mainElRef = useRef<HTMLElement | null>(null);
  const isFirstSidebarAnimRef = useRef(true);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const desktopMq = window.matchMedia('(min-width: 1024px)');
    const wideDesktopMq = window.matchMedia('(min-width: 1280px)');

    const syncMatches = () => {
      setIsDesktop(desktopMq.matches);
      setIsWideDesktop(wideDesktopMq.matches);

      if (!desktopMq.matches) {
        setIsMobileSidebarOpen(false);
      }
    };

    syncMatches();

    const onChange = () => {
      syncMatches();
    };

    if (typeof desktopMq.addEventListener === 'function') {
      desktopMq.addEventListener('change', onChange);
      wideDesktopMq.addEventListener('change', onChange);

      return () => {
        desktopMq.removeEventListener('change', onChange);
        wideDesktopMq.removeEventListener('change', onChange);
      };
    }

    desktopMq.addListener(onChange);
    wideDesktopMq.addListener(onChange);

    return () => {
      desktopMq.removeListener(onChange);
      wideDesktopMq.removeListener(onChange);
    };
  }, []);

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

  const effectiveSidebarCollapsed = isDesktop && !isWideDesktop ? true : isSidebarCollapsed;

  useEffect(() => {
    const sidebar = sidebarRef.current;
    const headerEl = headerElRef.current;
    const mainEl = mainElRef.current;
    if (!sidebar || !headerEl || !mainEl) {
      return;
    }

    const labels = sidebar.querySelectorAll<HTMLElement>('.sidebar-label');

    if (!isDesktop) {
      gsap.set(sidebar, { clearProps: 'width' });
      gsap.set(headerEl, { clearProps: 'left,width' });
      gsap.set(mainEl, { clearProps: 'marginLeft' });
      gsap.set(labels, { clearProps: 'opacity' });
      isFirstSidebarAnimRef.current = false;
      return;
    }

    const targetW = effectiveSidebarCollapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W_EXPANDED;

    if (isFirstSidebarAnimRef.current) {
      isFirstSidebarAnimRef.current = false;
      gsap.set(sidebar, { width: targetW });
      gsap.set(headerEl, { left: targetW, width: `calc(100% - ${targetW}px)` });
      gsap.set(mainEl, { marginLeft: targetW });
      gsap.set(labels, { opacity: effectiveSidebarCollapsed ? 0 : 1 });
      return;
    }

    const duration = 0.42;
    const ease = 'power3.inOut';

    gsap.to(sidebar, { width: targetW, duration, ease });
    gsap.to(headerEl, { left: targetW, width: `calc(100% - ${targetW}px)`, duration, ease });
    gsap.to(mainEl, { marginLeft: targetW, duration, ease });

    if (effectiveSidebarCollapsed) {
      gsap.to(labels, { opacity: 0, duration: 0.15, ease: 'power2.in' });
    } else {
      gsap.to(labels, { opacity: 1, duration: 0.22, delay: 0.26, ease: 'power2.out' });
    }
  }, [effectiveSidebarCollapsed, isDesktop]);

  const initial = username?.trim()?.charAt(0)?.toUpperCase() || 'U';
  const desktopSidebarClass = effectiveSidebarCollapsed ? 'lg:w-20' : 'xl:w-72';
  const desktopHeaderClass = effectiveSidebarCollapsed ? 'lg:left-20 lg:w-[calc(100%-80px)]' : 'xl:left-72 xl:w-[calc(100%-288px)]';
  const desktopMainClass = effectiveSidebarCollapsed ? 'lg:ml-20' : 'xl:ml-72';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 antialiased">
      {isMobileSidebarOpen ? (
        <div
          className="fixed inset-0 z-[1200] bg-slate-900/30 backdrop-blur-[2px] lg:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      ) : null}

      <aside
        ref={sidebarRef}
        className={`fixed left-0 top-0 z-[1300] flex h-full w-72 -translate-x-full flex-col overflow-hidden border-r border-white/60 bg-white/90 p-3 shadow-xl backdrop-blur-xl transition-transform duration-300 lg:translate-x-0 xl:p-4 ${desktopSidebarClass} ${isMobileSidebarOpen ? 'translate-x-0' : ''}`}
      >
        <div className={`${effectiveSidebarCollapsed ? 'mb-2' : 'mb-6 xl:mb-8'} flex items-start justify-between gap-3`}>
          <div className="flex items-center gap-3">
            <div className={`sidebar-label overflow-hidden transition-[max-width,opacity] duration-300 ${effectiveSidebarCollapsed ? 'max-w-0 opacity-0' : 'max-w-[180px] opacity-100'}`}>
              <p className="font-headline text-lg font-extrabold tracking-tight text-slate-800">SMTF</p>
              <p className="text-[11px] text-slate-400">Centro de monitoreo</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              className="inline-flex rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 lg:hidden"
              onClick={() => setIsMobileSidebarOpen(false)}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className={`sidebar-label overflow-hidden text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400 transition-[max-width,opacity,margin] duration-300 ${effectiveSidebarCollapsed ? 'mb-0 max-h-0 max-w-0 opacity-0' : 'mb-3 max-w-[180px] opacity-100'}`}>Navegacion</div>
        <nav className="space-y-2.5">
          {navItems.map((item) => {
            const isMainMapItem = item.to === '/';
            const renderedLabel = isMainMapItem ? 'Mapa' : item.label;
            const renderedIcon = isMainMapItem ? 'map' : item.icon;

            return (
              <Link
                key={item.to}
                className={
                  item.active
                    ? `flex w-full items-center rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 py-3 text-left text-white shadow-md shadow-teal-400/25 transition-colors ${effectiveSidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-3'}`
                    : `flex w-full items-center rounded-xl py-3 text-left text-slate-500 transition-colors hover:bg-slate-100/80 hover:text-slate-700 ${effectiveSidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-3'}`
                }
                to={item.to}
                onClick={() => setIsMobileSidebarOpen(false)}
              >
                <span className={item.active ? 'text-white' : 'text-slate-400'}>
                  <NavIcon name={renderedIcon} />
                </span>
                <div className={`sidebar-label overflow-hidden transition-[max-width,opacity] duration-300 ${effectiveSidebarCollapsed ? 'max-w-0 opacity-0' : 'max-w-[180px] opacity-100'}`}>
                  <p className="text-sm font-semibold">{renderedLabel}</p>
                  {item.subtitle ? <p className="text-[11px] opacity-70">{item.subtitle}</p> : null}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-slate-100 pt-3">
          <button
            className={`hidden w-full items-center rounded-xl border border-slate-200 bg-slate-50 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 xl:flex ${effectiveSidebarCollapsed ? 'justify-center px-0' : 'gap-2 px-3'}`}
            onClick={() => setIsSidebarCollapsed((prev) => !prev)}
            type="button"
          >
            {effectiveSidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            <span className={`sidebar-label overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-300 ${effectiveSidebarCollapsed ? 'max-w-0 opacity-0' : 'max-w-[180px] opacity-100'}`}>{effectiveSidebarCollapsed ? 'Expandir' : 'Colapsar sidebar'}</span>
          </button>
        </div>
      </aside>

      <header ref={headerElRef} className={`fixed right-0 top-0 z-[1200] flex h-16 w-full items-center justify-between gap-3 border-b border-white/60 bg-white/80 px-4 shadow-sm backdrop-blur-xl sm:px-5 lg:px-6 xl:px-8 ${desktopHeaderClass}`}>
        <div className="flex items-center gap-3">
          <button
            className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
            onClick={() => setIsMobileSidebarOpen(true)}
            type="button"
          >
            <Menu className="h-4 w-4" />
          </button>
          <h1 className="hidden max-w-[34vw] truncate font-headline text-base font-extrabold tracking-tight text-slate-800 sm:block lg:max-w-[42vw] xl:max-w-none xl:text-xl">{title}</h1>
        </div>

        <div className="flex items-center gap-2 text-sm text-slate-500 sm:gap-3">
          <div className="hidden xl:block">{headerRight}</div>
          <div className="relative" ref={userMenuRef}>
            <button
              aria-expanded={isUserMenuOpen}
              aria-haspopup="menu"
              className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-1.5 text-slate-700 transition-colors hover:bg-slate-100"
              onClick={() => setIsUserMenuOpen((prev) => !prev)}
              type="button"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 text-xs font-bold text-white shadow-sm">{initial}</span>
              <span className="hidden max-w-[120px] truncate text-sm font-medium xl:block">{username}</span>
              <ChevronDown className="h-4 w-4" />
            </button>

            {isUserMenuOpen ? (
              <div className="absolute right-0 top-12 z-[1300] min-w-[220px] rounded-2xl border border-white/60 bg-white/90 p-3 shadow-xl backdrop-blur-xl" role="menu">
                <div className="mb-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Usuario</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{username}</p>
                </div>
                <button
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-800"
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

      <main ref={mainElRef} className={`min-h-screen bg-slate-50 pt-16 ${desktopMainClass}`}>
        <div className="p-4 sm:p-5 lg:p-6 xl:p-8">{children}</div>
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
