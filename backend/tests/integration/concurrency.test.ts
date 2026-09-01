import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ChatEvent } from '@nexusai/contracts';
import { Client, createHarness, parseSse, ulid, type Harness } from '../fixtures/harness.ts';

let harness: Harness;

beforeAll(async () => {
  harness = await createHarness();
});
afterAll(async () => {
  await harness.close();
});
beforeEach(() => {
  harness.testAdapter.reset();
  harness.container.limiter.reset();
});

function send(client: Client, message: string) {
  return client.post('/api/chat/stream', {
    conversationId: null,
    message,
    selection: { mode: 'auto', routing: 'balanced' },
    clientMessageId: ulid(),
  });
}

describe('concurrent requests', () => {
  // Request state must be per-request. A shared mutable buffer would let one
  // user's prompt or provenance surface in another's answer.
  it('keeps four concurrent users completely isolated', async () => {
    const users = await Promise.all(
      Array.from({ length: 4 }, async (_, i) => {
        const c = new Client(harness.app);
        const { user } = await c.signUp(`concurrent-${i}@example.com`);
        return { client: c, userId: user.id, marker: `MARKER-${i}` };
      }),
    );

    // Slight delays so the fan-outs genuinely overlap rather than serialising.
    harness.testAdapter.setDefault({ kind: 'succeed', delayMs: 40 });

    const responses = await Promise.all(
      users.map(({ client, marker }) => send(client, `Question containing ${marker}.`)),
    );

    for (const response of responses) {
      expect(response.status).toBe(200);
    }

    // Each user sees exactly their own conversation, containing only their marker.
    for (const { client, marker } of users) {
      const list = await client.get('/api/conversations');
      expect(list.body.conversations).toHaveLength(1);
      expect(list.body.conversations[0].title).toContain(marker);

      const history = await client.get(
        `/api/conversations/${list.body.conversations[0].id}/messages`,
      );
      const text = JSON.stringify(history.body);
      expect(text).toContain(marker);
      for (const other of users) {
        if (other.marker !== marker) expect(text).not.toContain(other.marker);
      }
    }
  }, 20_000);

  it('gives every concurrent stream its own valid event sequence', async () => {
    const clients = await Promise.all(
      Array.from({ length: 3 }, async () => {
        const c = new Client(harness.app);
        await c.signUp();
        return c;
      }),
    );

    harness.testAdapter.setDefault({ kind: 'succeed', delayMs: 30 });

    const responses = await Promise.all(clients.map((c, i) => send(c, `Concurrent stream ${i}.`)));

    for (const response of responses) {
      const events = parseSse(response.body as string);
      for (const event of events) {
        expect(ChatEvent.safeParse(event).success).toBe(true);
      }
      const order = events.map((e) => e.type);
      expect(order[0]).toBe('start');
      expect(order.at(-1)).toBe('complete');
      // Exactly one terminal event per stream — no bleed between connections.
      expect(order.filter((t) => ['complete', 'error', 'cancelled'].includes(t))).toHaveLength(1);
    }

    // Each stream reported a distinct message id.
    const ids = responses.map(
      (r) => parseSse(r.body as string).find((e) => e.type === 'start')?.messageId,
    );
    expect(new Set(ids).size).toBe(3);
  }, 20_000);

  it('enforces the per-user concurrent stream cap', async () => {
    const c = new Client(harness.app);
    await c.signUp();
    harness.testAdapter.setDefault({ kind: 'succeed', delayMs: 300 });

    const cap = harness.config.MAX_CONCURRENT_STREAMS_PER_USER;
    const results = await Promise.all(
      Array.from({ length: cap + 2 }, (_, i) => send(c, `Burst ${i}.`)),
    );

    const rejected = results.filter((r) => r.status === 429);
    expect(rejected.length).toBeGreaterThan(0);
  }, 20_000);

  it('does not let concurrent duplicate sends create two turns', async () => {
    const c = new Client(harness.app);
    await c.signUp();
    const id = ulid();

    const body = {
      conversationId: null,
      message: 'Duplicate submitted twice at once.',
      selection: { mode: 'auto' as const, routing: 'single' as const },
      clientMessageId: id,
    };

    const [a, b] = await Promise.all([
      c.post('/api/chat/stream', body),
      c.post('/api/chat/stream', body),
    ]);

    // One succeeds. The other is refused — by the idempotency check or, if both
    // raced past it, by the unique index. Either way exactly one turn exists.
    const statuses = [a.status, b.status].sort();
    expect(statuses[0]).toBe(200);

    const list = await c.get('/api/conversations');
    expect(list.body.conversations).toHaveLength(1);

    const history = await c.get(
      `/api/conversations/${list.body.conversations[0].id}/messages`,
    );
    const userMessages = history.body.messages.filter((m: any) => m.role === 'user');
    expect(userMessages).toHaveLength(1);
  }, 20_000);
});
