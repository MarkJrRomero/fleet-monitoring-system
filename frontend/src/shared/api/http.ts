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

export class ApiHttpError extends Error {
  status: number;
  code?: string;
  service?: string;
  requestId?: string;
  details?: unknown;

  constructor(message: string, status: number, payload?: ApiErrorPayload) {
    super(message);
    this.name = 'ApiHttpError';
    this.status = status;
    this.code = payload?.code;
    this.service = payload?.service;
    this.requestId = payload?.request_id;
    this.details = payload?.details;
  }
}

function asApiErrorPayload(value: unknown): ApiErrorPayload | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  return value as ApiErrorPayload;
}

export async function parseApiError(response: Response, fallbackMessage: string): Promise<ApiHttpError> {
  const fallback = new ApiHttpError(fallbackMessage, response.status);

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
    return new ApiHttpError(raw, response.status);
  }

  if (!parsed) {
    return fallback;
  }

  if (typeof parsed.error === 'string') {
    return new ApiHttpError(parsed.error, response.status);
  }

  const payload = asApiErrorPayload(parsed.error);
  if (payload?.message) {
    return new ApiHttpError(payload.message, response.status, payload);
  }

  if (parsed.message) {
    return new ApiHttpError(parsed.message, response.status);
  }

  return fallback;
}

export function formatApiError(error: unknown, fallbackMessage: string): string {
  if (error instanceof ApiHttpError) {
    if (error.status === 401) {
      return 'Tu sesion no es valida o expiro. Inicia sesion nuevamente.';
    }

    if (error.status === 403) {
      return 'No tienes permisos para realizar esta accion.';
    }

    if (error.status === 404) {
      return 'El recurso solicitado no fue encontrado.';
    }

    if (error.status === 502 || error.status === 503 || error.status === 504) {
      return 'Los servicios estan temporalmente no disponibles. Intenta nuevamente en unos segundos.';
    }

    const suffixParts = [error.code, error.requestId].filter(Boolean);
    if (suffixParts.length === 0) {
      return error.message;
    }
    return `${error.message} (${suffixParts.join(' | ')})`;
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
      return 'No fue posible conectar con el servidor. Verifica tu red o que el gateway este activo.';
    }

    return error.message;
  }

  return fallbackMessage;
}
