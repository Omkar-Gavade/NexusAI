import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ChatEvent, type Message } from '@nexusai/contracts';
import { Client, createHarness, ulid, type Harness } from '../fixtures/harness.ts';
import { Errors } from '../../src/domain/errors.ts';

let harness: Harness;
let client: Client;

beforeAll(async () => {
  harness = await createHarness();
  client = new Client(harness.app);
  await client.signUp();
});

afterAll(async () => {
  await harness.close();
});

beforeEach(() => {
  harness.container.limiter.reset();
  harness.testAdapter.reset();
  harness.container.registry.health.recordSuccess('test');
});

function parseSseEvents(rawBody: string): ChatEvent[] {
  const events: ChatEvent[] = [];
  for (const block of rawBody.split('\n\n')) {
    const dataLine = block
      .split('\n')
      .find((line) => line.startsWith('data: '));
    if (!dataLine) continue;
    const parsed = ChatEvent.safeParse(JSON.parse(dataLine.slice(6)));
    if (parsed.success) events.push(parsed.data);
  }
  return events;
}

describe('Smart Router & Performance Telemetry integration', () => {
  it('emits routingDecision in start event and persists telemetry on the turn', async () => {
    harness.testAdapter.program('test-alpha', {
      kind: 'succeed',
      text: 'Use an index on (userId, createdAt) to avoid an in-memory sort.',
    });

    const res = await client.post('/api/chat/stream', {
      conversationId: null,
      message: 'Debug this slow MongoDB query and fix the TypeScript repository index',
      selection: { mode: 'auto', routing: 'single' },
      clientMessageId: ulid(),
    });

    expect(res.status).toBe(200);
    const events = parseSseEvents(String(res.body));
    const start = events.find(
      (e): e is Extract<ChatEvent, { type: 'start' }> => e.type === 'start',
    );
    expect(start).toBeDefined();
    expect(start?.routingDecision).toBeDefined();
    expect(start?.routingDecision?.taskCategory).toBe('coding');
    expect(start?.routingDecision?.reason).toContain('Auto-selected');

    const complete = events.find(
      (e): e is Extract<ChatEvent, { type: 'complete' }> => e.type === 'complete',
    );
    expect(complete).toBeDefined();
    expect(typeof complete?.latencyMs).toBe('number');

    const messagesRes = await client.get(
      `/api/conversations/${start?.conversationId}/messages`,
    );
    expect(messagesRes.status).toBe(200);
    const assistantMsg = (messagesRes.body.messages as Message[]).find(
      (m) => m.role === 'assistant',
    );
    expect(assistantMsg?.routingDecision?.taskCategory).toBe('coding');
    expect(assistantMsg?.responses[0]?.inputTokens).toBeGreaterThan(0);
    expect(assistantMsg?.responses[0]?.outputTokens).toBeGreaterThan(0);
    // Test models have no verified commercial pricing entry, so cost is null (Unknown) rather than fake $0.00
    expect(assistantMsg?.metadata?.estimatedCostUsd).toBeNull();
  });
});

describe('Model Arena (compare mode) — concurrent comparison, selection, synthesis, and retry', () => {
  it('streams independent responses concurrently in compare mode, allows partial failure, and persists without auto-synthesis', async () => {
    harness.testAdapter.program('test-alpha', {
      kind: 'succeed',
      text: 'Alpha response: Raft uses a strong leader.',
    });
    harness.testAdapter.program('test-beta', {
      kind: 'fail',
      error: Errors.rateLimited(15),
    });
    harness.testAdapter.program('test-gamma', {
      kind: 'succeed',
      text: 'Gamma response: Paxos allows leaderless proposals.',
    });

    const res = await client.post('/api/chat/stream', {
      conversationId: null,
      message: 'Compare Raft and Paxos consensus protocols.',
      selection: {
        mode: 'compare',
        modelIds: ['test-alpha', 'test-beta', 'test-gamma'],
      },
      clientMessageId: ulid(),
    });

    expect(res.status).toBe(200);
    const events = parseSseEvents(String(res.body));

    const start = events.find(
      (e): e is Extract<ChatEvent, { type: 'start' }> => e.type === 'start',
    );
    expect(start?.mode).toBe('compare');
    expect(start?.plan.map((m) => m.modelId)).toEqual([
      'test-alpha',
      'test-beta',
      'test-gamma',
    ]);

    // Arena deltas streamed for the two succeeding models
    const arenaDeltas = events.filter(
      (e): e is Extract<ChatEvent, { type: 'arena_delta' }> => e.type === 'arena_delta',
    );
    expect(arenaDeltas.length).toBeGreaterThan(0);

    // No automatic synthesis pass in compare mode
    expect(events.some((e) => e.type === 'synthesis_start')).toBe(false);

    const agreementEvt = events.find(
      (e): e is Extract<ChatEvent, { type: 'agreement' }> => e.type === 'agreement',
    );
    expect(agreementEvt?.agreement).toEqual({
      requested: 3,
      responded: 2,
      concur: 0,
      diverge: 0,
    });

    // Verify persistence
    const convId = start!.conversationId;
    const listRes = await client.get(`/api/conversations/${convId}/messages`);
    const assistantMsg = (listRes.body.messages as Message[]).find(
      (m) => m.role === 'assistant',
    )!;

    expect(assistantMsg.mode).toBe('compare');
    expect(assistantMsg.content).toBe('');
    expect(assistantMsg.responses).toHaveLength(3);

    const alpha = assistantMsg.responses.find((r) => r.model.modelId === 'test-alpha');
    const beta = assistantMsg.responses.find((r) => r.model.modelId === 'test-beta');
    const gamma = assistantMsg.responses.find((r) => r.model.modelId === 'test-gamma');

    expect(alpha?.outcome).toBe('complete');
    expect(alpha?.text).toContain('Alpha response');
    expect(beta?.outcome).toBe('failed');
    expect(beta?.errorCode).toBe('RATE_LIMITED');
    expect(gamma?.outcome).toBe('complete');
    expect(gamma?.text).toContain('Gamma response');
  });

  it('persists the user selected answer and uses ONLY that answer as context on follow-up turns', async () => {
    harness.testAdapter.program('test-alpha', {
      kind: 'succeed',
      text: 'ALPHA_UNIQUE_CONTEXT_TOKEN_111',
    });
    harness.testAdapter.program('test-gamma', {
      kind: 'succeed',
      text: 'GAMMA_UNIQUE_CONTEXT_TOKEN_999',
    });

    const firstTurn = await client.post('/api/chat/stream', {
      conversationId: null,
      message: 'Give me a design option.',
      selection: {
        mode: 'compare',
        modelIds: ['test-alpha', 'test-gamma'],
      },
      clientMessageId: ulid(),
    });
    const events = parseSseEvents(String(firstTurn.body));
    const start = events.find(
      (e): e is Extract<ChatEvent, { type: 'start' }> => e.type === 'start',
    )!;
    const complete = events.find(
      (e): e is Extract<ChatEvent, { type: 'complete' }> => e.type === 'complete',
    )!;

    const convId = start.conversationId;
    const messageId = complete.messageId;

    // Select test-gamma as the preferred answer
    const selectRes = await client.patch(
      `/api/conversations/${convId}/messages/${messageId}/selection`,
      { selectedModelId: 'test-gamma' },
    );
    expect(selectRes.status).toBe(200);
    expect((selectRes.body as Message).selectedModelId).toBe('test-gamma');

    // Clear recorded requests and send a follow-up question in the same conversation
    harness.testAdapter.requests.length = 0;
    harness.testAdapter.program('test-gamma', {
      kind: 'succeed',
      text: 'Follow-up response expanding on Gamma.',
    });

    const followUp = await client.post('/api/chat/stream', {
      conversationId: convId,
      message: 'Elaborate on the selected option.',
      selection: { mode: 'manual', modelId: 'test-gamma' },
      clientMessageId: ulid(),
    });
    expect(followUp.status).toBe(200);

    expect(harness.testAdapter.requests.length).toBeGreaterThan(0);
    const sentHistory = harness.testAdapter.requests[0]!.messages;
    const assistantHistoryEntry = sentHistory.find((m) => m.role === 'assistant');

    expect(assistantHistoryEntry?.content).toBe('GAMMA_UNIQUE_CONTEXT_TOKEN_999');
    expect(assistantHistoryEntry?.content).not.toContain('ALPHA_UNIQUE_CONTEXT_TOKEN_111');
  });

  it('combines completed Arena answers on demand via POST .../synthesize and persists synthesis metadata', async () => {
    harness.testAdapter.program('test-alpha', {
      kind: 'succeed',
      text: 'Alpha says: use connection pooling.',
    });
    harness.testAdapter.program('test-beta', {
      kind: 'succeed',
      text: 'Beta says: use connection pooling and statement timeouts.',
    });

    const turnRes = await client.post('/api/chat/stream', {
      conversationId: null,
      message: 'How should we harden PostgreSQL connections?',
      selection: {
        mode: 'compare',
        modelIds: ['test-alpha', 'test-beta'],
      },
      clientMessageId: ulid(),
    });
    const events = parseSseEvents(String(turnRes.body));
    const convId = events.find(
      (e): e is Extract<ChatEvent, { type: 'start' }> => e.type === 'start',
    )!.conversationId;
    const msgId = events.find(
      (e): e is Extract<ChatEvent, { type: 'complete' }> => e.type === 'complete',
    )!.messageId;

    // Program synthesis output with explicit verdicts
    harness.testAdapter.program('test-alpha', {
      kind: 'succeed',
      text: '<verdicts>\ntest-alpha: concurs\ntest-beta: concurs\n</verdicts>\nUse connection pooling alongside statement timeouts.',
    });

    const synthRes = await client.post(
      `/api/conversations/${convId}/messages/${msgId}/synthesize`,
      {},
    );
    expect(synthRes.status).toBe(200);
    const updated = synthRes.body as Message;

    expect(updated.content).toBe('Use connection pooling alongside statement timeouts.');
    expect(updated.synthesisModel?.modelId).toBe('test-alpha');
    expect(updated.agreement).toEqual({
      requested: 2,
      responded: 2,
      concur: 2,
      diverge: 0,
    });
  });

  it('retries a single failed model on an Arena turn without erasing successful answers', async () => {
    harness.testAdapter.program('test-alpha', {
      kind: 'succeed',
      text: 'Alpha initial answer.',
    });
    harness.testAdapter.program('test-beta', {
      kind: 'fail',
      error: Errors.timeout({ modelId: 'test-beta' }),
    });

    const turnRes = await client.post('/api/chat/stream', {
      conversationId: null,
      message: 'Explain event loop backpressure.',
      selection: {
        mode: 'compare',
        modelIds: ['test-alpha', 'test-beta'],
      },
      clientMessageId: ulid(),
    });
    const events = parseSseEvents(String(turnRes.body));
    const convId = events.find(
      (e): e is Extract<ChatEvent, { type: 'start' }> => e.type === 'start',
    )!.conversationId;
    const msgId = events.find(
      (e): e is Extract<ChatEvent, { type: 'complete' }> => e.type === 'complete',
    )!.messageId;

    // Now test-beta recovers
    harness.testAdapter.program('test-beta', {
      kind: 'succeed',
      text: 'Beta recovered answer on retry.',
    });

    const retryRes = await client.post(
      `/api/conversations/${convId}/messages/${msgId}/retry-model`,
      { modelId: 'test-beta' },
    );
    expect(retryRes.status).toBe(200);
    const updated = retryRes.body as Message;

    const alpha = updated.responses.find((r) => r.model.modelId === 'test-alpha');
    const beta = updated.responses.find((r) => r.model.modelId === 'test-beta');

    expect(alpha?.outcome).toBe('complete');
    expect(alpha?.text).toBe('Alpha initial answer.');
    expect(beta?.outcome).toBe('complete');
    expect(beta?.text).toBe('Beta recovered answer on retry.');
  });
});
