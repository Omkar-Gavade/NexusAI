import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * An AbortSignal that fires when the client goes away before the response has
 * been fully written.
 *
 * It watches the *response*, not the request. On Node 22 `IncomingMessage`
 * emits `close` as soon as its body has been consumed — which for a POST has
 * already happened by the time the auth and rate-limit preHandlers finish — so
 * a listener on `request.raw` was registered after its only `close` and never
 * fired. Every Stop press left the provider calls running and billed to
 * completion. `ServerResponse` emits `close` when the socket does, and
 * `writableFinished` separates "we finished" from "they left".
 */
export function clientDisconnectSignal(request: FastifyRequest, reply: FastifyReply): AbortSignal {
  const controller = new AbortController();
  const abort = () => {
    if (!reply.raw.writableFinished) controller.abort();
  };

  // The socket can already be gone while preHandlers were awaiting.
  if (request.raw.socket?.destroyed) abort();
  else reply.raw.once('close', abort);

  return controller.signal;
}
