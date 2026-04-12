import AsyncStorage from '@react-native-async-storage/async-storage';
import { LocalTelemetryEvent } from '../types/domain';

const SIMULATOR_QUEUE_KEY = 'fleet_mobile_simulator_queue';
const LIMIT = 120;

export async function loadSimulatorQueue(): Promise<LocalTelemetryEvent[]> {
  const raw = await AsyncStorage.getItem(SIMULATOR_QUEUE_KEY);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as LocalTelemetryEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveSimulatorQueue(events: LocalTelemetryEvent[]): Promise<void> {
  await AsyncStorage.setItem(SIMULATOR_QUEUE_KEY, JSON.stringify(events.slice(0, LIMIT)));
}
