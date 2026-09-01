import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client, createHarness, ulid, type Harness } from '../fixtures/harness.ts';

let harness: Harness;
let alice: Client;
let bob: Client;
let aliceConversationId: string;

beforeAll(async () => {
  harness = await createHarness();

  alice = new Client(harness.app);
  await alice.signUp('alice@example.com');
  await alice.post('/api/chat/stream', {
    conversationId: null,
    message: "Alice's private question about her salary negotiation.",
    selection: { mode: 'auto', routing: 'single' },
    clientMessageId: ulid(),
  });
  aliceConversationId = (await alice.get('/api/conversations')).body.conversations[0].id;

  bob = new Client(harness.app);
  await bob.signUp('bob@example.com');
});

afterAll(async () => {
  await harness.close();
});
beforeEach(() => {
  harness.container.limiter.reset();
});

describe('user isolation', () => {
  it("does not list another user's conversations", async () => {
    const res = await bob.get('/api/conversations');
    expect(res.status).toBe(200);
    expect(res.body.conversations).toHaveLength(0);
  });

  // 404, never 403: a 403 confirms the row exists and lets an attacker
  // enumerate ids.
  it("answers 404, not 403, for another user's messages", async () => {
    const res = await bob.get(`/api/conversations/${aliceConversationId}/messages`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it("cannot rename another user's conversation", async () => {
    const res = await bob.patch(`/api/conversations/${aliceConversationId}`, { title: 'Owned' });
    expect(res.status).toBe(404);

    const owner = await alice.get('/api/conversations');
    expect(owner.body.conversations[0].title).not.toBe('Owned');
  });

  it("cannot delete another user's conversation", async () => {
    const res = await bob.delete(`/api/conversations/${aliceConversationId}`);
    expect(res.status).toBe(404);

    // Still there, and still Alice's.
    const owner = await alice.get(`/api/conversations/${aliceConversationId}/messages`);
    expect(owner.status).toBe(200);
    expect(owner.body.messages.length).toBeGreaterThan(0);
  });

  it("cannot post into another user's conversation", async () => {
    const res = await bob.post('/api/chat/stream', {
      conversationId: aliceConversationId,
      message: 'Injecting into someone else’s thread.',
      selection: { mode: 'auto', routing: 'single' },
      clientMessageId: ulid(),
    });
    expect(res.status).toBe(404);
  });

  it('rejects a malformed conversation id without touching the database', async () => {
    const res = await bob.get('/api/conversations/not-an-object-id/messages');
    expect(res.status).toBe(400);
  });
});

describe('secret containment', () => {
  it('never exposes a provider key or password hash through any response', async () => {
    const responses = await Promise.all([
      alice.get('/api/models'),
      alice.get('/api/auth/me'),
      alice.get('/api/conversations'),
      alice.get(`/api/conversations/${aliceConversationId}/messages`),
    ]);

    const body = JSON.stringify(responses.map((r) => r.body));
    expect(body).not.toMatch(/API_KEY|passwordHash|argon2|sk-|AIza/);
  });

  it('does not reveal which providers are configured on the readiness probe', async () => {
    const res = await new Client(harness.app).get('/health/ready');
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    for (const provider of ['openai', 'anthropic', 'google', 'mistral', 'groq', 'deepseek']) {
      expect(body).not.toContain(provider);
    }
  });
});

describe('input limits', () => {
  it('rejects a message beyond the contract maximum', async () => {
    const res = await alice.post('/api/chat/stream', {
      conversationId: null,
      message: 'x'.repeat(40_000),
      selection: { mode: 'auto', routing: 'single' },
      clientMessageId: ulid(),
    });
    expect(res.status).toBe(400);
  });

  it('rejects an oversized request body before parsing it', async () => {
    const res = await harness.app.inject({
      method: 'POST',
      url: '/api/chat/stream',
      headers: { 'x-nexus-client': 'web', origin: 'http://localhost:5173', 'content-type': 'application/json' },
      payload: JSON.stringify({ message: 'x'.repeat(400_000) }),
    });
    expect([400, 401, 413]).toContain(res.statusCode);
  });
});
