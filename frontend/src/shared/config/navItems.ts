import { NavItem } from '../layouts/AppShell';

const BASE_MAIN_NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: 'map', subtitle: 'Alertas y mapa' },
  { to: '/vehiculos', label: 'Vehiculos', icon: 'directions_car', subtitle: 'Listado de vehículos' },
  { to: '/simulacion', label: 'Simulacion', icon: 'smart_toy', subtitle: 'Generador de flota' }
];

export function getMainNavItems(activeTo: string): NavItem[] {
  return BASE_MAIN_NAV_ITEMS.map((item) => ({
    ...item,
    active: item.to === activeTo
  }));
}
