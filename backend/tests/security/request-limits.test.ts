import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MESSAGE_MAX_CHARS } from '@nexusai/contracts';
import { Client, createHarness, type Harness } from '../fixtures/harness.ts';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(() => {
  h.container.limiter.reset();
  h.testAdapter.reset();
});

async function signedIn(): Promise<Client> {
  const c = new Client(h.app);
  await c.post('/api/auth/register', {
    email: `lim-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
    password: 'a-sufficiently-long-password',
    displayName: 'Limits',
  });
  return c;
}

const ulid = () => 'A'.repeat(26);

/**
 * The frontend's limits are a courtesy. These assert the boundary the backend
 * actually enforces against a client that ignores them entirely.
 */
describe('server-side request limits', () => {
  it('gives the client no way to ask for more models than the plan allows', async () => {
    const c = await signedIn();

    // The contract has no model list: fan-out size is chosen by the server from
    // the routing mode. Extra keys are stripped rather than honoured.
    const res = await c.post('/api/chat/stream', {
      conversationId: null,
      message: 'how many models',
      selection: { mode: 'auto', routing: 'thorough' },
      clientMessageId: ulid(),
      models: Array.from({ length: 100 }, (_, i) => `model-${i}`),
      maxModels: 100,
    });

    expect(res.status).toBe(200);

    // The plan the server announced is the authority, not anything the client
    // asked for. (`testAdapter.calls` also counts the synthesis pass, which
    // uses the same adapter, so it is not the right thing to measure here.)
    const start = String(res.body)
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => JSON.parse(line.slice(5)))
      .find((event) => event.type === 'start');

    expect(start.plan.length).toBeLessThanOrEqual(h.config.MAX_MODELS_PER_REQUEST);
    // Only three test models exist, so `thorough` cannot exceed them either.
    expect(start.plan.length).toBe(3);
    expect(start.plan.map((m: { modelId: string }) => m.modelId)).not.toContain('model-0');
  }, 30_000);

  it('ignores a userId supplied in the body and uses the session identity', async () => {
    const attacker = await signedIn();
    const victim = await signedIn();
    const victimId = (await victim.get('/api/auth/me')).body.user.id;

    const res = await attacker.post('/api/chat/stream', {
      conversationId: null,
      message: 'whose turn is this',
      selection: { mode: 'auto', routing: 'single' },
      clientMessageId: ulid(),
      userId: victimId,
    });
    expect(res.status).toBe(200);

    // The turn belongs to the caller, not to the id they claimed.
    const victimList = (await victim.get('/api/conversations')).body.conversations;
    const attackerList = (await attacker.get('/api/conversations')).body.conversations;
    expect(victimList).toHaveLength(0);
    expect(attackerList).toHaveLength(1);
  }, 30_000);

  it('rejects an oversized prompt before any provider is called', async () => {
    const c = await signedIn();
    const res = await c.post('/api/chat/stream', {
      conversationId: null,
      message: 'x'.repeat(MESSAGE_MAX_CHARS + 1),
      selection: { mode: 'auto', routing: 'balanced' },
      clientMessageId: ulid(),
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    // The cost control only counts if it happens before the spend.
    expect(h.testAdapter.calls).toHaveLength(0);
  }, 30_000);

  it('accepts a prompt exactly at the documented maximum', async () => {
    const c = await signedIn();
    const res = await c.post('/api/chat/stream', {
      conversationId: null,
      message: 'x'.repeat(MESSAGE_MAX_CHARS),
      selection: { mode: 'auto', routing: 'single' },
      clientMessageId: ulid(),
    });
    expect(res.status).toBe(200);
  }, 30_000);

  it('refuses a model the caller is not allowed to route to, without substituting', async () => {
    const c = await signedIn();
    const res = await c.post('/api/chat/stream', {
      conversationId: null,
      message: 'pin an unconfigured model',
      selection: { mode: 'manual', modelId: 'gpt-4o' },
      clientMessageId: ulid(),
    });

    // Silently swapping in a different model would make the rail report a
    // model that never ran.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(h.testAdapter.calls).toHaveLength(0);
  }, 30_000);
});
