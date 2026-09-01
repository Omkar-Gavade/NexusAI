/**
 * Parses an upstream SSE body into `data:` payloads.
 *
 * Chunk boundaries fall anywhere, including mid-field, so the tail is held back
 * until a frame separator proves it complete.
 */
export async function* readUpstreamSSE(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const abort = () => void reader.cancel().catch(() => {});
  signal.addEventListener('abort', abort, { once: true });

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        for (const line of frame.split(/\r?\n/)) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trimStart();
          if (payload && payload !== '[DONE]') yield payload;
        }
      }
    }
  } finally {
    signal.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}
