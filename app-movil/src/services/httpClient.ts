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
