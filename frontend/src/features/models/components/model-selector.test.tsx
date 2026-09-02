import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import type { ChatSelection } from '@nexusai/contracts';
import { render, screen, waitFor, createTestQueryClient } from '@/test/render';
import { catalog, model } from '@/test/fixtures';
import { ModelSelector } from './model-selector';

const selection: ChatSelection = { mode: 'auto', routing: 'balanced' };

function setup(models = [model({ id: 'alpha' }), model({ id: 'beta' })]) {
  const client = createTestQueryClient();
  client.setQueryData(['models'], catalog(models));
  const onChange = vi.fn();
  render(<ModelSelector selection={selection} onChange={onChange} />, { client });
  return { onChange };
}

describe('ModelSelector', () => {
  it('exposes combobox semantics on the trigger', () => {
    setup();
    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
  });

  it('opens on Enter and exposes a listbox', async () => {
    setup();
    screen.getByRole('combobox').focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'true');
  });

  it('opens on ArrowDown', async () => {
    setup();
    screen.getByRole('combobox').focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  // Focus stays on the combobox; aria-activedescendant tracks the current row.
  // This is what makes Escape and typeahead behave correctly.
  it('keeps DOM focus on the trigger while moving the active option', async () => {
    setup();
    const trigger = screen.getByRole('combobox');
    trigger.focus();
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{ArrowDown}');
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-activedescendant');
  });

  it('closes on Escape and restores focus to the trigger', async () => {
    setup();
    const trigger = screen.getByRole('combobox');
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('selects a model and reports it', async () => {
    const { onChange } = setup();
    screen.getByRole('combobox').focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.click(screen.getByRole('option', { name: /alpha/i }));
    expect(onChange).toHaveBeenCalledWith({ mode: 'manual', modelId: 'alpha' });
  });

  it('offers routing modes as well as individual models', async () => {
    const { onChange } = setup();
    screen.getByRole('combobox').focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.click(screen.getByRole('option', { name: /single model/i }));
    expect(onChange).toHaveBeenCalledWith({ mode: 'auto', routing: 'single' });
  });

  // Hiding an unavailable model makes the product feel smaller and leaves the
  // user unable to discover why it is missing.
  /*
   * The distinction the selector exists to offer: some choices reconcile
   * several models, one answers with a single model and skips synthesis. If
   * the list stops saying which is which, a reader has to send a question to
   * find out.
   */
  it('says how many models each response mode runs', async () => {
    setup();
    screen.getByRole('combobox').focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('option', { name: /single model.*one model/i })).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: /synthesis · 3 models.*three models · reconciled/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: /synthesis · 5 models.*five models · reconciled/i }),
    ).toBeInTheDocument();
  });

  it('says that choosing a named model skips synthesis', async () => {
    setup();
    screen.getByRole('combobox').focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByText(/no synthesis pass/i)).toBeInTheDocument();
  });

  it('lists an unavailable model, disabled, with its reason', async () => {
    const { onChange } = setup([
      model({ id: 'alpha' }),
      model({
        id: 'offline',
        availability: 'NOT_CONFIGURED',
        availabilityReason: 'No API key configured on this server.',
      }),
    ]);
    screen.getByRole('combobox').focus();
    await userEvent.keyboard('{Enter}');

    const option = screen.getByRole('option', { name: /offline/i });
    expect(option).toHaveAttribute('aria-disabled', 'true');
    expect(option).toHaveTextContent(/no api key configured/i);

    await userEvent.click(option);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('says so honestly when the catalog is empty', async () => {
    setup([]);
    screen.getByRole('combobox').focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByText(/no real models are currently available/i)).toBeInTheDocument();
  });

  it('marks the current selection as selected', async () => {
    setup();
    screen.getByRole('combobox').focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('option', { name: /synthesis · 3 models/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});
