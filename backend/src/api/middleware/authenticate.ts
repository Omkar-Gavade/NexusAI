// Pulls in @fastify/cookie's augmentation of FastifyRequest.cookies.
import type {} from '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Errors } from '../../domain/errors.ts';
import type { TokenService } from '../../domain/auth/tokens.ts';

export const ACCESS_COOKIE = 'nx_at';
export const REFRESH_COOKIE = 'nx_rt';

declare module 'fastify' {
  interface FastifyRequest {
    user?: { id: string; sessionId: string };
  }
}

/**
 * Verifies the access token and puts the identity on the request.
 *
 * This is the only source of the acting user's id. `request.body.userId` does
 * not exist in any schema, so a malicious client cannot get one into a handler
 * even by sending it — Zod strips unknown keys.
 */
export function createAuthenticate(tokens: TokenService) {
  return async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const token = request.cookies[ACCESS_COOKIE];
    if (!token) throw Errors.unauthenticated();

    // verifyAccessToken distinguishes expiry (TOKEN_EXPIRED → the client
    // refreshes) from everything else (UNAUTHENTICATED → the client signs out).
    const claims = await tokens.verifyAccessToken(token);
    request.user = { id: claims.userId, sessionId: claims.sessionId };
  };
}

export function requireUser(request: FastifyRequest): { id: string; sessionId: string } {
  if (!request.user) throw Errors.unauthenticated();
  return request.user;
}
