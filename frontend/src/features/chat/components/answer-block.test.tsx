import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { errorMessages, type Message } from '@nexusai/contracts';
import { render, screen, waitFor } from '@/test/render';
import { slot } from '@/test/fixtures';
import { fromMessage, type AnswerView } from '../answer-view';
import { AnswerBlock } from './answer-block';

function view(overrides: Partial<AnswerView> = {}): AnswerView {
  return {
    text: 'The synthesised answer.',
    slots: [slot({ id: 'alpha' }), slot({ id: 'beta', stance: 'diverges' })],
    agreement: { responded: 2, requested: 2, concur: 1, diverge: 1 },
    sources: [],
    synthesisModel: { modelId: 'alpha', provider: 'test', displayName: 'Alpha' },
    latencyMs: 2100,
    streaming: false,
    cancelled: false,
    error: null,
    ...overrides,
  };
}

function setup(overrides: Partial<AnswerView> = {}) {
  const onRegenerate = vi.fn();
  render(
    <AnswerBlock view={view(overrides)} onRegenerate={onRegenerate} onRetryModel={vi.fn()} />,
  );
  return { onRegenerate };
}

describe('AnswerBlock', () => {
  it('renders the synthesis as the primary content', async () => {
    setup();
    await waitFor(() => expect(screen.getByText('The synthesised answer.')).toBeInTheDocument());
  });

  it('states agreement in words rather than a percentage nobody measured', () => {
    setup();
    expect(screen.getByText(/TWO MODELS · ONE CONCURS · ONE DIVERGES/)).toBeInTheDocument();
  });

  it('reports measured latency', () => {
    setup();
    expect(screen.getByText(/2\.1 S/)).toBeInTheDocument();
  });

  // Comparison is one gesture away, never in the way.
  it('keeps comparison collapsed until asked', async () => {
    setup();
    const toggle = screen.getByRole('button', { name: /model-by-model comparison/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('says WORKING while orchestrating, before any answer text exists', () => {
    setup({ streaming: true, text: '', latencyMs: null, agreement: null });
    expect(screen.getByText(/WORKING/)).toBeInTheDocument();
    expect(screen.queryByText(/ANSWERING/)).toBeNull();
  });

  it('offers no comparison for a single-model answer', () => {
    setup({ slots: [slot({ id: 'alpha' })] });
    expect(screen.queryByRole('button', { name: /model-by-model comparison/i })).not.toBeInTheDocument();
  });

  it('hides comparison and actions while streaming', () => {
    setup({ streaming: true, latencyMs: null, agreement: null });
    expect(screen.queryByRole('button', { name: /model-by-model comparison/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copy response/i })).not.toBeInTheDocument();
    // Text is already arriving, so the state is ANSWERING rather than the
    // pre-answer WORKING. The two are mutually exclusive: WORKING means the
    // orchestration is running with nothing to read yet.
    expect(screen.getByText(/ANSWERING/)).toBeInTheDocument();
    expect(screen.queryByText(/WORKING/)).toBeNull();
  });

  it('marks the region busy while streaming', () => {
    const { container } = render(
      <AnswerBlock
        view={view({ streaming: true })}
        onRegenerate={vi.fn()}
        onRetryModel={vi.fn()}
      />,
    );
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it('says it was stopped when the user cancelled', () => {
    setup({ cancelled: true });
    expect(screen.getByText(/STOPPED/)).toBeInTheDocument();
  });

  // The reader already saw the partial text. Throwing it away is destructive.
  it('keeps partial text when a generation failed mid-stream', async () => {
    setup({
      text: 'half an answer',
      error: { code: 'TIMEOUT', message: 'timed out', partial: true },
    });
    await waitFor(() => expect(screen.getByText('half an answer')).toBeInTheDocument());
    expect(screen.getByText(/this response was interrupted/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /regenerate/i })).toBeInTheDocument();
  });

  it('shows a single recovery path when nothing was generated', async () => {
    const { onRegenerate } = setup({
      text: '',
      error: { code: 'INTERNAL', message: 'boom', partial: false },
    });
    expect(screen.getByText(/couldn't be generated/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRegenerate).toHaveBeenCalled();
  });

  it('discloses sources with a real count when they exist', async () => {
    setup({
      sources: [
        {
          index: 1,
          title: 'A cited page',
          url: 'https://example.com/a',
          domain: 'example.com',
          snippet: 'Relevant passage.',
          retrievedAt: new Date().toISOString(),
        },
      ],
    });
    const toggle = screen.getByRole('button', { name: /sources for this answer/i });
    await userEvent.click(toggle);
    expect(screen.getByRole('link', { name: /a cited page/i })).toHaveAttribute(
      'rel',
      'noopener noreferrer nofollow',
    );
  });

  it('shows no sources affordance when the backend returned none', () => {
    setup({ sources: [] });
    expect(screen.queryByRole('button', { name: /sources for this answer/i })).not.toBeInTheDocument();
  });
});

describe('fromMessage — persisted failure reconstruction', () => {
  const baseMessage: Message = {
    id: 'm1',
    role: 'assistant',
    content: '',
    status: 'failed',
    synthesisModel: null,
    responses: [],
    agreement: null,
    sources: [],
    metadata: null,
    createdAt: new Date().toISOString(),
  };

  it('uses the model’s own error code when a single planned model failed', () => {
    const derived = fromMessage({
      ...baseMessage,
      responses: [
        {
          model: { modelId: 'claude-sonnet', provider: 'anthropic', displayName: 'Claude Sonnet 4.5' },
          text: '',
          outcome: 'failed',
          stance: 'unknown',
          latencyMs: 120,
          inputTokens: null,
          outputTokens: null,
          errorCode: 'TIMEOUT',
        },
      ],
    });
    expect(derived.error).toEqual({
      code: 'TIMEOUT',
      message: errorMessages.TIMEOUT,
      partial: false,
    });
  });

  it('reports SYNTHESIS_FAILED when at least one model completed but the turn failed', () => {
    const derived = fromMessage({
      ...baseMessage,
      status: 'failed_partial',
      content: 'partial synthesis',
      responses: [
        {
          model: { modelId: 'gemini-flash', provider: 'google', displayName: 'Gemini 2.5 Flash' },
          text: 'full model text',
          outcome: 'complete',
          stance: 'unknown',
          latencyMs: 200,
          inputTokens: 10,
          outputTokens: 20,
          errorCode: null,
        },
        {
          model: { modelId: 'llama-groq', provider: 'groq', displayName: 'GPT-OSS 120B' },
          text: 'other text',
          outcome: 'complete',
          stance: 'unknown',
          latencyMs: 180,
          inputTokens: 10,
          outputTokens: 18,
          errorCode: null,
        },
      ],
    });
    expect(derived.error).toEqual({
      code: 'SYNTHESIS_FAILED',
      message: errorMessages.SYNTHESIS_FAILED,
      partial: true,
    });
  });

  it('reports PROVIDER_UNAVAILABLE when multiple models all failed', () => {
    const derived = fromMessage({
      ...baseMessage,
      responses: [
        {
          model: { modelId: 'gemini-flash', provider: 'google', displayName: 'Gemini 2.5 Flash' },
          text: '',
          outcome: 'failed',
          stance: 'unknown',
          latencyMs: 50,
          inputTokens: null,
          outputTokens: null,
          errorCode: 'RATE_LIMITED',
        },
        {
          model: { modelId: 'llama-groq', provider: 'groq', displayName: 'GPT-OSS 120B' },
          text: '',
          outcome: 'failed',
          stance: 'unknown',
          latencyMs: 60,
          inputTokens: null,
          outputTokens: null,
          errorCode: 'PROVIDER_UNAVAILABLE',
        },
      ],
    });
    expect(derived.error).toEqual({
      code: 'PROVIDER_UNAVAILABLE',
      message: errorMessages.PROVIDER_UNAVAILABLE,
      partial: false,
    });
  });
});

describe('AnswerBlock — Smart Router, Model Arena & Performance/Cost', () => {
  it('displays the Smart Router decision banner and manual override state', () => {
    setup({
      routingDecision: {
        taskCategory: 'coding',
        taskLabel: 'coding & technical task',
        selectedModelIds: ['llama-groq'],
        reason: 'Auto-selected GPT-OSS 120B — suitable for this coding & technical task.',
        overridden: false,
      },
    });
    expect(screen.getByTestId('turn-routing-reason')).toHaveTextContent(
      /Auto-selected GPT-OSS 120B — suitable for this coding & technical task/i,
    );
  });

  it('renders Model Arena comparison panels, allows selecting a preferred answer, and supports Combine answers', async () => {
    const onSelectAnswer = vi.fn();
    const onCombineAnswers = vi.fn();

    render(
      <AnswerBlock
        view={view({
          mode: 'compare',
          text: '',
          synthesisModel: null,
          selectedModelId: null,
          slots: [
            slot({
              id: 'gemini-flash',
              model: { modelId: 'gemini-flash', provider: 'google', displayName: 'Gemini 2.5 Flash' },
              text: 'Gemini answer text',
            }),
            slot({
              id: 'llama-groq',
              model: { modelId: 'llama-groq', provider: 'groq', displayName: 'GPT-OSS 120B' },
              text: 'Groq answer text',
            }),
          ],
          agreement: { requested: 2, responded: 2, concur: 0, diverge: 0 },
        })}
        onRegenerate={vi.fn()}
        onRetryModel={vi.fn()}
        onSelectAnswer={onSelectAnswer}
        onCombineAnswers={onCombineAnswers}
      />,
    );

    expect(screen.getByTestId('arena-comparison-grid')).toBeInTheDocument();

    const selectButtons = screen.getAllByRole('button', { name: /select this answer/i });
    expect(selectButtons).toHaveLength(2);
    await userEvent.click(selectButtons[1]!);
    expect(onSelectAnswer).toHaveBeenCalledWith('llama-groq');

    await userEvent.click(screen.getByRole('button', { name: /combine answers/i }));
    expect(onCombineAnswers).toHaveBeenCalled();
  });

  it('displays measured telemetry, verified USD cost estimates, and Not available / Unknown for missing data', async () => {
    setup({
      firstTokenMs: null,
      latencyMs: 1450,
      inputTokens: null,
      outputTokens: null,
      estimatedCostUsd: null,
      slots: [
        slot({
          id: 'gemini-flash',
          model: { modelId: 'gemini-flash', provider: 'google', displayName: 'Gemini 2.5 Flash' },
          latencyMs: 1450,
          inputTokens: null,
          outputTokens: null,
          estimatedCostUsd: null,
        }),
      ],
    });

    const perfToggle = screen.getByRole('button', { name: /performance and cost details/i });
    await userEvent.click(perfToggle);

    const panel = screen.getByTestId('performance-cost-panel');
    expect(panel).toHaveTextContent(/Not available/);
    expect(panel).toHaveTextContent(/Unknown/);
    expect(panel).toHaveTextContent(/Google AI Developer Standard Pricing/);
  });
});
