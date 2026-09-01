import type { FastifyInstance } from 'fastify';
import { ChatRequest } from '@nexusai/contracts';
import type { ChatOrchestrator } from '../../domain/orchestration/orchestrator.ts';
import { requireUser } from '../middleware/authenticate.ts';
import { createRateLimit, RULES, type RateLimiter } from '../middleware/rate-limit.ts';
import { toAppError } from '../errors/error-handler.ts';
import { SseWriter } from '../sse.ts';
import { Errors } from '../../domain/errors.ts';

export function registerChatRoutes(
  app: FastifyInstance,
  deps: {
    orchestrator: ChatOrchestrator;
    limiter: RateLimiter;
    authenticate: never;
    maxConcurrentPerUser: number;
  },
): void {
  /** Cheap guard against one account monopolising the provider pool. */
  const active = new Map<string, number>();

  app.post(
    '/api/chat/stream',
    {
      preHandler: [deps.authenticate, createRateLimit(deps.limiter, RULES.chat, 'chat')] as never,
    },
    async (request, reply) => {
      const user = requireUser(request);
      const body = ChatRequest.parse(request.body);

      const inFlight = active.get(user.id) ?? 0;
      if (inFlight >= deps.maxConcurrentPerUser) throw Errors.rateLimited(10);
      active.set(user.id, inFlight + 1);

      // The client's fetch abort is the cancellation signal. There is no cancel
      // endpoint and the client will never call one, so socket close is the
      // only thing that stops the work.
      const controller = new AbortController();
      request.raw.on('close', () => controller.abort());

      const sse = new SseWriter(reply);
      let opened = false;

      try {
        for await (const event of deps.orchestrator.run(
          {
            userId: user.id,
            conversationId: body.conversationId,
            message: body.message,
            clientMessageId: body.clientMessageId,
            selection: body.selection,
            requestId: request.id,
          },
          controller.signal,
        )) {
          // Headers are committed lazily: until the first event, a failure can
          // still be a normal 4xx with the JSON envelope, which is far easier
          // for a client to handle than an error inside a 200.
          if (!opened) {
            sse.open();
            opened = true;
          }
          await sse.send(event);
        }
      } catch (error) {
        const appError = toAppError(error);

        if (!opened) throw appError;

        // The status line is already committed, so the failure has to travel
        // as an event. Never an HTML error page into an SSE stream.
        await sse.send({
          type: 'error',
          code: appError.code,
          message: appError.userMessage,
          partial: true,
          requestId: request.id,
        });
        request.log.warn(
          { requestId: request.id, code: appError.code, ...appError.context },
          'chat stream failed after open',
        );
      } finally {
        // Dropped at zero rather than left at zero: this map is keyed by user
        // id, and a long-lived process would otherwise accumulate one entry
        // for every account that has ever streamed.
        const remaining = Math.max(0, (active.get(user.id) ?? 1) - 1);
        if (remaining === 0) active.delete(user.id);
        else active.set(user.id, remaining);

        if (opened) sse.close();
      }

      return reply;
    },
  );
}
