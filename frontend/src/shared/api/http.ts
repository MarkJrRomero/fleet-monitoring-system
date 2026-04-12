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
    const suffixParts = [error.code, error.requestId].filter(Boolean);
    if (suffixParts.length === 0) {
      return error.message;
    }
    return `${error.message} (${suffixParts.join(' | ')})`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallbackMessage;
}
