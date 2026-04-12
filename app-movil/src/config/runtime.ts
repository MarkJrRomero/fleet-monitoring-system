function stripTrailingSlash(value: string): string {
	return value.replace(/\/+$/, '');
}

function toWsBaseUrl(value: string): string {
	if (value.startsWith('https://')) {
		return `wss://${value.slice('https://'.length)}`;
	}

	if (value.startsWith('http://')) {
		return `ws://${value.slice('http://'.length)}`;
	}

	return value;
}

const API_HOST = (process.env.EXPO_PUBLIC_API_HOST || 'localhost').trim();
const API_SCHEME = (process.env.EXPO_PUBLIC_API_SCHEME || 'http').trim();
const apiBaseFromEnv = stripTrailingSlash((process.env.EXPO_PUBLIC_API_BASE_URL || '').trim());

const apiBaseUrl = apiBaseFromEnv || `${API_SCHEME}://${API_HOST}:8082`;

const wsBaseFromEnv = stripTrailingSlash((process.env.EXPO_PUBLIC_WS_BASE_URL || '').trim());
const wsBaseUrl = wsBaseFromEnv || toWsBaseUrl(apiBaseUrl);

export const AUTH_TOKEN_URL = `${apiBaseUrl}/auth/realms/fleet-monitoring/protocol/openid-connect/token`;
export const AUTH_CLIENT_ID = process.env.EXPO_PUBLIC_AUTH_CLIENT_ID || 'fleet-web-client';

export const VEHICLES_URL = `${apiBaseUrl}/vehicle/api/v1/vehicles`;
export const DRIVER_SIMULATION_STATUS_URL = `${apiBaseUrl}/vehicle/api/v1/driver-simulation/status`;
export const DRIVER_SIMULATION_START_URL = `${apiBaseUrl}/vehicle/api/v1/driver-simulation/start`;
export const DRIVER_SIMULATION_STOP_URL = `${apiBaseUrl}/vehicle/api/v1/driver-simulation/stop`;
export const INGESTION_GPS_URL = `${apiBaseUrl}/ingestion/api/v1/ingestion/gps`;

export const POSITIONS_WS_URL = `${wsBaseUrl}/ws/positions`;
export const ALERTS_WS_URL = `${wsBaseUrl}/ws/alerts`;

export const DEFAULT_VEHICLE_ID = process.env.EXPO_PUBLIC_DEFAULT_VEHICLE_ID || 'SIM-00001';
