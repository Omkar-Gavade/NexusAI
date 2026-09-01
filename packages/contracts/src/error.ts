import { z } from 'zod';

export const ErrorCode = z.enum([
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'TOKEN_EXPIRED',
  'SESSION_EXPIRED',
  'SESSION_REVOKED',
  'INVALID_CREDENTIALS',
  'EMAIL_TAKEN',
  'NOT_FOUND',
  'MODEL_NOT_FOUND',
  'MODEL_NOT_CONFIGURED',
  'MODEL_UNAVAILABLE',
  'NO_MODEL_AVAILABLE',
  'CONTEXT_TOO_LONG',
  'DUPLICATE_REQUEST',
  'RATE_LIMITED',
  'TIMEOUT',
  'NETWORK_ERROR',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_ERROR',
  'AUTH_ERROR',
  'CONTENT_POLICY',
  'INVALID_REQUEST',
  'SYNTHESIS_FAILED',
  'CANCELLED',
  'SERVER_SHUTDOWN',
  'DATABASE_ERROR',
  'INTERNAL',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const FieldIssue = z.object({
  path: z.string(),
  message: z.string(),
});
export type FieldIssue = z.infer<typeof FieldIssue>;

export const ErrorResponse = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    requestId: z.string(),
    details: z.array(FieldIssue).optional(),
    retryAfterSeconds: z.number().int().positive().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponse>;

/**
 * User-facing copy per code. Kept in the contract rather than the client so the
 * API and the UI cannot disagree about what a failure means. A code without an
 * entry here fails the contract test.
 */
export const errorMessages: Record<ErrorCode, string> = {
  VALIDATION_ERROR: 'Check the highlighted fields and try again.',
  UNAUTHENTICATED: 'Sign in to continue.',
  TOKEN_EXPIRED: 'Your session needs refreshing.',
  SESSION_EXPIRED: 'Your session expired. Sign in to continue.',
  SESSION_REVOKED: "You've been signed out for security reasons.",
  INVALID_CREDENTIALS: 'That email or password is incorrect.',
  EMAIL_TAKEN: 'An account with that email already exists.',
  NOT_FOUND: 'Not found.',
  MODEL_NOT_FOUND: "That model isn't available.",
  MODEL_NOT_CONFIGURED: 'That model is not configured on this server.',
  MODEL_UNAVAILABLE: 'That model is temporarily unavailable.',
  NO_MODEL_AVAILABLE: 'No real models are currently available.',
  CONTEXT_TOO_LONG: 'This conversation is too long for the selected models.',
  DUPLICATE_REQUEST: 'That message was already sent.',
  RATE_LIMITED: "You've sent too many requests.",
  TIMEOUT: 'The models took too long to respond.',
  NETWORK_ERROR: "Couldn't reach the model providers.",
  PROVIDER_UNAVAILABLE: 'A model provider is unavailable.',
  PROVIDER_ERROR: 'A model provider returned an error.',
  AUTH_ERROR: "That model isn't available right now.",
  CONTENT_POLICY: 'The models declined to answer this request.',
  INVALID_REQUEST: 'Something went wrong while generating the response.',
  SYNTHESIS_FAILED: "The individual responses arrived, but couldn't be reconciled.",
  CANCELLED: 'Stopped.',
  SERVER_SHUTDOWN: 'The server is restarting. Try again in a moment.',
  DATABASE_ERROR: 'Something went wrong. Try again.',
  INTERNAL: 'Something went wrong.',
};
