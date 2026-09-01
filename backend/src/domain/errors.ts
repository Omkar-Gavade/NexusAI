import { errorMessages, type ErrorCode } from '@nexusai/contracts';

interface AppErrorOptions {
  status: number;
  /** Whether the same call could succeed on a retry. */
  retryable?: boolean;
  /** Logged, never serialised. */
  context?: Record<string, unknown>;
  cause?: unknown;
  retryAfterSeconds?: number;
  details?: ReadonlyArray<{ path: string; message: string }>;
}

/**
 * One error class. The code is data; behaviour comes from the flags.
 *
 * `userMessage` is returned to the client. `context` is logged and never
 * serialised — leaking internals requires actively choosing the wrong field
 * rather than forgetting to sanitise.
 */
export class AppError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  readonly context: Record<string, unknown>;
  readonly retryAfterSeconds: number | undefined;
  readonly details: ReadonlyArray<{ path: string; message: string }> | undefined;

  constructor(
    readonly code: ErrorCode,
    readonly userMessage: string,
    options: AppErrorOptions,
  ) {
    super(`${code}: ${userMessage}`, options.cause ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.status = options.status;
    this.retryable = options.retryable ?? false;
    this.context = options.context ?? {};
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.details = options.details;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

const m = errorMessages;

/**
 * Named factories so the flags can never be set inconsistently, and so the
 * user-facing copy comes from the shared contract rather than being retyped.
 */
export const Errors = {
  validation: (details: ReadonlyArray<{ path: string; message: string }>) =>
    new AppError('VALIDATION_ERROR', m.VALIDATION_ERROR, { status: 400, details }),

  unauthenticated: () => new AppError('UNAUTHENTICATED', m.UNAUTHENTICATED, { status: 401 }),

  // Distinct from UNAUTHENTICATED on purpose: the frontend refreshes on this
  // code and signs the user out on the other. Collapsing them breaks the
  // session lifecycle. See docs/architecture/backend-handoff.md §1.
  tokenExpired: () => new AppError('TOKEN_EXPIRED', m.TOKEN_EXPIRED, { status: 401 }),

  sessionExpired: () => new AppError('SESSION_EXPIRED', m.SESSION_EXPIRED, { status: 401 }),
  sessionRevoked: () => new AppError('SESSION_REVOKED', m.SESSION_REVOKED, { status: 401 }),
  invalidCredentials: () =>
    new AppError('INVALID_CREDENTIALS', m.INVALID_CREDENTIALS, { status: 401 }),
  emailTaken: () => new AppError('EMAIL_TAKEN', m.EMAIL_TAKEN, { status: 409 }),

  // Ownership failures are 404, never 403: a 403 confirms the row exists and
  // lets an attacker enumerate ids.
  notFound: () => new AppError('NOT_FOUND', m.NOT_FOUND, { status: 404 }),

  modelNotFound: (context?: Record<string, unknown>) =>
    new AppError('MODEL_NOT_FOUND', m.MODEL_NOT_FOUND, { status: 404, context: context ?? {} }),
  modelUnavailable: (displayName: string, context?: Record<string, unknown>) =>
    new AppError('MODEL_UNAVAILABLE', `${displayName} is temporarily unavailable.`, {
      status: 409,
      context: context ?? {},
    }),
  modelNotConfigured: (displayName: string) =>
    new AppError('MODEL_NOT_CONFIGURED', `${displayName} is not configured on this server.`, {
      status: 409,
    }),
  noModelAvailable: () =>
    new AppError('NO_MODEL_AVAILABLE', m.NO_MODEL_AVAILABLE, { status: 503 }),
  contextTooLong: () => new AppError('CONTEXT_TOO_LONG', m.CONTEXT_TOO_LONG, { status: 413 }),
  duplicateRequest: () => new AppError('DUPLICATE_REQUEST', m.DUPLICATE_REQUEST, { status: 409 }),

  rateLimited: (retryAfterSeconds: number) =>
    new AppError(
      'RATE_LIMITED',
      `You've sent too many requests. Try again in ${retryAfterSeconds} seconds.`,
      { status: 429, retryable: true, retryAfterSeconds },
    ),

  timeout: (context?: Record<string, unknown>) =>
    new AppError('TIMEOUT', m.TIMEOUT, { status: 504, retryable: true, context: context ?? {} }),
  networkError: (context?: Record<string, unknown>) =>
    new AppError('NETWORK_ERROR', m.NETWORK_ERROR, {
      status: 502,
      retryable: true,
      context: context ?? {},
    }),
  providerUnavailable: (context?: Record<string, unknown>) =>
    new AppError('PROVIDER_UNAVAILABLE', m.PROVIDER_UNAVAILABLE, {
      status: 503,
      retryable: true,
      context: context ?? {},
    }),
  providerError: (context?: Record<string, unknown>) =>
    new AppError('PROVIDER_ERROR', m.PROVIDER_ERROR, {
      status: 502,
      retryable: true,
      context: context ?? {},
    }),
  // Deliberately vague to the user: a bad provider key is an operator problem,
  // and saying so tells an attacker about server configuration.
  providerAuthError: (context?: Record<string, unknown>) =>
    new AppError('AUTH_ERROR', m.AUTH_ERROR, { status: 502, context: context ?? {} }),
  contentPolicy: (context?: Record<string, unknown>) =>
    new AppError('CONTENT_POLICY', m.CONTENT_POLICY, { status: 422, context: context ?? {} }),
  invalidProviderRequest: (context?: Record<string, unknown>) =>
    new AppError('INVALID_REQUEST', m.INVALID_REQUEST, { status: 502, context: context ?? {} }),

  synthesisFailed: (context?: Record<string, unknown>) =>
    new AppError('SYNTHESIS_FAILED', m.SYNTHESIS_FAILED, { status: 502, context: context ?? {} }),

  cancelled: () => new AppError('CANCELLED', m.CANCELLED, { status: 499 }),
  serverShutdown: () =>
    new AppError('SERVER_SHUTDOWN', m.SERVER_SHUTDOWN, { status: 503, retryable: true }),
  databaseError: (context?: Record<string, unknown>) =>
    new AppError('DATABASE_ERROR', m.DATABASE_ERROR, {
      status: 503,
      retryable: true,
      context: context ?? {},
    }),
  internal: (context?: Record<string, unknown>) =>
    new AppError('INTERNAL', m.INTERNAL, { status: 500, context: context ?? {} }),
} as const;
