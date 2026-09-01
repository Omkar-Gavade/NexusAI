import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { RenameConversationRequest } from '@nexusai/contracts';
import type { ConversationService } from '../../application/conversation-service.ts';
import { requireUser } from '../middleware/authenticate.ts';
import { createRateLimit, RULES, type RateLimiter } from '../middleware/rate-limit.ts';

const Page = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const Params = z.object({ id: z.string().regex(/^[a-f\d]{24}$/) });

export function registerConversationRoutes(
  app: FastifyInstance,
  deps: { conversations: ConversationService; authenticate: never; limiter: RateLimiter },
): void {
  // Reads are cheap and involve no provider, but "cheap" is not "free": an
  // authenticated client can still pin a connection pool. The ceiling is well
  // above anything the client does in normal use.
  const auth = {
    preHandler: [deps.authenticate, createRateLimit(deps.limiter, RULES.read, 'read')] as never,
  };

  app.get('/api/conversations', auth, async (request, reply) => {
    const user = requireUser(request);
    const page = Page.parse(request.query);
    return reply.send(await deps.conversations.list(user.id, page));
  });

  app.patch('/api/conversations/:id', auth, async (request, reply) => {
    const user = requireUser(request);
    const { id } = Params.parse(request.params);
    const { title } = RenameConversationRequest.parse(request.body);
    await deps.conversations.rename(user.id, id, title);
    return reply.status(204).send();
  });

  app.delete('/api/conversations/:id', auth, async (request, reply) => {
    const user = requireUser(request);
    const { id } = Params.parse(request.params);
    await deps.conversations.delete(user.id, id);
    return reply.status(204).send();
  });

  app.get('/api/conversations/:id/messages', auth, async (request, reply) => {
    const user = requireUser(request);
    const { id } = Params.parse(request.params);
    const page = Page.parse(request.query);
    return reply.send(await deps.conversations.messages(user.id, id, page));
  });
}
