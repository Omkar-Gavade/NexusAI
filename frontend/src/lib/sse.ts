/**
 * SSE frame parsing over a fetch ReadableStream.
 *
 * EventSource is not used, deliberately: it cannot POST a body, cannot set the
 * CSRF header, cannot cancel in a way the server observes, and reconnects
 * automatically — which for a generation endpoint would silently bill a second
 * response. So the server speaks SSE wire format and we parse it ourselves.
 */

const FRAME_SEPARATOR = /\r?\n\r?\n/;

/** Yields the payload of each `data:` frame. Comments and other fields are skipped. */
export async function* readSSE(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const abort = () => void reader.cancel().catch(() => {});
  signal?.addEventListener('abort', abort, { once: true });

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // A chunk boundary can fall anywhere, including mid-frame and mid-field,
      // so the tail is always kept until a separator proves it complete.
      const frames = buffer.split(FRAME_SEPARATOR);
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        const payload = extractData(frame);
        if (payload !== null) yield payload;
      }
    }

    const trailing = extractData(buffer);
    if (trailing !== null) yield trailing;
  } finally {
    signal?.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}

function extractData(frame: string): string | null {
  if (!frame.trim()) return null;

  const lines: string[] = [];
  for (const line of frame.split(/\r?\n/)) {
    // `:` opens a comment — used for the keepalive heartbeat.
    if (line.startsWith(':')) continue;
    if (!line.startsWith('data:')) continue;
    lines.push(line.slice(5).replace(/^ /, ''));
  }

  return lines.length ? lines.join('\n') : null;
}
