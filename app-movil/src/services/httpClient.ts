export type ApiErrorPayload = {
  code?: string;
  message?: string;
  status?: number;
  service?: string;
  request_id?: string;
  timestamp?: string;
  details?: unknown;
};

type ErrorEnvelope = {
  error?: string | ApiErrorPayload;
  message?: string;
};

export class ApiServiceError extends Error {
  status: number;
  code?: string;
  service?: string;
  requestId?: string;
  details?: unknown;

  constructor(message: string, status: number, payload?: ApiErrorPayload) {
    super(message);
    this.name = 'ApiServiceError';
    this.status = status;
    this.code = payload?.code;
    this.service = payload?.service;
    this.requestId = payload?.request_id;
    this.details = payload?.details;
  }
}

const MAX_HUMAN_ERROR_LENGTH = 140;

function sanitizeHumanMessage(message: string | undefined, fallbackMessage: string): string {
  if (!message) {
    return fallbackMessage;
  }

  const normalized = message.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return fallbackMessage;
  }

  const lower = normalized.toLowerCase();
  if (
    normalized.length > MAX_HUMAN_ERROR_LENGTH ||
    lower.includes('exception') ||
    lower.includes('stack') ||
    lower.includes('<html') ||
    lower.includes('traceback')
  ) {
    return fallbackMessage;
  }

  return normalized;
}

function asApiErrorPayload(value: unknown): ApiErrorPayload | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  return value as ApiErrorPayload;
}

export async function parseServiceError(response: Response, fallbackMessage: string): Promise<ApiServiceError> {
  const fallback = new ApiServiceError(fallbackMessage, response.status);

  let raw = '';
  try {
    raw = await response.text();
  } catch {
    return fallback;
  }

  if (!raw) {
    return fallback;
  }

  let parsed: ErrorEnvelope | null = null;
  try {
    parsed = JSON.parse(raw) as ErrorEnvelope;
  } catch {
    return new ApiServiceError(raw, response.status);
  }

  if (!parsed) {
    return fallback;
  }

  if (typeof parsed.error === 'string') {
    return new ApiServiceError(parsed.error, response.status);
  }

  const payload = asApiErrorPayload(parsed.error);
  if (payload?.message) {
    return new ApiServiceError(payload.message, response.status, payload);
  }

  if (parsed.message) {
    return new ApiServiceError(parsed.message, response.status);
  }

  return fallback;
}

export function formatServiceError(error: unknown, fallbackMessage: string): string {
  if (error instanceof ApiServiceError) {
    if (error.status === 401) {
      return 'Tu sesion no es valida o expiro. Inicia sesion nuevamente.';
    }

    if (error.status === 403) {
      return 'No tienes permisos para realizar esta accion.';
    }

    if (error.status === 404) {
      return 'El recurso solicitado no fue encontrado.';
    }

    if (error.status === 500 || error.status === 502 || error.status === 503 || error.status === 504) {
      return 'Los servicios estan temporalmente no disponibles. Intenta nuevamente en unos segundos.';
    }

    if (error.status === 429) {
      return 'Se alcanzo el limite de solicitudes. Espera un momento e intenta de nuevo.';
    }

    return sanitizeHumanMessage(error.message, fallbackMessage);
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (error.name === 'AbortError') {
      return 'La solicitud tardo demasiado y fue cancelada. Intenta nuevamente.';
    }

    if (
      message.includes('failed to fetch') ||
      message.includes('networkerror') ||
      message.includes('load failed') ||
      message.includes('cors')
    ) {
      return 'No fue posible conectar con el servidor. Verifica tu red e intenta nuevamente.';
    }

    return sanitizeHumanMessage(error.message, fallbackMessage);
  }

  return fallbackMessage;
}
