import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { Errors, isAppError, type AppError } from '../../domain/errors.ts';

/**
 * The only place an error becomes an HTTP response.
 *
 * Handlers throw; they never build an error body. That means the redaction
 * guarantee holds in one file rather than at every throw site.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request: FastifyRequest, reply: FastifyReply) => {
    const appError = toAppError(error);
    const requestId = request.id;

    const log = { requestId, route: request.routeOptions?.url, code: appError.code, ...appError.context };
    if (appError.status >= 500) request.log.error({ ...log, err: error }, appError.message);
    else request.log.warn(log, appError.message);

    if (appError.retryAfterSeconds !== undefined) {
      void reply.header('Retry-After', String(appError.retryAfterSeconds));
    }

    // `context` is never serialised — that is the whole point of keeping it on
    // a separate field from `userMessage`.
    return reply.status(appError.status).send({
      error: {
        code: appError.code,
        message: appError.userMessage,
        requestId,
        ...(appError.details ? { details: appError.details } : {}),
        ...(appError.retryAfterSeconds === undefined
          ? {}
          : { retryAfterSeconds: appError.retryAfterSeconds }),
      },
    });
  });

  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({
      error: { code: 'NOT_FOUND', message: 'Not found.', requestId: request.id },
    }),
  );
}

/** Framework error codes are not user-facing copy. */
function friendlyFrameworkMessage(code: string | undefined): string {
  switch (code) {
    case 'FST_ERR_CTP_EMPTY_JSON_BODY':
      return 'Request body was empty.';
    case 'FST_ERR_CTP_INVALID_MEDIA_TYPE':
      return 'Unsupported content type.';
    default:
      return 'The request could not be read.';
  }
}

export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;

  if (error instanceof ZodError) {
    return Errors.validation(
      error.issues.map((issue) => ({
        // Paths match the client's field names, so forms can attach errors to
        // inputs by path.
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }

  const status = (error as { statusCode?: number })?.statusCode;
  const code = (error as { code?: string })?.code;

  // MongoDB duplicate key. Under concurrent duplicate sends the read-then-write
  // idempotency check can be raced; the unique index is what actually holds the
  // line, and its violation is the same condition.
  if ((error as { code?: number })?.code === 11000) {
    const keyPattern = (error as { keyPattern?: Record<string, unknown> })?.keyPattern ?? {};
    if ('clientMessageId' in keyPattern) return Errors.duplicateRequest();
    if ('email' in keyPattern) return Errors.emailTaken();
    return Errors.internal({ cause: 'duplicate key', keyPattern });
  }

  if (status === 413) return Errors.validation([{ path: 'body', message: 'Request body too large.' }]);
  if (status === 429) return Errors.rateLimited(30);

  // Framework-level 4xx — malformed JSON, unsupported media type, and so on.
  // These are the caller's problem, not ours, and must not be reported as 500.
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return Errors.validation([
      { path: 'body', message: friendlyFrameworkMessage(code) },
    ]);
  }

  return Errors.internal({ cause: String(error).slice(0, 300) });
}
