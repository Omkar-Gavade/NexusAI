import type { FastifyInstance } from 'fastify';
import type { ModelsResponse } from '@nexusai/contracts';
import type { ModelRegistry } from '../../domain/models/registry.ts';
import { createRateLimit, RULES, type RateLimiter } from '../middleware/rate-limit.ts';

export function registerModelRoutes(
  app: FastifyInstance,
  deps: { registry: ModelRegistry; authenticate: never; limiter: RateLimiter },
): void {
  app.get(
    '/api/models',
    {
      preHandler: [
        deps.authenticate,
        createRateLimit(deps.limiter, RULES.read, 'read'),
      ] as never,
    },
    async (_request, reply) => {
      const body: ModelsResponse = {
        models: deps.registry.toWire(),
        // False disables the composer in the client. It must be accurate.
        auto: { available: deps.registry.autoAvailable() },
        checkedAt: new Date().toISOString(),
      };
      return reply.header('Cache-Control', 'private, max-age=30').send(body);
    },
  );
}
