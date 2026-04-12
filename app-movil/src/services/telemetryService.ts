import {
  ALERTS_WS_URL,
  DRIVER_SIMULATION_START_URL,
  DRIVER_SIMULATION_STATUS_URL,
  DRIVER_SIMULATION_STOP_URL,
  INGESTION_GPS_URL,
  POSITIONS_WS_URL,
  VEHICLES_URL
} from '../config/runtime';
import { parseServiceError } from './httpClient';
import { AlertEvent, PositionEvent, Vehicle } from '../types/domain';

type VehiclesResponse = {
  vehicles?: Vehicle[];
};

type IngestionPayload = {
  vehicle_id: string;
  lat: number;
  lng: number;
  speed_kmh: number;
  status: string;
  panic_button?: boolean;
  timestamp: string;
};

export type SimulationStatus = {
  running: boolean;
  selected_count: number;
  tick_ms: number;
  requests_sent: number;
  errors_count: number;
  started_at?: string;
  last_error?: string;
};

export async function fetchVehicles(accessToken?: string): Promise<Vehicle[]> {
  const response = await fetch(VEHICLES_URL, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined
  });

  if (!response.ok) {
    throw await parseServiceError(response, 'No se pudo cargar el catalogo de vehiculos');
  }

  const data = (await response.json()) as VehiclesResponse;
  return data.vehicles || [];
}

export async function sendTelemetry(payload: IngestionPayload, accessToken?: string): Promise<void> {
  const response = await fetch(INGESTION_GPS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw await parseServiceError(response, 'No se pudo enviar telemetria');
  }
}

export async function getDriverSimulationStatus(accessToken?: string): Promise<SimulationStatus> {
  const response = await fetch(DRIVER_SIMULATION_STATUS_URL, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined
  });

  if (!response.ok) {
    throw await parseServiceError(response, 'No se pudo consultar la simulacion del conductor');
  }

  return (await response.json()) as SimulationStatus;
}

export async function startDriverSimulation(tickMS: number, accessToken?: string): Promise<SimulationStatus> {
  const response = await fetch(DRIVER_SIMULATION_START_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
    },
    body: JSON.stringify({ tick_ms: tickMS })
  });

  if (!response.ok) {
    throw await parseServiceError(response, 'No se pudo iniciar la simulacion del conductor');
  }

  return (await response.json()) as SimulationStatus;
}

export async function stopDriverSimulation(accessToken?: string): Promise<SimulationStatus> {
  const response = await fetch(DRIVER_SIMULATION_STOP_URL, {
    method: 'POST',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined
  });

  if (!response.ok) {
    throw await parseServiceError(response, 'No se pudo detener la simulacion del conductor');
  }

  return (await response.json()) as SimulationStatus;
}

type WsHandlers<T> = {
  onMessage: (event: T) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: () => void;
};

function connectWs<T>(url: string, accessToken: string | undefined, handlers: WsHandlers<T>): () => void {
  const socketURL = accessToken
    ? `${url}${url.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(accessToken)}`
    : url;
  const socket = new WebSocket(socketURL);

  socket.onopen = () => handlers.onOpen?.();
  socket.onclose = () => handlers.onClose?.();
  socket.onerror = () => handlers.onError?.();

  socket.onmessage = (message) => {
    try {
      const parsed = JSON.parse(message.data as string) as T;
      handlers.onMessage(parsed);
    } catch {
      // Ignora mensajes malformados en el stream.
    }
  };

  return () => {
    socket.close();
  };
}

export function connectPositions(accessToken: string | undefined, handlers: WsHandlers<PositionEvent>): () => void {
  return connectWs<PositionEvent>(POSITIONS_WS_URL, accessToken, handlers);
}

export function connectAlerts(accessToken: string | undefined, handlers: WsHandlers<AlertEvent>): () => void {
  return connectWs<AlertEvent>(ALERTS_WS_URL, accessToken, handlers);
}
