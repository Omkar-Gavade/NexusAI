import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  LoginRequest,
  RegisterRequest,
  UpdateProfileRequest,
  type User,
} from '@nexusai/contracts';
import type { Config } from '../../config/env.ts';
import type { AuthService, IssuedSession } from '../../application/auth-service.ts';
import { ACCESS_COOKIE, REFRESH_COOKIE, requireUser } from '../middleware/authenticate.ts';
import { createRateLimit, RULES, type RateLimiter } from '../middleware/rate-limit.ts';
import { Errors } from '../../domain/errors.ts';

export function registerAuthRoutes(
  app: FastifyInstance,
  deps: {
    config: Config;
    auth: AuthService;
    limiter: RateLimiter;
    authenticate: (request: never, reply: never) => Promise<void>;
  },
): void {
  const { config, auth, limiter } = deps;

  /** httpOnly throughout: no token is ever readable by JavaScript. */
  function issueCookies(reply: FastifyReply, session: IssuedSession): void {
    const secure = config.NODE_ENV === 'production';

    reply.setCookie(ACCESS_COOKIE, session.accessToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: config.ACCESS_TOKEN_TTL_SECONDS,
    });

    // Strict and scoped to /api/auth: even a top-level cross-site navigation
    // cannot trigger a refresh.
    reply.setCookie(REFRESH_COOKIE, session.refreshToken, {
      httpOnly: true,
      secure,
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: config.REFRESH_TOKEN_TTL_SECONDS,
    });
  }

  function clearCookies(reply: FastifyReply): void {
    reply.clearCookie(ACCESS_COOKIE, { path: '/' });
    reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  }

  app.post(
    '/api/auth/register',
    { preHandler: createRateLimit(limiter, RULES.authWrite, 'auth') },
    async (request, reply) => {
      const body = RegisterRequest.parse(request.body);
      const { user, session } = await auth.register(body);
      issueCookies(reply, session);
      return reply.status(201).send({ user } satisfies { user: User });
    },
  );

  app.post(
    '/api/auth/login',
    { preHandler: createRateLimit(limiter, RULES.authWrite, 'auth') },
    async (request, reply) => {
      const body = LoginRequest.parse(request.body);
      const { user, session } = await auth.login(body);
      issueCookies(reply, session);
      return reply.send({ user } satisfies { user: User });
    },
  );

  app.post(
    '/api/auth/refresh',
    { preHandler: createRateLimit(limiter, RULES.refresh, 'refresh') },
    async (request, reply) => {
      const token = request.cookies[REFRESH_COOKIE];
      if (!token) throw Errors.sessionExpired();

      try {
        issueCookies(reply, await auth.refresh(token));
      } catch (error) {
        // A dead session must not leave stale cookies behind, or the client
        // retries the same doomed refresh on every request.
        clearCookies(reply);
        throw error;
      }
      return reply.status(204).send();
    },
  );

  // Idempotent: "make me signed out" has succeeded either way.
  app.post('/api/auth/logout', async (request, reply) => {
    await auth.logout(request.cookies[REFRESH_COOKIE]);
    clearCookies(reply);
    return reply.status(204).send();
  });

  app.get('/api/auth/me', { preHandler: deps.authenticate as never }, async (request, reply) => {
    const user = requireUser(request);
    return reply.send({ user: await auth.currentUser(user.id) });
  });

  app.patch('/api/auth/me', { preHandler: deps.authenticate as never }, async (request, reply) => {
    const user = requireUser(request);
    const patch = UpdateProfileRequest.parse(request.body);
    return reply.send({ user: await auth.updateProfile(user.id, patch) });
  });
}
