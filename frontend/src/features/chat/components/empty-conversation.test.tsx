import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/render';
import { EmptyConversation } from './empty-conversation';

describe('EmptyConversation', () => {
  it('invites a question without re-pitching the product', () => {
    const { container } = render(<EmptyConversation disabled={false} />);
    expect(screen.getByRole('heading', { name: /ask anything/i })).toBeInTheDocument();
    // The generic-chatbot opener, named so it cannot come back.
    expect(container.textContent ?? '').not.toMatch(/how can i help you today/i);
  });

  /*
   * Categories, not prompts, and not buttons. "Review some code" typed into
   * the composer and sent produces nothing useful, so a clickable one would be
   * an affordance that punishes whoever trusts it.
   */
  it('shows what the product is for without offering a fake affordance', () => {
    const { container } = render(<EmptyConversation disabled={false} />);

    expect(container.textContent).toMatch(/compare two technologies/i);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
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
