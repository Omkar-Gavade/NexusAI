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

      // --- A stream that keeps going until the client gives up ---
      if (url.startsWith('/slow-openai/chat/completions')) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'First ' } }] })}\n\n`);
        const timer = setInterval(() => {
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'more ' } }] })}\n\n`);
        }, 30);
        res.on('close', () => clearInterval(timer));
        return;
      }

      // --- In-stream failures after a 200 ---
      if (url.startsWith('/broken-openai/chat/completions')) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        return writeSplit(res, [
          `data: ${JSON.stringify({ choices: [{ delta: { content: 'Half an ' } }] })}\n\n`,
          `data: ${JSON.stringify({ error: { message: 'Rate limit reached', type: 'rate_limit_exceeded' } })}\n\n`,
        ]);
      }
      if (url.startsWith('/broken-anthropic/messages')) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        return writeSplit(res, [
          `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Half an ' } })}\n\n`,
          `event: error\ndata: ${JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } })}\n\n`,
        ]);
      }

      // --- OpenAI dialect, and its Groq / Mistral usage variants ---
      if (url.match(/^\/(openai|groq|mistral)\/chat\/completions/)) {
        if ((lastRequest.body as { stream?: boolean }).stream) {
          res.writeHead(200, { 'content-type': 'text/event-stream' });
          const usage = { prompt_tokens: 12, completion_tokens: 4 };
          // OpenAI (include_usage) and Mistral: a final chunk with empty
          // choices and a `usage` object. Groq: under `x_groq.usage`.
          const usageFrame = url.startsWith('/groq')
            ? { choices: [], x_groq: { usage } }
            : { choices: [], usage };
          return writeSplit(res, [
            `data: ${JSON.stringify({ choices: [{ delta: { content: 'Hello' } }], usage: null })}\n\n`,
            `data: ${JSON.stringify({ choices: [{ delta: { content: ' world' } }], usage: null })}\n\n`,
            `data: ${JSON.stringify(usageFrame)}\n\n`,
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
            `event: message_start\ndata: ${JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 12, output_tokens: 1 } } })}\n\n`,
            `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } })}\n\n`,
            `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: ' world' } })}\n\n`,
            `event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 4 } })}\n\n`,
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
      if (url.includes('broken:streamGenerateContent')) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        return writeSplit(res, [
          `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Half an ' }] } }] })}\n\n`,
          `data: ${JSON.stringify({ error: { code: 503, status: 'UNAVAILABLE', message: 'The model is overloaded.' } })}\n\n`,
        ]);
      }
      if (url.includes('blocked:streamGenerateContent')) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        return writeSplit(res, [
          `data: ${JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } })}\n\n`,
        ]);
      }
      if (url.includes(':streamGenerateContent')) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        // Usage is cumulative per chunk; 2.5 models report thinking separately.
        return writeSplit(res, [
          `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Hello' }] } }], usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 1, thoughtsTokenCount: 30 } })}\n\n`,
          `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: ' world' }] } }], usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 4, thoughtsTokenCount: 30 } })}\n\n`,
        ]);
      }
      if (url.includes(':generateContent')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: 'Four.' }] }, finishReason: 'STOP' }],
            usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 3, thoughtsTokenCount: 20 },
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

function usageSink() {
  return { inputTokens: null as number | null, outputTokens: null as number | null };
}

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

  it('asks OpenAI for streamed usage and reads it from the final chunk', async () => {
    const usage = usageSink();
    await collect(adapter().stream(request, AbortSignal.timeout(5000), usage));
    expect((lastRequest.body as Record<string, unknown>).stream_options).toEqual({
      include_usage: true,
    });
    expect(usage).toEqual({ inputTokens: 12, outputTokens: 4 });
  });

  // Not every OpenAI-dialect endpoint accepts `stream_options`; they report
  // usage in-band anyway, so the parameter is withheld rather than risked.
  it.each([
    ['groq', 'x_groq.usage'],
    ['mistral', 'a final usage chunk'],
  ])('reads %s usage from %s without sending stream_options', async (provider) => {
    const usage = usageSink();
    const groqish = new OpenAICompatibleAdapter(provider, `${baseUrl}/${provider}`, 'test-key');
    expect(await collect(groqish.stream(request, AbortSignal.timeout(5000), usage))).toBe(
      'Hello world',
    );
    expect((lastRequest.body as Record<string, unknown>).stream_options).toBeUndefined();
    expect(usage).toEqual({ inputTokens: 12, outputTokens: 4 });
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

  it('reads input usage from message_start and the final output from message_delta', async () => {
    const usage = usageSink();
    await collect(adapter().stream(request, AbortSignal.timeout(5000), usage));
    expect(usage).toEqual({ inputTokens: 12, outputTokens: 4 });
  });
});

describe('Google adapter', () => {
  const adapter = () => new GoogleAdapter('test-key', baseUrl);

  // Thinking tokens are billed at the output rate but reported apart from the
  // candidates; leaving them out under-reported every 2.5-series turn.
  it('parses a candidate and its billed usage, thinking included', async () => {
    const result = await adapter().generate(request, AbortSignal.timeout(5000));
    expect(result).toMatchObject({ text: 'Four.', inputTokens: 11, outputTokens: 23 });
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

  it('takes the last cumulative usage from the stream, thinking included', async () => {
    const usage = usageSink();
    await collect(adapter().stream(request, AbortSignal.timeout(5000), usage));
    expect(usage).toEqual({ inputTokens: 12, outputTokens: 34 });
  });

  it('reports an in-band safety block on a stream as CONTENT_POLICY, not an empty answer', async () => {
    const blocked = { ...request, model: { ...request.model, providerModelId: 'blocked' } };
    await expect(collect(adapter().stream(blocked, AbortSignal.timeout(5000)))).rejects.toMatchObject(
      { code: 'CONTENT_POLICY' },
    );
  });
});

/**
 * Every model call streams, so a provider failure can arrive after the 200 as
 * an in-band frame. It must surface as an error — never as a short answer that
 * reads as complete.
 */
describe('in-stream provider failures', () => {
  it('OpenAI dialect: an error frame mid-stream is a RATE_LIMITED failure, not a truncated answer', async () => {
    const adapter = new OpenAICompatibleAdapter('groq', `${baseUrl}/broken-openai`, 'test-key');
    const seen: string[] = [];
    await expect(
      (async () => {
        for await (const chunk of adapter.stream(request, AbortSignal.timeout(5000))) seen.push(chunk);
      })(),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(seen.join('')).toBe('Half an ');
  });

  it('Anthropic: an overloaded_error event mid-stream is PROVIDER_UNAVAILABLE', async () => {
    const adapter = new AnthropicAdapter('test-key', `${baseUrl}/broken-anthropic`);
    await expect(collect(adapter.stream(request, AbortSignal.timeout(5000)))).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
  });

  it('Google: an error object mid-stream is classified by its code', async () => {
    const adapter = new GoogleAdapter('test-key', baseUrl);
    const broken = { ...request, model: { ...request.model, providerModelId: 'broken' } };
    await expect(collect(adapter.stream(broken, AbortSignal.timeout(5000)))).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
  });

  // An abort must surface as a failure. If the stream simply ended, the
  // orchestrator would record the text so far as a complete answer.
  it('an abort mid-stream rejects instead of ending the stream as if it were complete', async () => {
    const adapter = new OpenAICompatibleAdapter('openai', `${baseUrl}/slow-openai`, 'test-key');
    const controller = new AbortController();
    const seen: string[] = [];
    const outcome = (async () => {
      for await (const chunk of adapter.stream(request, controller.signal)) {
        seen.push(chunk);
        if (seen.length === 2) controller.abort();
      }
      return 'ended normally';
    })();
    await expect(outcome).rejects.toBeDefined();
    expect(seen.length).toBeGreaterThanOrEqual(2);
  });
});
