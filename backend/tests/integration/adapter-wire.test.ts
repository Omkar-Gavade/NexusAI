import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CATALOG } from '../../src/domain/models/catalog.ts';
import { AnthropicAdapter } from '../../src/infrastructure/llm/adapters/anthropic.ts';
import { GoogleAdapter } from '../../src/infrastructure/llm/adapters/google.ts';
import { OpenAICompatibleAdapter } from '../../src/infrastructure/llm/adapters/openai-compatible.ts';

/**
 * The HTTP adapters against a real socket.
 *
 * The test adapter is in-process, so until now none of this code had ever run:
 * not the request shaping, not the response parsing, not `readUpstreamSSE`, and
 * not the chunk-boundary handling that upstream framing depends on. A local
 * server speaking each provider's documented dialect exercises all of it
 * without a credential.
 *
 * This is not a substitute for calling the real service — it verifies the
 * adapter's half of the conversation, not the vendor's.
 */
let server: Server;
let baseUrl: string;
let lastRequest: { url: string; headers: IncomingMessage['headers']; body: unknown };

const model = CATALOG.find((m) => m.id === 'gpt-4o')!;

/** Splits a payload across two TCP writes to prove framing survives it. */
function writeSplit(res: ServerResponse, frames: string[]) {
  const whole = frames.join('');
  const cut = Math.floor(whole.length / 2);
  res.write(whole.slice(0, cut));
  setTimeout(() => {
    res.write(whole.slice(cut));
    res.end();
  }, 10);
}

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      lastRequest = { url: req.url!, headers: req.headers, body: raw ? JSON.parse(raw) : null };
      const url = req.url!;

      // --- OpenAI dialect ---
      if (url.startsWith('/openai/chat/completions')) {
        if ((lastRequest.body as { stream?: boolean }).stream) {
          res.writeHead(200, { 'content-type': 'text/event-stream' });
          return writeSplit(res, [
            `data: ${JSON.stringify({ choices: [{ delta: { content: 'Hello' } }] })}\n\n`,
            `data: ${JSON.stringify({ choices: [{ delta: { content: ' world' } }] })}\n\n`,
            'data: [DONE]\n\n',
          ]);
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(
          JSON.stringify({
            choices: [{ message: { content: 'Four.' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 11, completion_tokens: 3 },
          }),
        );
      }

      // --- Anthropic dialect ---
      if (url.startsWith('/anthropic/messages')) {
        if ((lastRequest.body as { stream?: boolean }).stream) {
          res.writeHead(200, { 'content-type': 'text/event-stream' });
          return writeSplit(res, [
            `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } })}\n\n`,
            `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: ' world' } })}\n\n`,
          ]);
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(
          JSON.stringify({
            content: [{ type: 'text', text: 'Four.' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 11, output_tokens: 3 },
          }),
        );
      }

      // --- Google dialect ---
      if (url.includes(':streamGenerateContent')) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        return writeSplit(res, [
          `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Hello' }] } }] })}\n\n`,
          `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: ' world' }] } }] })}\n\n`,
        ]);
      }
      if (url.includes(':generateContent')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: 'Four.' }] }, finishReason: 'STOP' }],
            usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 3 },
          }),
        );
      }

      res.writeHead(404).end('{}');
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const request = {
  model,
  messages: [{ role: 'user' as const, content: 'What is 2 + 2?' }],
  maxOutputTokens: 64,
};

async function collect(stream: AsyncIterable<string>): Promise<string> {
  let text = '';
  for await (const chunk of stream) text += chunk;
  return text;
}

describe('OpenAI-compatible adapter', () => {
  const adapter = () => new OpenAICompatibleAdapter('openai', `${baseUrl}/openai`, 'test-key');

  it('parses a completion and its usage', async () => {
    const result = await adapter().generate(request, AbortSignal.timeout(5000));
    expect(result).toMatchObject({ text: 'Four.', inputTokens: 11, outputTokens: 3 });
  });

  it('sends the credential as a bearer header, never in the URL', async () => {
    await adapter().generate(request, AbortSignal.timeout(5000));
    expect(lastRequest.headers.authorization).toBe('Bearer test-key');
    expect(lastRequest.url).not.toContain('test-key');
  });

  it('reassembles a stream split across chunk boundaries', async () => {
    expect(await collect(adapter().stream(request, AbortSignal.timeout(5000)))).toBe('Hello world');
  });
});

describe('Anthropic adapter', () => {
  const adapter = () => new AnthropicAdapter('test-key', `${baseUrl}/anthropic`);

  it('parses a message and its usage', async () => {
    const result = await adapter().generate(request, AbortSignal.timeout(5000));
    expect(result).toMatchObject({ text: 'Four.', inputTokens: 11, outputTokens: 3 });
  });

  it('sends the credential as a header with the API version', async () => {
    await adapter().generate(request, AbortSignal.timeout(5000));
    expect(lastRequest.headers['x-api-key']).toBe('test-key');
    expect(lastRequest.headers['anthropic-version']).toBeDefined();
    expect(lastRequest.url).not.toContain('test-key');
  });

  it('reassembles content_block_delta events across chunk boundaries', async () => {
    expect(await collect(adapter().stream(request, AbortSignal.timeout(5000)))).toBe('Hello world');
  });
});

describe('Google adapter', () => {
  const adapter = () => new GoogleAdapter('test-key', baseUrl);

  it('parses a candidate and its usage', async () => {
    const result = await adapter().generate(request, AbortSignal.timeout(5000));
    expect(result).toMatchObject({ text: 'Four.', inputTokens: 11, outputTokens: 3 });
  });

  // Google also accepts `?key=`, which would put the credential into every
  // proxy access log between here and the service.
  it('sends the credential as a header, never in the query string', async () => {
    await adapter().generate(request, AbortSignal.timeout(5000));
    expect(lastRequest.headers['x-goog-api-key']).toBe('test-key');
    expect(lastRequest.url).not.toContain('test-key');
    expect(lastRequest.url).not.toContain('key=');
  });

  it('reassembles a stream split across chunk boundaries', async () => {
    expect(await collect(adapter().stream(request, AbortSignal.timeout(5000)))).toBe('Hello world');
  });
});
