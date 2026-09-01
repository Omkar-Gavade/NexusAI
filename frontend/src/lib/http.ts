import { ErrorResponse, errorMessages, type ErrorCode } from '@nexusai/contracts';

const BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

/**
 * A failure the UI can render. `code` drives behaviour, `message` is always
 * presentable to a person — the API guarantees it carries no stack trace,
 * provider body, or internal identifier.
 */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    override readonly message: string,
    readonly status: number,
    readonly requestId: string | null = null,
    readonly details: ReadonlyArray<{ path: string; message: string }> = [],
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Field-scoped issues, for attaching validation errors to inputs. */
  fieldError(path: string): string | undefined {
    return this.details.find((d) => d.path === path)?.message;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** Retry is safe only for transport-level failures, never for a 4xx. */
export function isRetryable(error: unknown): boolean {
  if (!isApiError(error)) return true;
  return error.status >= 500 || error.status === 429;
}

const offline = () =>
  new ApiError('NETWORK_ERROR', "You're offline. Check your connection.", 0);

async function toApiError(response: Response): Promise<ApiError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  const parsed = ErrorResponse.safeParse(body);
  if (parsed.success) {
    const { code, message, requestId, details, retryAfterSeconds } = parsed.data.error;
    return new ApiError(
      code,
      message,
      response.status,
      requestId,
      details ?? [],
      retryAfterSeconds ?? null,
    );
  }

  // The API always returns the envelope. Reaching here means a proxy or gateway
  // answered instead, so there is no code to trust and we say the honest thing.
  return new ApiError('INTERNAL', errorMessages.INTERNAL, response.status);
}

let refreshInFlight: Promise<boolean> | null = null;

/** One refresh at a time, shared by every request that races a 401. */
function refreshSession(): Promise<boolean> {
  refreshInFlight ??= fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'X-Nexus-Client': 'web' },
  })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * Every call goes through here so the cookie mode, the CSRF header, and the
 * single-retry refresh behaviour exist in exactly one place.
 */
export async function request(path: string, options: RequestOptions = {}): Promise<Response> {
  const { method = 'GET', body, signal } = options;

  const send = (): Promise<Response> =>
    fetch(`${BASE}${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        // Cannot be set by a cross-origin form or image; forces a preflight our
        // CORS policy denies. This is the third CSRF layer after SameSite and
        // the Origin allowlist.
        'X-Nexus-Client': 'web',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal ? { signal } : {}),
    });

  let response: Response;
  try {
    response = await send();
  } catch (error) {
    if (signal?.aborted) throw error;
    throw offline();
  }

  if (response.status !== 401) return response;

  const error = await toApiError(response.clone());
  if (error.code !== 'TOKEN_EXPIRED') return response;

  if (!(await refreshSession())) return response;

  try {
    return await send();
  } catch (err) {
    if (signal?.aborted) throw err;
    throw offline();
  }
}

/** GET/POST/PATCH returning JSON, validated by the caller's schema. */
export async function json<T>(
  path: string,
  schema: { parse: (value: unknown) => T },
  options?: RequestOptions,
): Promise<T> {
  const response = await request(path, options);
  if (!response.ok) throw await toApiError(response);
  return schema.parse(await response.json());
}

/** For endpoints that return 204. */
export async function empty(path: string, options?: RequestOptions): Promise<void> {
  const response = await request(path, options);
  if (!response.ok) throw await toApiError(response);
}

export { toApiError };
