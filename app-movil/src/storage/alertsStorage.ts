import AsyncStorage from '@react-native-async-storage/async-storage';
import { LocalAlert } from '../types/domain';

const ALERTS_KEY = 'fleet_mobile_alerts';
const LIMIT = 100;

export async function loadAlerts(): Promise<LocalAlert[]> {
  const raw = await AsyncStorage.getItem(ALERTS_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as LocalAlert[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveAlerts(alerts: LocalAlert[]): Promise<void> {
  await AsyncStorage.setItem(ALERTS_KEY, JSON.stringify(alerts.slice(0, LIMIT)));
}

export async function appendAlert(alert: LocalAlert): Promise<LocalAlert[]> {
  const existing = await loadAlerts();
  const next = [alert, ...existing].slice(0, LIMIT);
  await saveAlerts(next);
  return next;
}
