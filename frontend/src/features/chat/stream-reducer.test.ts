import { describe, expect, it } from 'vitest';
import type { ChatEvent, ModelRef } from '@nexusai/contracts';
import {
  initialStreamState,
  isStreaming,
  orderedSlots,
  reduce,
  type StreamAction,
  type StreamState,
} from './stream-reducer';

const alpha: ModelRef = { modelId: 'alpha-1', provider: 'p1', displayName: 'Alpha 1' };
const beta: ModelRef = { modelId: 'beta-2', provider: 'p2', displayName: 'Beta 2' };
const gamma: ModelRef = { modelId: 'gamma-3', provider: 'p3', displayName: 'Gamma 3' };
const synth: ModelRef = { modelId: 'alpha-1', provider: 'p1', displayName: 'Alpha 1' };

const start: ChatEvent = {
  type: 'start',
  conversationId: 'c1',
  messageId: 'm1',
  plan: [alpha, beta, gamma],
  mode: 'auto',
};

const modelComplete = (modelId: string, text = 'answer'): ChatEvent => ({
  type: 'model_complete',
  modelId,
  text,
  outcome: 'complete',
  latencyMs: 1200,
  inputTokens: 100,
  outputTokens: 50,
});

/** Applies events in order from the initial state. */
function run(...events: ChatEvent[]): StreamState {
  return events.reduce<StreamState>(
    (state, event) => reduce(state, { kind: 'event', event }),
    initialStreamState,
  );
}

const ALL_EVENTS: ChatEvent[] = [
  start,
  { type: 'model_start', modelId: 'alpha-1' },
  modelComplete('alpha-1'),
  { type: 'model_error', modelId: 'beta-2', code: 'TIMEOUT', message: 'timed out' },
  { type: 'synthesis_start', model: synth },
  { type: 'delta', text: 'x' },
  {
    type: 'agreement',
    agreement: { responded: 3, requested: 3, concur: 2, diverge: 1 },
    stances: {},
  },
  { type: 'sources', sources: [] },
  { type: 'complete', messageId: 'm1', latencyMs: 3000, firstTokenMs: 400 },
  { type: 'error', code: 'INTERNAL', message: 'boom', partial: false, requestId: 'r1' },
  { type: 'cancelled', messageId: 'm1', latencyMs: 900 },
];

describe('stream reducer — lifecycle', () => {
  it('starts idle with nothing populated', () => {
    expect(initialStreamState.phase).toBe('idle');
    expect(initialStreamState.text).toBe('');
    expect(initialStreamState.plan).toEqual([]);
  });

  it('seeds one queued slot per planned model on start', () => {
    const state = run(start);
    expect(state.phase).toBe('models');
    expect(state.conversationId).toBe('c1');
    expect(Object.keys(state.models)).toHaveLength(3);
    expect(state.models['alpha-1']?.phase).toBe('queued');
  });

  it('moves a slot to running, then complete, carrying its metrics', () => {
    const state = run(start, { type: 'model_start', modelId: 'beta-2' }, modelComplete('beta-2', 'hi'));
    const slot = state.models['beta-2'];
    expect(slot?.phase).toBe('complete');
    expect(slot?.text).toBe('hi');
    expect(slot?.latencyMs).toBe(1200);
    expect(slot?.outputTokens).toBe(50);
  });

  it('marks a failed model without disturbing the others', () => {
    const state = run(start, {
      type: 'model_error',
      modelId: 'beta-2',
      code: 'PROVIDER_UNAVAILABLE',
      message: 'down',
    });
    expect(state.models['beta-2']?.phase).toBe('failed');
    expect(state.models['beta-2']?.errorCode).toBe('PROVIDER_UNAVAILABLE');
    expect(state.models['alpha-1']?.phase).toBe('queued');
    expect(state.phase).toBe('models');
  });

  it('accumulates synthesis deltas in order', () => {
    const state = run(
      start,
      { type: 'synthesis_start', model: synth },
      { type: 'delta', text: 'Hello' },
      { type: 'delta', text: ', ' },
      { type: 'delta', text: 'world' },
    );
    expect(state.phase).toBe('synthesis');
    expect(state.text).toBe('Hello, world');
    expect(state.synthesisModel).toEqual(synth);
  });

  it('applies stances from the agreement event onto the matching slots', () => {
    const state = run(start, {
      type: 'agreement',
      agreement: { responded: 3, requested: 3, concur: 2, diverge: 1 },
      stances: { 'alpha-1': 'concurs', 'beta-2': 'concurs', 'gamma-3': 'diverges' },
    });
    expect(state.models['gamma-3']?.stance).toBe('diverges');
    expect(state.agreement?.diverge).toBe(1);
  });

  it('ignores a stance for a model that is not in the plan', () => {
    const state = run(start, {
      type: 'agreement',
      agreement: { responded: 1, requested: 3, concur: 1, diverge: 0 },
      stances: { 'not-planned': 'concurs' },
    });
    expect(state.models['not-planned']).toBeUndefined();
    expect(Object.keys(state.models)).toHaveLength(3);
  });

  it('completes with metrics when synthesis text exists', () => {
    const state = run(
      start,
      { type: 'delta', text: 'answer' },
      { type: 'complete', messageId: 'm9', latencyMs: 2500, firstTokenMs: 300 },
    );
    expect(state.phase).toBe('complete');
    expect(state.messageId).toBe('m9');
    expect(state.latencyMs).toBe(2500);
    expect(state.firstTokenMs).toBe(300);
  });
});

describe('stream reducer — failure semantics', () => {
  // Completing with no synthesis text is a failure wearing a success frame.
  // Rendering it as a successful empty answer would be the dishonest outcome.
  it('turns an empty completion into SYNTHESIS_FAILED rather than an empty answer', () => {
    const state = run(start, modelComplete('alpha-1'), {
      type: 'complete',
      messageId: 'm1',
      latencyMs: 900,
      firstTokenMs: null,
    });
    expect(state.phase).toBe('error');
    expect(state.error?.code).toBe('SYNTHESIS_FAILED');
    expect(state.text).toBe('');
  });

  it('retains partial text when an error arrives mid-stream', () => {
    const state = run(
      start,
      { type: 'delta', text: 'half an answer' },
      { type: 'error', code: 'TIMEOUT', message: 'timed out', partial: true, requestId: 'r1' },
    );
    expect(state.phase).toBe('error');
    expect(state.text).toBe('half an answer');
    expect(state.error?.partial).toBe(true);
  });

  it('retains partial text on cancellation', () => {
    const state = run(
      start,
      { type: 'delta', text: 'partial' },
      { type: 'cancelled', messageId: 'm1', latencyMs: 700 },
    );
    expect(state.phase).toBe('cancelled');
    expect(state.text).toBe('partial');
    expect(state.latencyMs).toBe(700);
  });

  it('treats a local abort as cancellation without a server frame', () => {
    const streaming = run(start, { type: 'delta', text: 'partial' });
    const state = reduce(streaming, { kind: 'abort' });
    expect(state.phase).toBe('cancelled');
    expect(state.text).toBe('partial');
  });

  it('ignores an abort that arrives after completion', () => {
    const done = run(start, { type: 'delta', text: 'a' }, {
      type: 'complete',
      messageId: 'm1',
      latencyMs: 10,
      firstTokenMs: 1,
    });
    expect(reduce(done, { kind: 'abort' })).toBe(done);
  });

  it('ignores an abort from idle', () => {
    expect(reduce(initialStreamState, { kind: 'abort' })).toBe(initialStreamState);
  });
});

describe('stream reducer — illegal and out-of-order transitions', () => {
  const terminal: Array<[string, StreamState]> = [
    [
      'complete',
      run(start, { type: 'delta', text: 'a' }, {
        type: 'complete',
        messageId: 'm1',
        latencyMs: 1,
        firstTokenMs: 1,
      }),
    ],
    [
      'error',
      run(start, {
        type: 'error',
        code: 'INTERNAL',
        message: 'boom',
        partial: false,
        requestId: 'r',
      }),
    ],
    ['cancelled', run(start, { type: 'cancelled', messageId: 'm1', latencyMs: 1 })],
  ];

  for (const [name, state] of terminal) {
    it(`drops further events once ${name}`, () => {
      for (const event of ALL_EVENTS) {
        if (event.type === 'start') continue; // start is a legitimate restart
        const next = reduce(state, { kind: 'event', event });
        expect(next.phase, `${event.type} after ${name}`).toBe(state.phase);
        expect(next.text).toBe(state.text);
      }
    });
  }

  it('never throws for any (phase × event) pair', () => {
    const phases: StreamState[] = [
      initialStreamState,
      run(start),
      run(start, { type: 'synthesis_start', model: synth }),
      ...terminal.map(([, state]) => state),
    ];
    for (const state of phases) {
      for (const event of ALL_EVENTS) {
        expect(() => reduce(state, { kind: 'event', event })).not.toThrow();
      }
    }
  });

  it('drops model events for an unknown model id', () => {
    const state = run(start, modelComplete('ghost-9'));
    expect(state.models['ghost-9']).toBeUndefined();
  });

  it('takes the text when a delta precedes synthesis_start', () => {
    // Frame reordering must not drop the user's answer on the floor.
    const state = run(start, { type: 'delta', text: 'early' });
    expect(state.phase).toBe('synthesis');
    expect(state.text).toBe('early');
  });

  it('discards prior state when a new start arrives', () => {
    const state = run(
      start,
      { type: 'delta', text: 'old answer' },
      { ...start, conversationId: 'c2', messageId: 'm2' },
    );
    expect(state.text).toBe('');
    expect(state.conversationId).toBe('c2');
    expect(state.phase).toBe('models');
  });

  it('resets to the initial state', () => {
    const state = reduce(run(start, { type: 'delta', text: 'x' }), { kind: 'reset' });
    expect(state).toEqual(initialStreamState);
  });
});

describe('stream reducer — derived helpers', () => {
  it('orders slots by plan position, not object key order', () => {
    // Position identifies a model on the Provenance Rail, so this ordering is
    // load-bearing rather than cosmetic.
    const state = run(start, modelComplete('gamma-3'), modelComplete('alpha-1'));
    expect(orderedSlots(state).map((s) => s.model.modelId)).toEqual([
      'alpha-1',
      'beta-2',
      'gamma-3',
    ]);
  });

  it('omits planned models with no slot rather than emitting holes', () => {
    const state: StreamState = { ...run(start), models: {} };
    expect(orderedSlots(state)).toEqual([]);
  });

  it('reports streaming only for in-flight phases', () => {
    expect(isStreaming('models')).toBe(true);
    expect(isStreaming('synthesis')).toBe(true);
    expect(isStreaming('starting')).toBe(true);
    expect(isStreaming('complete')).toBe(false);
    expect(isStreaming('cancelled')).toBe(false);
    expect(isStreaming('error')).toBe(false);
    expect(isStreaming('idle')).toBe(false);
  });

  it('does not mutate the state it was given', () => {
    const before = run(start);
    const snapshot = structuredClone(before);
    reduce(before, { kind: 'event', event: modelComplete('alpha-1') });
    expect(before).toEqual(snapshot);
  });

  it('handles every action kind', () => {
    const kinds: StreamAction['kind'][] = ['event', 'reset', 'abort'];
    expect(kinds).toHaveLength(3);
  });
});
