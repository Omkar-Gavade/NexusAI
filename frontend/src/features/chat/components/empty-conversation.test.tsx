import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, within } from '@/test/render';
import { EmptyConversation, STARTERS } from './empty-conversation';

describe('EmptyConversation', () => {
  it('invites a question without re-pitching the product', () => {
    const { container } = render(<EmptyConversation disabled={false} />);
    expect(screen.getByRole('heading', { name: /ask anything/i })).toBeInTheDocument();
    // The generic-chatbot opener, named so it cannot come back.
    expect(container.textContent ?? '').not.toMatch(/how can i help you today/i);
  });

  /*
   * A starter is a complete prompt, and picking one only fills the composer.
   * The earlier concern stands: a bare category like "Review some code", sent
   * as-is, wastes a request. So nothing is sent on the reader's behalf, and
   * every starter carries enough of a question to be worth editing.
   */
  it('offers starters that fill the composer with a complete prompt, never sending', async () => {
    const onPickPrompt = vi.fn();
    render(<EmptyConversation disabled={false} onPickPrompt={onPickPrompt} />);

    const starters = within(screen.getByRole('list', { name: /ways to start/i })).getAllByRole(
      'button',
    );
    expect(starters).toHaveLength(STARTERS.length);
    expect(screen.queryAllByRole('link')).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: /compare two technologies/i }));
    expect(onPickPrompt).toHaveBeenCalledTimes(1);
    expect(onPickPrompt).toHaveBeenCalledWith(STARTERS[0].prompt);

    for (const starter of STARTERS) expect(starter.prompt.trim().length).toBeGreaterThan(40);
  });

  it('offers no starters when nothing can answer', () => {
    render(<EmptyConversation disabled />);
    expect(screen.queryByRole('list', { name: /ways to start/i })).toBeNull();
  });

  /*
   * Attachments are `Planned` and there is no upload endpoint. An empty state
   * that suggests analysing a document is advertising a capability the product
   * does not have.
   */
  it('suggests nothing the product cannot do', () => {
    const { container } = render(<EmptyConversation disabled={false} />);
    expect(container.textContent ?? '').not.toMatch(/document|upload|attach|image|file/i);
  });

  /*
   * The composer offers a single model as well as synthesis. Copy that names
   * only "several models" is wrong for every question sent in the other mode,
   * and this is the first thing a new account reads.
   */
  it('describes both response modes, not only synthesis', () => {
    const { container } = render(<EmptyConversation disabled={false} />);
    const text = container.textContent ?? '';

    expect(text).toMatch(/choose a model for a direct answer/i);
    expect(text).toMatch(/synthesis/i);
    expect(text).toMatch(/several/i);
  });

  // Discovered by reading, not by sending a question and watching it fail.
  it('states when no model can answer', () => {
    render(<EmptyConversation disabled />);
    expect(screen.getByText(/no models are currently available/i)).toBeInTheDocument();
  });

  // Availability is per deployment and reported per model by the workspace.
  it('names no model or provider when unavailable', () => {
    const { container } = render(<EmptyConversation disabled />);
    const text = container.textContent ?? '';

    expect(text).not.toMatch(/openai|anthropic|gemini|mistral|deepseek|groq|gpt|claude/i);
  });
});
