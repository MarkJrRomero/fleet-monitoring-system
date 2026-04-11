type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  refresh_expires_in?: number;
  token_type: string;
  scope?: string;
};

type JwtPayload = {
  preferred_username?: string;
  realm_access?: {
    roles?: string[];
  };
  exp?: number;
};

const ACCESS_TOKEN_KEY = 'fleet_access_token';
const REFRESH_TOKEN_KEY = 'fleet_refresh_token';

const AUTH_CONFIG = {
  tokenUrl: 'http://localhost:8080/realms/fleet-monitoring/protocol/openid-connect/token',
  clientId: 'fleet-web-client'
};

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
}

export function clearSession() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function isAuthenticated() {
  const token = getAccessToken();

  if (!token) {
    return false;
  }

  const payload = parseJwt(token);

  if (!payload?.exp) {
    return false;
  }

  return payload.exp * 1000 > Date.now();
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

  const params = new URLSearchParams();
  params.append('grant_type', 'password');
  params.append('client_id', AUTH_CONFIG.clientId);
  params.append('username', username);
  params.append('password', password);

  const response = await fetch(AUTH_CONFIG.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params
  });

  if (!response.ok) {
    clearSession();
    throw new Error('Credenciales invalidas');
  }

  const data = (await response.json()) as TokenResponse;
  saveTokens(data);
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

  const response = await fetch(AUTH_CONFIG.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params
  });

  if (!response.ok) {
    clearSession();
    throw new Error('No fue posible refrescar la sesion');
  }

  const data = (await response.json()) as TokenResponse;
  saveTokens(data);
  return data;
}