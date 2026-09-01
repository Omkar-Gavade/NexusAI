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
      if (!this.closed) this.reply.raw.write(': keepalive\n\n');
    }, HEARTBEAT_MS);
    this.heartbeat.unref?.();
  }

  /** Resolves once the chunk is flushed, so a slow reader applies backpressure. */
  async send(event: ChatEvent): Promise<void> {
    if (this.closed) return;
    const frame = `data: ${JSON.stringify(event)}\n\n`;

    if (!this.reply.raw.write(frame)) {
      await new Promise<void>((resolve) => this.reply.raw.once('drain', resolve));
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.reply.raw.end();
  }
}
