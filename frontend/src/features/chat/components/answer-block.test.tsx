import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@/test/render';
import { slot } from '@/test/fixtures';
import type { AnswerView } from '../answer-view';
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
