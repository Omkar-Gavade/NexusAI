import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import type { Message } from '@nexusai/contracts';
import { render, screen, waitFor } from '@/test/render';
import { MessageList } from './message-list';

function message(overrides: Partial<Message> & { id: string }): Message {
  return {
    role: 'user',
    content: 'A question',
    status: 'complete',
    synthesisModel: null,
    responses: [],
    agreement: null,
    sources: [],
    metadata: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('MessageList', () => {
  it('shows a loading state without implying content that does not exist', () => {
    render(
      <MessageList
        messages={undefined}
        isPending
        isError={false}
        onRetry={vi.fn()}
        onRegenerate={vi.fn()}
      />,
    );
    expect(screen.getByText(/loading conversation/i)).toBeInTheDocument();
  });

  it('offers retry on failure and says what is still safe', async () => {
    const onRetry = vi.fn();
    render(
      <MessageList
        messages={undefined}
        isPending={false}
        isError
        onRetry={onRetry}
        onRegenerate={vi.fn()}
      />,
    );
    expect(screen.getByText(/couldn't be loaded/i)).toBeInTheDocument();
    expect(screen.getByText(/your messages are safe/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  // No placeholder rows: an empty conversation renders as empty.
  it('renders nothing at all for an empty history', () => {
    const { container } = render(
      <MessageList
        messages={[]}
        isPending={false}
        isError={false}
        onRetry={vi.fn()}
        onRegenerate={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders persisted turns in order', async () => {
    render(
      <MessageList
        messages={[
          message({ id: 'm1', role: 'user', content: 'What is a saga?' }),
          message({
            id: 'm2',
            role: 'assistant',
            content: 'A saga is a sequence of local transactions.',
            metadata: { latencyMs: 1800, firstTokenMs: 300, inputTokens: 10, outputTokens: 40 },
          }),
        ]}
        isPending={false}
        isError={false}
        onRetry={vi.fn()}
        onRegenerate={vi.fn()}
      />,
    );
    expect(screen.getByText('What is a saga?')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/a saga is a sequence/i)).toBeInTheDocument(),
    );
  });

  // A row persisted mid-generation is read back as failed, never as in-flight.
  it('presents an interrupted stored message as interrupted, not as streaming', async () => {
    render(
      <MessageList
        messages={[
          message({
            id: 'm1',
            role: 'assistant',
            content: 'partial text',
            status: 'failed_partial',
          }),
        ]}
        isPending={false}
        isError={false}
        onRetry={vi.fn()}
        onRegenerate={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('partial text')).toBeInTheDocument());
    expect(screen.getByText(/this response was interrupted/i)).toBeInTheDocument();
  });
});
