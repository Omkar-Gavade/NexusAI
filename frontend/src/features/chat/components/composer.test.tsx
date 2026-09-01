import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import type { ChatSelection } from '@nexusai/contracts';
import { createTestQueryClient, render, screen } from '@/test/render';
import { catalog, model } from '@/test/fixtures';
import { Composer } from './composer';

const selection: ChatSelection = { mode: 'auto', routing: 'balanced' };

function setup(overrides: Partial<Parameters<typeof Composer>[0]> = {}) {
  const onSend = vi.fn();
  const onStop = vi.fn();
  const client = createTestQueryClient();
  // Seeded before render so the selector never flashes its loading state.
  client.setQueryData(['models'], catalog([model({ id: 'alpha' })]));
  render(
    <Composer
      selection={selection}
      onSelectionChange={vi.fn()}
      onSend={onSend}
      onStop={onStop}
      streaming={false}
      disabled={false}
      {...overrides}
    />,
    { client },
  );
  return { onSend, onStop };
}

describe('Composer', () => {
  it('sends on Enter', async () => {
    const { onSend } = setup();
    await userEvent.type(screen.getByLabelText(/ask anything/i), 'hello{Enter}');
    expect(onSend).toHaveBeenCalledWith('hello');
  });

  it('inserts a newline on Shift+Enter and does not send', async () => {
    const { onSend } = setup();
    const input = screen.getByLabelText(/ask anything/i);
    await userEvent.type(input, 'line one{Shift>}{Enter}{/Shift}line two');
    expect(onSend).not.toHaveBeenCalled();
    expect(input).toHaveValue('line one\nline two');
  });

  it('trims before sending and refuses whitespace-only input', async () => {
    const { onSend } = setup();
    await userEvent.type(screen.getByLabelText(/ask anything/i), '   {Enter}');
    expect(onSend).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/ask anything/i), '  spaced  {Enter}');
    expect(onSend).toHaveBeenCalledWith('spaced');
  });

  it('clears the field after a successful send', async () => {
    setup();
    const input = screen.getByLabelText(/ask anything/i);
    await userEvent.type(input, 'hello{Enter}');
    expect(input).toHaveValue('');
  });

  it('disables send until there is something to send', async () => {
    setup();
    expect(screen.getByRole('button', { name: /send message/i })).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/ask anything/i), 'x');
    expect(screen.getByRole('button', { name: /send message/i })).toBeEnabled();
  });

  // The composer must stay usable during generation: the user should be able to
  // compose the next message while the current one streams.
  it('swaps send for stop while streaming, keeping the field editable', async () => {
    const { onStop } = setup({ streaming: true });
    expect(screen.queryByRole('button', { name: /send message/i })).not.toBeInTheDocument();

    const input = screen.getByLabelText(/ask anything/i);
    expect(input).toBeEnabled();
    await userEvent.type(input, 'next question');
    expect(input).toHaveValue('next question');

    await userEvent.click(screen.getByRole('button', { name: /stop generating/i }));
    expect(onStop).toHaveBeenCalled();
  });

  it('stops generation on Escape', async () => {
    const { onStop } = setup({ streaming: true });
    await userEvent.type(screen.getByLabelText(/ask anything/i), '{Escape}');
    expect(onStop).toHaveBeenCalled();
  });

  // Escape is a common reflex. Losing a long prompt to it is unrecoverable.
  it('never clears typed text on Escape', async () => {
    setup();
    const input = screen.getByLabelText(/ask anything/i);
    await userEvent.type(input, 'a long prompt{Escape}');
    expect(input).toHaveValue('a long prompt');
  });

  it('explains itself when disabled instead of just going grey', () => {
    setup({ disabled: true, disabledReason: 'No real models are currently available.' });
    expect(screen.getByLabelText(/ask anything/i)).toBeDisabled();
    expect(screen.getByText('No real models are currently available.')).toBeInTheDocument();
  });

  it('does not send while disabled', async () => {
    const { onSend } = setup({ disabled: true });
    const input = screen.getByLabelText(/ask anything/i);
    await userEvent.type(input, 'hello{Enter}');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('labels the attachment control as unavailable rather than hiding it', () => {
    setup();
    const attach = screen.getByRole('button', { name: /attach a file/i });
    expect(attach).toBeDisabled();
    expect(attach).toHaveAccessibleName(/not available yet/i);
  });
});
