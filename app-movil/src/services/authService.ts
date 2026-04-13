import * as SecureStore from 'expo-secure-store';
import { AUTH_CLIENT_ID, AUTH_TOKEN_URL } from '../config/runtime';
import { Session, TokenResponse } from '../types/domain';

const SESSION_STORAGE_KEY = 'fleet_mobile_session';

type KeycloakErrorResponse = {
  error?: string;
  error_description?: string;
};

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

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const [, payload] = token.split('.');
    if (!payload) {
      return {};
    }

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');

    let decoded = '';
    if (typeof atob === 'function') {
      decoded = atob(padded);
    } else {
      return {};
    }

    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function buildSession(tokenData: TokenResponse): Session {
  const payload = decodeJwtPayload(tokenData.access_token);
  const expClaim = typeof payload.exp === 'number' ? payload.exp * 1000 : Date.now() + tokenData.expires_in * 1000;
  const username = typeof payload.preferred_username === 'string' ? payload.preferred_username : 'conductor';
  const realmAccess = payload.realm_access;
  const roles =
    typeof realmAccess === 'object' && realmAccess && Array.isArray((realmAccess as { roles?: unknown[] }).roles)
      ? (realmAccess as { roles: unknown[] }).roles.filter((role): role is string => typeof role === 'string')
      : [];

  return {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt: expClaim,
    username,
    roles
  };
}

async function parseKeycloakError(response: Response): Promise<string> {
  const rawText = await response.text();

  try {
    const parsed = JSON.parse(rawText) as KeycloakErrorResponse;
    if (parsed.error_description) {
      return parsed.error_description;
    }
    if (parsed.error) {
      return parsed.error;
    }
  } catch {
    // Mantiene fallback con texto plano cuando no viene JSON.
  }

  return rawText || 'Error desconocido en autenticacion';
}

export async function login(username: string, password: string): Promise<Session> {
  await clearSession();

  if (!username.trim() || !password.trim()) {
    throw new Error('Ingresa tu usuario y contrasena para continuar.');
  }

  const params = new URLSearchParams();
  params.append('grant_type', 'password');
  params.append('client_id', AUTH_CLIENT_ID);
  params.append('username', username);
  params.append('password', password);

  console.log('[Auth] Intentando login Keycloak', {
    tokenUrl: AUTH_TOKEN_URL,
    clientId: AUTH_CLIENT_ID,
    username
  });

  let response: Response;

  try {
    response = await fetch(AUTH_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      body: params.toString()
    });
  } catch (error) {
    console.error('[Auth] Error de red durante login', {
      tokenUrl: AUTH_TOKEN_URL,
      clientId: AUTH_CLIENT_ID,
      username,
      error
    });
    await clearSession();
    throw new Error('No pudimos conectarnos al servidor. Revisa tu internet e intenta nuevamente.');
  }

  if (!response.ok) {
    const reason = await parseKeycloakError(response);
    console.error('[Auth] Error de login Keycloak', {
      status: response.status,
      statusText: response.statusText,
      reason,
      tokenUrl: AUTH_TOKEN_URL,
      clientId: AUTH_CLIENT_ID,
      username
    });
    await clearSession();

    throw new Error(toHumanLoginError(response.status));
  }

  const tokenData = (await response.json()) as TokenResponse;
  console.log('[Auth] Login Keycloak exitoso', {
    username,
    tokenType: tokenData.token_type,
    expiresIn: tokenData.expires_in
  });

  const session = buildSession(tokenData);
  await SecureStore.setItemAsync(SESSION_STORAGE_KEY, JSON.stringify(session));
  return session;
}

export async function readSession(): Promise<Session | null> {
  const raw = await SecureStore.getItemAsync(SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Session;
    if (!parsed.accessToken || parsed.expiresAt < Date.now()) {
      await clearSession();
      return null;
    }

    if (!Array.isArray(parsed.roles)) {
      return { ...parsed, roles: [] };
    }

    return parsed;
  } catch {
    await clearSession();
    return null;
  }
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY);
}
