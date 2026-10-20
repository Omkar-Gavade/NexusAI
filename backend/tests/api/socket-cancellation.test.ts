import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createHarness, ulid, type Harness } from '../fixtures/harness.ts';

/**
 * Cancellation over a real TCP socket.
 *
 * `inject()` never opens a socket, so it cannot tell "the request body was
 * consumed" apart from "the client went away". On Node 22 those are different
 * events on different objects: `IncomingMessage` emits `close` as soon as the
 * body has been read, while only the response observes the socket closing.
 * Listening on the wrong one either aborts every turn immediately or never
 * aborts at all — so this is tested against a listening server.
 */
let harness: Harness;
let base: string;
let cookie: string;

beforeAll(async () => {
  // One stream per user, so a slot leaked by a disconnect shows up as a 429.
  harness = await createHarness({ MAX_CONCURRENT_STREAMS_PER_USER: '1' });
  await harness.app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = harness.app.server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;

  const res = await harness.app.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: {
      'x-nexus-client': 'web',
      origin: 'http://localhost:5173',
      'content-type': 'application/json',
    },
    payload: JSON.stringify({
      email: `socket-${ulid().toLowerCase()}@example.com`,
      password: 'correct-horse-battery',
      displayName: 'Socket Tester',
    }),
  });
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  cookie = list.map((entry) => entry.split(';')[0]).join('; ');
});

afterAll(async () => {
  await harness.close();
});

beforeEach(() => {
  harness.testAdapter.reset();
  harness.container.registry.health.reset();
});

function openStream(body: unknown, signal?: AbortSignal) {
  return fetch(`${base}/api/chat/stream`, {
    method: 'POST',
    headers: {
      'x-nexus-client': 'web',
      origin: 'http://localhost:5173',
      'content-type': 'application/json',
      cookie,
    },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });
}

async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('condition not met in time');
}

describe('chat stream over a real socket', () => {
  it('runs a turn to completion when the client stays connected', async () => {
    harness.testAdapter.setDefault({ kind: 'succeed', delayMs: 150 });

    const response = await openStream({
      conversationId: null,
      message: 'Stay connected for the whole answer.',
      selection: { mode: 'manual', modelId: 'test-alpha' },
      clientMessageId: ulid(),
    });
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain('"type":"complete"');
    expect(text).not.toContain('"type":"cancelled"');
    expect(harness.testAdapter.aborted).toHaveLength(0);
  });

  it('aborts in-flight provider calls and records the turn as cancelled when the client disconnects', async () => {
    harness.testAdapter.setDefault({ kind: 'succeed', delayMs: 4_000 });

    const controller = new AbortController();
    const response = await openStream(
      {
        conversationId: null,
        message: 'Disconnect while the models are still working.',
        selection: { mode: 'compare', modelIds: ['test-alpha', 'test-beta'] },
        clientMessageId: ulid(),
      },
      controller.signal,
    );
    expect(response.status).toBe(200);

    // Read until the plan is announced, then walk away.
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let seen = '';
    let messageId = '';
    while (!messageId) {
      const { value, done } = await reader.read();
      if (done) break;
      seen += decoder.decode(value, { stream: true });
      messageId = /"messageId":"([a-f\d]{24})"/.exec(seen)?.[1] ?? '';
    }
    await waitFor(() => harness.testAdapter.calls.length >= 2);
    controller.abort();
    const abortedAt = Date.now();

    await waitFor(() => harness.testAdapter.aborted.length >= 2);

    const messages = harness.db.collection('messages');
    await waitFor(async () => {
      const doc = await messages.findOne({ role: 'assistant' }, { sort: { _id: -1 } });
      return doc?.status === 'cancelled';
    });
    // Promptly, not by waiting out the four-second model.
    expect(Date.now() - abortedAt).toBeLessThan(1_500);

    // The disconnected stream's concurrency slot was released.
    harness.testAdapter.setDefault({ kind: 'succeed' });
    const next = await openStream({
      conversationId: null,
      message: 'A new question after pressing Stop.',
      selection: { mode: 'manual', modelId: 'test-alpha' },
      clientMessageId: ulid(),
    });
    expect(next.status).toBe(200);
    expect(await next.text()).toContain('"type":"complete"');
  });
});
