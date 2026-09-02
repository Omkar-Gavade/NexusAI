import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/render';
import { EmptyConversation } from './empty-conversation';

describe('EmptyConversation', () => {
  it('invites a question without re-pitching the product', () => {
    render(<EmptyConversation disabled={false} />);
    expect(screen.getByRole('heading', { name: /what can i help you with/i })).toBeInTheDocument();
  });

  /*
   * The composer offers a single model as well as synthesis. Copy that names
   * only "several models" is wrong for every question sent in the other mode,
   * and this is the first thing a new account reads.
   */
  it('describes both response modes, not only synthesis', () => {
    const { container } = render(<EmptyConversation disabled={false} />);
    const text = container.textContent ?? '';

    expect(text).toMatch(/one model to answer directly/i);
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
