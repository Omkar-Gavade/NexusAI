import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ChatEvent } from '@nexusai/contracts';
import { Client, createHarness, parseSse, ulid, type Harness } from '../fixtures/harness.ts';
import { Errors } from '../../src/domain/errors.ts';
import { VERDICT_CLOSE, VERDICT_OPEN } from '../../src/domain/synthesis/prompt.ts';

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
  harness.container.registry.health.reset();
});

async function signedInClient(): Promise<Client> {
  const c = new Client(harness.app);
  await c.signUp();
  return c;
}

function send(c: Client, overrides: Record<string, unknown> = {}) {
  return c.post('/api/chat/stream', {
    conversationId: null,
    message: 'How should we handle writes spanning two services?',
    selection: { mode: 'auto', routing: 'balanced' },
    clientMessageId: ulid(),
    ...overrides,
  });
}

/** The synthesiser is a test model too; give it a parseable verdict block. */
function programSynthesis(stances: Record<string, 'concurs' | 'diverges'>, answer = 'The answer.') {
  const block = Object.entries(stances)
    .map(([id, stance]) => `${id}: ${stance}`)
    .join('\n');
  harness.testAdapter.program('test-alpha', {
    kind: 'succeed',
    text: `${VERDICT_OPEN}\n${block}\n${VERDICT_CLOSE}\n${answer}`,
  });
}

describe('event protocol', () => {
  it('emits a valid sequence and every event conforms to the contract', async () => {
    const c = await signedInClient();
    const res = await send(c);
    expect(res.status).toBe(200);

    const events = parseSse(res.body as string);
    // Contract test: a backend change that breaks the frozen client fails here.
    for (const event of events) {
      expect(ChatEvent.safeParse(event).success, JSON.stringify(event)).toBe(true);
    }

    const order = events.map((e) => e.type);
    expect(order[0]).toBe('start');
    expect(order.at(-1)).toBe('complete');
    expect(order.filter((t) => t === 'model_start')).toHaveLength(3);
    expect(order.indexOf('synthesis_start')).toBeGreaterThan(order.lastIndexOf('model_start'));
    expect(order.indexOf('delta')).toBeGreaterThan(order.indexOf('synthesis_start'));
  });

  // The frozen reducer has no state for per-model deltas. Emitting them would
  // silently drop text on the floor.
  it('never emits a per-model delta', async () => {
    const c = await signedInClient();
    const events = parseSse((await send(c)).body as string);
    expect(events.some((e) => e.type === 'model_delta')).toBe(false);
    expect(events.filter((e) => e.type === 'model_complete')).toHaveLength(3);
  });

  it('names every planned model up front, in a stable order', async () => {
    const c = await signedInClient();
    const events = parseSse((await send(c)).body as string);
    const start = events.find((e) => e.type === 'start')!;
    expect(start.plan.map((m: any) => m.modelId)).toEqual(['test-alpha', 'test-beta', 'test-gamma']);
  });

  it('emits exactly one terminal event', async () => {
    const c = await signedInClient();
    const events = parseSse((await send(c)).body as string);
    const terminals = events.filter((e) => ['complete', 'error', 'cancelled'].includes(e.type));
    expect(terminals).toHaveLength(1);
  });

  it('serves the stream as SSE with buffering disabled', async () => {
    const c = await signedInClient();
    const res = await send(c);
    expect(res.headers['content-type']).toContain('text/event-stream');
    // Without this, proxies buffer and the answer arrives in one lump.
    expect(res.headers['x-accel-buffering']).toBe('no');
  });
});

describe('model failure matrix', () => {
  it('3 of 3 respond', async () => {
    programSynthesis({ 'test-alpha': 'concurs', 'test-beta': 'concurs', 'test-gamma': 'concurs' });
    const events = parseSse((await send(await signedInClient())).body as string);
    const agreement = events.find((e) => e.type === 'agreement')!.agreement;
    expect(agreement).toMatchObject({ requested: 3, responded: 3, concur: 3, diverge: 0 });
  });

  it('2 of 3 respond, and the count reflects reality', async () => {
    harness.testAdapter.program('test-gamma', { kind: 'fail', error: Errors.providerError({}) });
    programSynthesis({ 'test-alpha': 'concurs', 'test-beta': 'diverges' });

    const events = parseSse((await send(await signedInClient())).body as string);
    const agreement = events.find((e) => e.type === 'agreement')!.agreement;

    // Never 3. Reporting the requested count as responded is the exact lie the
    // provenance rail would surface.
    expect(agreement.requested).toBe(3);
    expect(agreement.responded).toBe(2);
    expect(events.some((e) => e.type === 'model_error' && e.modelId === 'test-gamma')).toBe(true);
  });

  it('1 of 3 responds and the turn still completes', async () => {
    harness.testAdapter.program('test-beta', { kind: 'fail', error: Errors.timeout({}) });
    harness.testAdapter.program('test-gamma', { kind: 'empty' });
    programSynthesis({ 'test-alpha': 'concurs' });

    const events = parseSse((await send(await signedInClient())).body as string);
    expect(events.at(-1)!.type).toBe('complete');
    expect(events.find((e) => e.type === 'agreement')!.agreement.responded).toBe(1);
  });

  it('0 of 3 respond and the turn fails rather than inventing an answer', async () => {
    harness.testAdapter.setDefault({ kind: 'fail', error: Errors.providerUnavailable({}) });

    const res = await send(await signedInClient());
    const events = parseSse(res.body as string);
    const terminal = events.at(-1)!;

    expect(terminal.type).toBe('error');
    expect(terminal.code).toBe('SYNTHESIS_FAILED');
    expect(events.some((e) => e.type === 'delta')).toBe(false);
  });

  it('records a failed model in provenance rather than omitting it', async () => {
    harness.testAdapter.program('test-gamma', { kind: 'fail', error: Errors.timeout({}) });
    programSynthesis({ 'test-alpha': 'concurs', 'test-beta': 'concurs' });

    const c = await signedInClient();
    await send(c);

    const conversations = (await c.get('/api/conversations')).body;
    const history = (
      await c.get(`/api/conversations/${conversations.conversations[0].id}/messages`)
    ).body;
    const assistant = history.messages.at(-1);

    expect(assistant.responses).toHaveLength(3);
    const gamma = assistant.responses.find((r: any) => r.model.modelId === 'test-gamma');
    expect(gamma.outcome).toBe('failed');
    // A model that failed is never assigned a stance.
    expect(gamma.stance).toBe('unknown');
    expect(gamma.errorCode).toBe('TIMEOUT');
  });
});

describe('stance honesty', () => {
  it('leaves every stance unknown when the synthesiser emits no verdicts', async () => {
    // The default test response has no verdict block.
    const events = parseSse((await send(await signedInClient())).body as string);
    const agreement = events.find((e) => e.type === 'agreement')!;

    expect(Object.values(agreement.stances).every((s) => s === 'unknown')).toBe(true);
    expect(agreement.agreement.concur).toBe(0);
    expect(agreement.agreement.diverge).toBe(0);
  });

  it('never leaks the verdict block into the answer', async () => {
    programSynthesis({ 'test-alpha': 'concurs' }, 'The reconciled answer.');
    const events = parseSse((await send(await signedInClient())).body as string);
    const text = events
      .filter((e) => e.type === 'delta')
      .map((e) => e.text)
      .join('');

    expect(text).not.toContain(VERDICT_OPEN);
    expect(text).not.toContain('concurs');
    expect(text).toContain('The reconciled answer.');
  });
});

describe('request handling', () => {
  it('rejects an unauthenticated stream', async () => {
    const res = await send(new Client(harness.app));
    expect(res.status).toBe(401);
  });

  it('rejects an invalid body before doing any model work', async () => {
    const c = await signedInClient();
    const res = await send(c, { message: '' });
    expect(res.status).toBe(400);
    expect(harness.testAdapter.calls).toHaveLength(0);
  });

  it('suppresses a duplicate clientMessageId before the stream opens', async () => {
    const c = await signedInClient();
    const id = ulid();
    expect((await send(c, { clientMessageId: id })).status).toBe(200);

    const second = await send(c, { clientMessageId: id });
    // Detected in preflight, so it is a plain 409 rather than an error event
    // inside a 200 — far easier for a client to handle.
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('DUPLICATE_REQUEST');
  });

  it('creates no conversation when a duplicate is rejected', async () => {
    const c = await signedInClient();
    const id = ulid();
    await send(c, { clientMessageId: id });

    const before = (await c.get('/api/conversations')).body.conversations.length;
    await send(c, { clientMessageId: id });
    const after = (await c.get('/api/conversations')).body.conversations.length;

    expect(after).toBe(before);
  });

  it('honours a manual model choice without substituting', async () => {
    const c = await signedInClient();
    const res = await send(c, { selection: { mode: 'manual', modelId: 'test-beta' } });
    const events = parseSse(res.body as string);
    const start = events.find((e) => e.type === 'start')!;

    expect(start.plan).toHaveLength(1);
    expect(start.plan[0].modelId).toBe('test-beta');
    expect(start.mode).toBe('manual');
  });

  it('refuses an unknown model rather than falling back', async () => {
    const c = await signedInClient();
    const res = await send(c, { selection: { mode: 'manual', modelId: 'not-a-model' } });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('MODEL_NOT_FOUND');
    expect(harness.testAdapter.calls).toHaveLength(0);
  });
});

// Regression: a bodyless POST carrying a JSON content-type is legal, and
// several endpoints take no body. Fastify raises a 400 for it; mapping that to
// INTERNAL turned a client mistake into a 500 and broke logout entirely.
describe('framework-level request errors', () => {
  it('accepts a bodyless POST that declares a JSON content-type', async () => {
    const c = await signedInClient();
    const res = await harness.app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: {
        'x-nexus-client': 'web',
        origin: 'http://localhost:5173',
        'content-type': 'application/json',
        cookie: (c as unknown as { cookies: Map<string, string> }).cookies
          ? [...(c as unknown as { cookies: Map<string, string> }).cookies]
              .map(([k, v]) => `${k}=${v}`)
              .join('; ')
          : '',
      },
    });
    expect(res.statusCode).toBe(204);
  });

  it('reports malformed JSON as a 400, never a 500', async () => {
    const res = await harness.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: {
        'x-nexus-client': 'web',
        origin: 'http://localhost:5173',
        'content-type': 'application/json',
      },
      payload: '{ this is not json',
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('never leaks a framework error code as user-facing copy', async () => {
    const res = await harness.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: {
        'x-nexus-client': 'web',
        origin: 'http://localhost:5173',
        'content-type': 'application/json',
      },
      payload: '',
    });
    const body = JSON.parse(res.body);
    expect(JSON.stringify(body)).not.toMatch(/FST_ERR/);
  });
});
