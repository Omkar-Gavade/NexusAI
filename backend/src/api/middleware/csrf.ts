import type { FastifyReply, FastifyRequest } from 'fastify';
import { Errors } from '../../domain/errors.ts';

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const CLIENT_HEADER = 'x-nexus-client';

/**
 * Cookie auth needs CSRF defence. Two layers on top of SameSite:
 *
 * 1. `Origin` must be one of the configured web origins, exactly.
 * 2. A custom header must be present. A cross-origin form or image cannot set
 *    one; attempting it forces a preflight that CORS denies.
 *
 * A wrong origin is reported as ORIGIN_NOT_ALLOWED and logged with what was
 * expected. It used to answer UNAUTHENTICATED — "Sign in to continue" — on the
 * sign-in form itself, so a deployment whose WEB_ORIGIN did not match its
 * frontend rejected every login with a message that blamed the user and a log
 * that said nothing.
 */
export function createCsrfGuard(webOrigins: readonly string[]) {
  const allowed = new Set(webOrigins);

  return async function csrfGuard(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (!MUTATING.has(request.method)) return;

    // A missing client header is not a deployment problem — it is a request
    // that did not come from this app's client — so it stays a plain 401.
    if (request.headers[CLIENT_HEADER] !== 'web') throw Errors.unauthenticated();

    const origin = request.headers.origin ?? deriveOrigin(request.headers.referer);
    if (!origin || !allowed.has(origin)) {
      // Origins are public, not secrets: logging both sides is what makes a
      // misconfigured deployment diagnosable from its logs.
      request.log.warn(
        { receivedOrigin: origin ?? null, allowedOrigins: [...allowed] },
        'rejected a mutating request from an origin that is not allowed',
      );
      throw Errors.originNotAllowed();
    }
  };
}

function deriveOrigin(referer: string | undefined): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}
