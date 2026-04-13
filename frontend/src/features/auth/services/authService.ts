type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  refresh_expires_in?: number;
  token_type: string;
  scope?: string;
};

import { formatApiError, parseApiError } from '../../../shared/api/http';

type JwtPayload = {
  preferred_username?: string;
  realm_access?: {
    roles?: string[];
  };
  exp?: number;
};

const ACCESS_TOKEN_KEY = 'fleet_access_token';
const REFRESH_TOKEN_KEY = 'fleet_refresh_token';
const SESSION_EXPIRES_AT_KEY = 'fleet_session_expires_at';
const MIN_SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
const ACCESS_TOKEN_SKEW_MS = 30 * 1000;

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function buildDefaultGatewayBaseUrl() {
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  return `${protocol}//${hostname}:8082`;
}

const defaultGatewayBaseUrl = buildDefaultGatewayBaseUrl();

const AUTH_CONFIG = {
  baseUrl: trimTrailingSlash(import.meta.env.VITE_AUTH_BASE_URL || `${defaultGatewayBaseUrl}/auth`),
  realm: import.meta.env.VITE_AUTH_REALM || 'fleet-monitoring',
  clientId: import.meta.env.VITE_AUTH_CLIENT_ID || 'fleet-web-client'
};

const TOKEN_URL = `${AUTH_CONFIG.baseUrl}/realms/${AUTH_CONFIG.realm}/protocol/openid-connect/token`;

function toHumanLoginError(status?: number): string {
  if (status === 400 || status === 401) {
    return 'Usuario o contrasena incorrectos. Verifica tus datos e intenta nuevamente.';
  }

  if (status === 429) {
    return 'Demasiados intentos. Espera un momento antes de volver a intentar.';
  }

  if (status === 500 || status === 502 || status === 503 || status === 504) {
    return 'El servicio de inicio de sesion no esta disponible temporalmente. Intenta nuevamente en unos minutos.';
  }

  return 'No fue posible iniciar sesion en este momento. Intenta nuevamente.';
}

function parseJwt(token: string): JwtPayload | null {
  try {
    const [, payload] = token.split('.');

    if (!payload) {
      return null;
    }

    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded) as JwtPayload;
  } catch {
    return null;
  }
}

function saveTokens(data: TokenResponse) {
  localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);

  if (data.refresh_token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
  }

  const payload = parseJwt(data.access_token);
  const tokenExpMs = payload?.exp ? payload.exp * 1000 : 0;
  const minimumSessionMs = Date.now() + MIN_SESSION_DURATION_MS;
  const sessionExpiresAt = Math.max(minimumSessionMs, tokenExpMs);
  localStorage.setItem(SESSION_EXPIRES_AT_KEY, String(sessionExpiresAt));
}

export function clearSession() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(SESSION_EXPIRES_AT_KEY);
}

export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export async function fetchWithAuth(input: RequestInfo | URL, init: RequestInit = {}) {
  const hasSession = await ensureSession();
  if (!hasSession) {
    throw new Error('La sesion expiro. Inicia sesion nuevamente.');
  }

  const token = getAccessToken();
  if (!token) {
    throw new Error('No hay un token de acceso disponible.');
  }

  const headers = new Headers(init.headers ?? {});
  headers.set('Authorization', `Bearer ${token}`);

  return fetch(input, {
    ...init,
    headers
  });
}

export async function buildAuthorizedWebSocketUrl(url: string) {
  const hasSession = await ensureSession();
  if (!hasSession) {
    throw new Error('La sesion expiro. Inicia sesion nuevamente.');
  }

  const token = getAccessToken();
  if (!token) {
    throw new Error('No hay un token de acceso disponible.');
  }

  const resolved = new URL(url, window.location.origin);
  resolved.searchParams.set('access_token', token);
  return resolved.toString();
}

export function isAuthenticated() {
  const token = getAccessToken();

  if (!token) {
    return false;
  }

  const sessionExpiresAt = Number(localStorage.getItem(SESSION_EXPIRES_AT_KEY) || '0');
  if (!Number.isFinite(sessionExpiresAt) || sessionExpiresAt <= Date.now()) {
    return false;
  }

  return true;
}

function isAccessTokenValid() {
  const token = getAccessToken();
  if (!token) {
    return false;
  }

  const payload = parseJwt(token);

  if (!payload?.exp) {
    return false;
  }

  return payload.exp * 1000 > Date.now() + ACCESS_TOKEN_SKEW_MS;
}

export async function ensureSession() {
  if (!isAuthenticated()) {
    clearSession();
    return false;
  }

  if (isAccessTokenValid()) {
    return true;
  }

  try {
    await refreshSession();
    return true;
  } catch {
    clearSession();
    return false;
  }
}

export function getUsername() {
  const token = getAccessToken();
  const payload = token ? parseJwt(token) : null;
  return payload?.preferred_username ?? 'usuario';
}

export function hasRealmRole(role: string) {
  const token = getAccessToken();
  const payload = token ? parseJwt(token) : null;
  const roles = payload?.realm_access?.roles ?? [];
  return roles.includes(role);
}

export async function loginViaApi(username: string, password: string) {
  clearSession();

  if (!username.trim() || !password.trim()) {
    throw new Error('Ingresa tu usuario y contrasena para continuar.');
  }

  const params = new URLSearchParams();
  params.append('grant_type', 'password');
  params.append('client_id', AUTH_CONFIG.clientId);
  params.append('username', username);
  params.append('password', password);

  let response: Response;

  try {
    response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });
  } catch (error) {
    throw new Error(formatApiError(error, 'No pudimos conectarnos al servidor. Revisa tu internet e intenta nuevamente.'));
  }

  if (!response.ok) {
    clearSession();
    const parsedError = await parseApiError(response, toHumanLoginError(response.status));
    throw new Error(toHumanLoginError(parsedError.status));
  }

  const data = (await response.json()) as TokenResponse;
  saveTokens(data);

  if (!hasRealmRole('admin')) {
    clearSession();
    throw new Error('Solo los administradores pueden ingresar al panel web');
  }

  return data;
}

export async function refreshSession() {
  const refreshToken = getRefreshToken();

  if (!refreshToken) {
    throw new Error('No existe refresh token');
  }

  const params = new URLSearchParams();
  params.append('grant_type', 'refresh_token');
  params.append('client_id', AUTH_CONFIG.clientId);
  params.append('refresh_token', refreshToken);

  let response: Response;

  try {
    response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });
  } catch (error) {
    throw new Error(
      formatApiError(error, 'No fue posible validar tu sesion por un problema de red.')
    );
  }

  if (!response.ok) {
    clearSession();
    throw await parseApiError(response, 'No fue posible refrescar la sesion');
  }

  const data = (await response.json()) as TokenResponse;
  saveTokens(data);
  return data;
}