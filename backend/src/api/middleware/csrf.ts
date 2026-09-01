import type { FastifyReply, FastifyRequest } from 'fastify';
import { Errors } from '../../domain/errors.ts';

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const CLIENT_HEADER = 'x-nexus-client';

/**
 * Cookie auth needs CSRF defence. Two layers on top of SameSite:
 *
 * 1. `Origin` must match the configured web origin exactly.
 * 2. A custom header must be present. A cross-origin form or image cannot set
 *    one; attempting it forces a preflight that CORS denies.
 */
export function createCsrfGuard(webOrigin: string) {
  return async function csrfGuard(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (!MUTATING.has(request.method)) return;

    if (request.headers[CLIENT_HEADER] !== 'web') throw Errors.unauthenticated();

    const origin = request.headers.origin ?? deriveOrigin(request.headers.referer);
    // A mutating request with no Origin at all is rejected rather than trusted.
    if (!origin || origin !== webOrigin) throw Errors.unauthenticated();
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
