import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerErrorHandler } from '../api/errors/error-handler.ts';
import { createAuthenticate } from '../api/middleware/authenticate.ts';
import { createCsrfGuard } from '../api/middleware/csrf.ts';
import { registerAuthRoutes } from '../api/routes/auth.ts';
import { registerChatRoutes } from '../api/routes/chat.ts';
import { registerConversationRoutes } from '../api/routes/conversations.ts';
import { registerHealthRoutes } from '../api/routes/health.ts';
import { registerModelRoutes } from '../api/routes/models.ts';
import { loggerOptions } from '../infrastructure/observability/logger.ts';
import type { Config } from '../config/env.ts';
import type { Container } from './container.ts';

/** 256KB: a 32,000-character message plus overhead, rejected before parsing. */
const MAX_BODY_BYTES = 256 * 1024;

/**
 * Translates the configured trust setting into what Fastify accepts.
 *
 * A hop count becomes an explicit predicate rather than being passed through as
 * a number: Fastify forwards numbers to proxy-addr at runtime, but its type
 * does not include them, and depending on undeclared behaviour is how a
 * security-relevant setting quietly stops working on an upgrade.
 */
function trustProxyOption(
  setting: Config['TRUST_PROXY'],
): boolean | string[] | ((address: string, hop: number) => boolean) {
  if (typeof setting === 'number') return (_address, hop) => hop < setting;
  return setting;
}

export async function buildApp(container: Container): Promise<FastifyInstance> {
  const { config } = container;

  const app = Fastify({
    logger: loggerOptions(config),
    bodyLimit: MAX_BODY_BYTES,
    // Correlates HTTP, application, orchestrator and provider log lines.
    genReqId: () => crypto.randomUUID(),
    // Fails closed: see TRUST_PROXY in config/env.ts. Tying this to NODE_ENV
    // meant production trusted the header from any source, so a directly
    // reachable deployment could have its IP-keyed auth limits bypassed by a
    // client that simply set its own.
    trustProxy: trustProxyOption(config.TRUST_PROXY),
  });

  await app.register(helmet, {
    // The API serves JSON and SSE, never HTML, so a document CSP would apply to
    // nothing. The frontend ships its own.
    contentSecurityPolicy: false,
    hsts: config.NODE_ENV === 'production' ? { maxAge: 31_536_000, includeSubDomains: true } : false,
  });

  // One exact origin. Reflecting the request origin with credentials is the
  // canonical way to accidentally disable CORS entirely.
  await app.register(cors, {
    origin: [config.WEB_ORIGIN],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-Nexus-Client'],
    maxAge: 600,
  });

  await app.register(cookie);

  // Several endpoints take no body. A client that sets a JSON content-type on a
  // bodyless POST — which is legal — must not be rejected for it.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_request, body: string | Buffer, done) => {
      const raw = body.toString().trim();
      if (raw === '') return done(null, {});
      try {
        done(null, JSON.parse(raw));
      } catch {
        done(Object.assign(new Error('Malformed JSON.'), { statusCode: 400 }), undefined);
      }
    },
  );

  registerErrorHandler(app);

  app.addHook('preHandler', createCsrfGuard(config.WEB_ORIGIN));

  const authenticate = createAuthenticate(container.tokens) as never;

  registerHealthRoutes(app, { db: container.db });
  registerAuthRoutes(app, {
    config,
    auth: container.auth,
    limiter: container.limiter,
    authenticate,
  });
  registerModelRoutes(app, {
    registry: container.registry,
    authenticate,
    limiter: container.limiter,
  });
  registerConversationRoutes(app, {
    conversations: container.conversations,
    authenticate,
    limiter: container.limiter,
  });
  registerChatRoutes(app, {
    orchestrator: container.orchestrator,
    limiter: container.limiter,
    authenticate,
    maxConcurrentPerUser: config.MAX_CONCURRENT_STREAMS_PER_USER,
  });

  return app;
}
