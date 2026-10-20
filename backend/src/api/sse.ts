import type { FastifyReply } from 'fastify';
import type { ChatEvent } from '@nexusai/contracts';

const HEARTBEAT_MS = 15_000;

/**
 * SSE framing for one response.
 *
 * The client parses `data:` frames from a `fetch` body, not `EventSource`, but
 * the wire format is standard SSE — it is proxy-friendly and readable in a
 * terminal.
 */
export class SseWriter {
  private heartbeat: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(private readonly reply: FastifyReply) {}

  open(): void {
    this.reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Without this, nginx and several CDNs buffer the whole response and the
      // answer arrives in one lump — streaming that looks broken.
      'X-Accel-Buffering': 'no',
    });
    this.reply.raw.flushHeaders?.();

    // Comment frames keep intermediaries from timing the connection out during
    // the model fan-out, when nothing is being emitted yet.
    this.heartbeat = setInterval(() => {
      if (!this.closed && !this.reply.raw.destroyed) this.reply.raw.write(': keepalive\n\n');
    }, HEARTBEAT_MS);
    this.heartbeat.unref?.();
  }

  /**
   * Resolves once the chunk is flushed, so a slow reader applies backpressure.
   *
   * A socket the client has already closed never emits `drain`. Waiting on it
   * alone parked the route forever after a Stop: the orchestrator was never
   * pulled again, so the turn was never finalised as cancelled and the user's
   * concurrent-stream slot was never released. Writes to a gone socket are
   * dropped, and a pending wait also ends on `close`.
   */
  async send(event: ChatEvent): Promise<void> {
    const raw = this.reply.raw;
    if (this.closed || raw.destroyed || raw.writableEnded) return;
    const frame = `data: ${JSON.stringify(event)}\n\n`;

    if (!raw.write(frame)) {
      await new Promise<void>((resolve) => {
        const done = () => {
          raw.off('drain', done);
          raw.off('close', done);
          resolve();
        };
        raw.once('drain', done);
        raw.once('close', done);
      });
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.reply.raw.end();
  }
}
