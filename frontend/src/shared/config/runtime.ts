function trimTrailingSlash(value: string) {
	return value.replace(/\/+$/, '');
}

function buildDefaultGatewayBaseUrl() {
	const protocol = window.location.protocol;
	const hostname = window.location.hostname;
	return `${protocol}//${hostname}:8082`;
}

function normalizeWsBase(url: string) {
	if (url.startsWith('https://')) {
		return `wss://${url.slice('https://'.length)}`;
	}

	if (url.startsWith('http://')) {
		return `ws://${url.slice('http://'.length)}`;
	}

	return url;
}

const gatewayHttpBase = trimTrailingSlash(import.meta.env.VITE_GATEWAY_HTTP_BASE_URL || buildDefaultGatewayBaseUrl());

const gatewayWsBase = trimTrailingSlash(
	normalizeWsBase(import.meta.env.VITE_GATEWAY_WS_BASE_URL || gatewayHttpBase)
);

export const INGESTION_BASE_URL = `${gatewayHttpBase}/ingestion`;
export const POSITIONS_WS_URL = `${gatewayWsBase}/ws/positions`;
export const VEHICLE_BASE_URL = `${gatewayHttpBase}/vehicle`;
