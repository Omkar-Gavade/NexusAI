import type { FastifyInstance } from 'fastify';
import type { Db } from 'mongodb';

export function registerHealthRoutes(app: FastifyInstance, deps: { db: Db }): void {
  // Liveness touches nothing external. A probe that fails on a database blip
  // would restart a process that is perfectly healthy.
  app.get('/health/live', async (_request, reply) => reply.send({ status: 'ok' }));

  // Readiness checks dependencies. It reports reachability only — never which
  // providers are configured, which would be an unauthenticated information leak.
  app.get('/health/ready', async (_request, reply) => {
    let mongo = false;
    try {
      await deps.db.command({ ping: 1 });
      mongo = true;
    } catch {
      mongo = false;
    }
    return reply.status(mongo ? 200 : 503).send({ status: mongo ? 'ok' : 'degraded', mongo });
  });
}
