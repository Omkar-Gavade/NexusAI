import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ModelSlot } from '../stream-reducer';
import { fromStream } from '../answer-view';
import { initialStreamState } from '../stream-reducer';
import { AnswerBlock } from './answer-block';

/**
 * The orchestration state a reader sees mid-turn.
 *
 * Covered here rather than in the browser because the deterministic test
 * adapter answers in about a millisecond per model — the whole turn settles in
 * ~250ms, so there is no reliable moment to photograph the working state. What
 * matters is provable exactly: the counts come from the real plan, the stage is
 * derived from the slots, and no provider vocabulary reaches the screen.
 */
const slot = (
  over: Partial<ModelSlot> & { modelId: string; displayName?: string },
): ModelSlot => ({
  model: {
    modelId: over.modelId,
    provider: 'p',
    displayName: over.displayName ?? over.modelId,
  },
  phase: 'running',
  text: '',
  outcome: null,
  stance: 'unknown',
  latencyMs: null,
  inputTokens: null,
  outputTokens: null,
  errorCode: null,
  errorMessage: null,
  ...over,
});

function renderTurn(slots: ModelSlot[], text = '') {
  const state = { ...initialStreamState, phase: 'models' as const, text };
  return render(
    <AnswerBlock
      view={fromStream(state, slots)}
      onRegenerate={() => undefined}
      onRetryModel={() => undefined}
    />,
  );
}

describe('orchestration status', () => {
  it('counts the real plan, not a fixed number', () => {
    renderTurn([
      slot({ modelId: 'gpt-4o', phase: 'complete', latencyMs: 1200 }),
      slot({ modelId: 'gemini-flash' }),
      slot({ modelId: 'mistral-large' }),
    ]);

    expect(screen.getByText(/3 models · 1 response · comparing/i)).toBeInTheDocument();
  });

  it('moves to synthesising once every model has settled', () => {
    renderTurn([
      slot({ modelId: 'gpt-4o', phase: 'complete', latencyMs: 900 }),
      slot({ modelId: 'gemini-flash', phase: 'failed', errorCode: 'RATE_LIMITED' }),
    ]);

    // A failed model counts as settled but not as a response.
    expect(screen.getByText(/2 models · 1 response · synthesising/i)).toBeInTheDocument();
  });

  it('names each model by its catalog display name, with real latency', () => {
    renderTurn([
      slot({ modelId: 'gpt-4o', displayName: 'GPT-4o', phase: 'complete', latencyMs: 1200 }),
      slot({ modelId: 'gemini-flash', displayName: 'Gemini 2.5 Flash' }),
    ]);

    // The reader sees the catalog name, never the internal id.
    expect(screen.getByText('GPT-4o')).toBeInTheDocument();
    expect(screen.getByText('1.2 s')).toBeInTheDocument();
    expect(screen.getByText('Gemini 2.5 Flash')).toBeInTheDocument();
    expect(screen.getByText('working')).toBeInTheDocument();
    expect(screen.queryByText('gemini-flash')).toBeNull();
  });

  it('describes a dropped model in plain words, never provider vocabulary', () => {
    renderTurn([
      slot({ modelId: 'gpt-4o', phase: 'running' }),
      slot({ modelId: 'gemini-flash', phase: 'failed', errorCode: 'RATE_LIMITED' }),
      slot({ modelId: 'mistral-large', phase: 'failed', errorCode: 'TIMEOUT' }),
    ]);

    expect(screen.getByText('rate limited')).toBeInTheDocument();
    expect(screen.getByText('timed out')).toBeInTheDocument();

    const text = document.body.textContent ?? '';
    for (const leak of [/\b429\b/, /RESOURCE_EXHAUSTED/i, /RATE_LIMITED/, /Error:/, /\bstack\b/i]) {
      expect(text).not.toMatch(leak);
    }
  });

  it('falls back to a neutral word for an unmapped failure', () => {
    renderTurn([slot({ modelId: 'gpt-4o', phase: 'failed', errorCode: 'PROVIDER_ERROR' })]);
    expect(screen.getByText('unavailable')).toBeInTheDocument();
  });

  it('gives way to the answer as soon as real text arrives', () => {
    // Instrumentation is third in the hierarchy: once there is something to
    // read, the status line is gone rather than sitting above the prose.
    renderTurn([slot({ modelId: 'gpt-4o', phase: 'complete', latencyMs: 900 })], 'The answer.');
    expect(screen.queryByText(/· comparing|· synthesising/i)).toBeNull();
  });
});

describe('synthesised vs direct provenance', () => {
  const done = (id: string): ModelSlot =>
    slot({ modelId: id, phase: 'complete', latencyMs: 900, stance: 'concurs' });

  function renderFinished(slots: ModelSlot[], synthesisModel: ModelSlot['model'] | null) {
    const view = {
      text: 'The final answer.',
      slots,
      agreement: { requested: slots.length, responded: slots.length, concur: slots.length, diverge: 0 },
      sources: [],
      synthesisModel,
      latencyMs: 1200,
      streaming: false,
      cancelled: false,
      error: null,
    };
    return render(
      <AnswerBlock view={view} onRegenerate={() => undefined} onRetryModel={() => undefined} />,
    );
  }

  it('says SYNTHESISED when a synthesis pass wrote the answer', () => {
    const slots = [done('gpt-4o'), done('gemini-flash')];
    renderFinished(slots, slots[0]!.model);
    expect(screen.getByText(/SYNTHESISED/i)).toBeInTheDocument();
    expect(screen.queryByText(/ANSWERED DIRECTLY/i)).toBeNull();
  });

  it('says ANSWERED DIRECTLY when no synthesis happened', () => {
    // Never label a direct fallback as synthesised: it would claim a
    // reconciliation that never took place.
    renderFinished([done('llama-groq')], null);
    expect(screen.getByText(/ANSWERED DIRECTLY/i)).toBeInTheDocument();
    expect(screen.queryByText(/\bSYNTHESISED\b/i)).toBeNull();
  });
});

describe('message actions', () => {
  it('names the actions rather than relying on icons alone', () => {
    const slots = [slot({ modelId: 'gpt-4o', phase: 'complete', latencyMs: 900 })];
    render(
      <AnswerBlock
        view={{
          text: 'Done.',
          slots,
          agreement: { requested: 1, responded: 1, concur: 0, diverge: 0 },
          sources: [],
          synthesisModel: null,
          latencyMs: 900,
          streaming: false,
          cancelled: false,
          error: null,
        }}
        onRegenerate={() => undefined}
        onRetryModel={() => undefined}
      />,
    );

    // Discoverable by name, so a keyboard or screen-reader user is not left
    // guessing at two unlabelled glyphs beside a metadata line.
    expect(screen.getByRole('button', { name: /^copy$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /regenerate/i })).toBeInTheDocument();
  });

  it('presents the assistant turn as an article', () => {
    render(
      <AnswerBlock
        view={{
          text: 'Done.',
          slots: [],
          agreement: null,
          sources: [],
          synthesisModel: null,
          latencyMs: null,
          streaming: false,
          cancelled: false,
          error: null,
        }}
        onRegenerate={() => undefined}
        onRetryModel={() => undefined}
      />,
    );
    expect(screen.getByRole('article')).toBeInTheDocument();
  });
});

describe('model identity in provenance', () => {
  const view = (over: Partial<Parameters<typeof AnswerBlock>[0]['view']> = {}) => ({
    text: 'The capital of Japan is Tokyo.',
    slots: [] as ModelSlot[],
    agreement: null,
    sources: [],
    synthesisModel: null,
    latencyMs: 800,
    streaming: false,
    cancelled: false,
    error: null,
    ...over,
  });

  const named = (id: string, displayName: string): ModelSlot =>
    slot({ modelId: id, displayName, phase: 'complete', latencyMs: 800 });

  function show(v: ReturnType<typeof view>) {
    return render(
      <AnswerBlock view={v} onRegenerate={() => undefined} onRetryModel={() => undefined} />,
    );
  }

  it('credits the chosen model by display name when one was selected', () => {
    show(
      view({
        slots: [named('gpt-4o', 'GPT-4o')],
        agreement: { requested: 1, responded: 1, concur: 0, diverge: 0 },
      }),
    );
    expect(screen.getByText(/GPT-4o · ANSWERED DIRECTLY/i)).toBeInTheDocument();
    // The catalog name, never the internal id.
    expect(document.body.textContent).not.toMatch(/\bgpt-4o\b(?!·)/);
  });

  it('says one of several answered, not the model name, on a degraded turn', () => {
    // Three requested, one survived. Crediting that model as though it were
    // chosen would hide that this was a fallback.
    show(
      view({
        slots: [named('llama-groq', 'GPT-OSS 120B')],
        agreement: { requested: 3, responded: 1, concur: 0, diverge: 0 },
      }),
    );
    expect(screen.getByText(/ANSWERED DIRECTLY/i)).toBeInTheDocument();
    expect(screen.queryByText(/GPT-OSS 120B ·/)).toBeNull();
  });

  it('names the model while it is still answering', () => {
    show(
      view({
        text: '',
        streaming: true,
        slots: [slot({ modelId: 'gpt-4o', displayName: 'GPT-4o' })],
        agreement: { requested: 1, responded: 0, concur: 0, diverge: 0 },
      }),
    );
    expect(screen.getByText(/GPT-4o · ANSWERING/i)).toBeInTheDocument();
  });

  it('attributes a failed explicit selection to that model and offers retry', () => {
    show(
      view({
        text: '',
        slots: [named('gpt-4o', 'GPT-4o')],
        agreement: { requested: 1, responded: 0, concur: 0, diverge: 0 },
        error: { code: 'PROVIDER_ERROR', message: 'That model is unavailable.', partial: false },
      }),
    );
    expect(screen.getByText(/GPT-4o couldn't complete this response/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    // Never implies another model answered instead.
    expect(document.body.textContent).not.toMatch(/instead|switched|another model/i);
  });

  it('does not name a single model for a synthesised turn', () => {
    show(
      view({
        slots: [named('gpt-4o', 'GPT-4o'), named('gemini-flash', 'Gemini 2.5 Flash')],
        agreement: { requested: 2, responded: 2, concur: 2, diverge: 0 },
        synthesisModel: { modelId: 'gpt-4o', provider: 'openai', displayName: 'GPT-4o' },
      }),
    );
    expect(screen.getByText(/SYNTHESISED/i)).toBeInTheDocument();
    expect(screen.queryByText(/ANSWERED DIRECTLY/i)).toBeNull();
  });
});
