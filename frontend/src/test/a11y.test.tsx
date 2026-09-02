import { describe, expect, it } from 'vitest';
import axe from 'axe-core';
import userEvent from '@testing-library/user-event';
import { createTestQueryClient, render, screen } from '@/test/render';
import { catalog, model } from '@/test/fixtures';
import { HomePage } from '@/pages/home/home-page';
import { LoginPage } from '@/pages/auth/login-page';
import { RegisterPage } from '@/pages/auth/register-page';
import { NotFoundPage } from '@/pages/not-found-page';
import { Composer } from '@/features/chat/components/composer';
import { EmptyConversation } from '@/features/chat/components/empty-conversation';
import { ModelSelector } from '@/features/models/components/model-selector';
import { AnswerBlock } from '@/features/chat/components/answer-block';
import { SettingsDialog } from '@/features/settings/settings-dialog';
import { ChangePasswordForm } from '@/features/settings/change-password-form';
import { Header } from '@/components/layout/header';
import { sessionKey } from '@/features/auth/use-session';
import { fromMessage } from '@/features/chat/answer-view';
import type { Message } from '@nexusai/contracts';

/**
 * Structural accessibility, run in jsdom.
 *
 * Colour-contrast rules are disabled because jsdom performs no layout or
 * colour resolution, so axe cannot evaluate them and would report false
 * passes. Contrast is covered instead by `styles/tokens.test.ts`, which
 * computes every documented pair from the real token file.
 *
 * What this catches is the class of defect review misses: a missing form
 * label, a control with no accessible name, a broken heading order, a
 * duplicated landmark, an aria attribute pointing at nothing.
 */
const RULES: axe.RunOptions = {
  rules: {
    'color-contrast': { enabled: false },
    // Requires a full document; these render into a fragment.
    'page-has-heading-one': { enabled: false },
    region: { enabled: false },
  },
};

async function analyse(container: HTMLElement) {
  const results = await axe.run(container, RULES);
  return results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.length,
    help: v.help,
  }));
}

const assistantMessage: Message = {
  id: 'm1',
  role: 'assistant',
  content: 'A reconciled answer.',
  status: 'complete',
  synthesisModel: { modelId: 'alpha', provider: 'p', displayName: 'Alpha' },
  responses: [],
  agreement: { responded: 2, requested: 2, concur: 2, diverge: 0 },
  sources: [],
  metadata: { latencyMs: 1800, firstTokenMs: 200, inputTokens: 10, outputTokens: 30 },
  createdAt: new Date().toISOString(),
};

describe('accessibility — public pages', () => {
  it.each([
    ['home', <HomePage key="h" />],
    ['login', <LoginPage key="l" />],
    ['register', <RegisterPage key="r" />],
    ['not found', <NotFoundPage key="n" />],
  ])('%s has no structural violations', async (_name, element) => {
    const { container } = render(element, { client: createTestQueryClient() });
    expect(await analyse(container)).toEqual([]);
  });
});

describe('accessibility — product surfaces', () => {
  it('composer has no structural violations', async () => {
    const client = createTestQueryClient();
    client.setQueryData(['models'], catalog([model({ id: 'alpha' })]));
    const { container } = render(
      <Composer
        selection={{ mode: 'auto', routing: 'balanced' }}
        onSelectionChange={() => undefined}
        onSend={() => undefined}
        onStop={() => undefined}
        streaming={false}
        disabled={false}
      />,
      { client },
    );
    expect(await analyse(container)).toEqual([]);
  });

  it.each([
    ['ready', false],
    ['no models available', true],
  ])('the empty conversation (%s) has no structural violations', async (_name, disabled) => {
    const { container } = render(<EmptyConversation disabled={disabled} />, {
      client: createTestQueryClient(),
    });
    expect(await analyse(container)).toEqual([]);
  });

  /*
   * Open, not closed. A combobox that is fine collapsed can still expose a
   * listbox whose options are unlabelled or unreachable, and the collapsed
   * state is the one every other test happens to render.
   */
  it('the open model selector has no structural violations', async () => {
    const client = createTestQueryClient();
    client.setQueryData(['models'], catalog([model({ id: 'alpha' }), model({ id: 'beta' })]));
    const { container } = render(
      <ModelSelector
        selection={{ mode: 'auto', routing: 'balanced' }}
        onChange={() => undefined}
      />,
      { client },
    );

    // A raw `.click()` does not flush React state; the listbox never mounts
    // and the test would pass by analysing a collapsed control.
    await userEvent.click(screen.getByRole('combobox'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(await analyse(container)).toEqual([]);
  });

  it('answer surface has no structural violations', async () => {
    const { container } = render(
      <AnswerBlock
        view={fromMessage(assistantMessage)}
        onRegenerate={() => undefined}
        onRetryModel={() => undefined}
      />,
      { client: createTestQueryClient() },
    );
    expect(await analyse(container)).toEqual([]);
  });
});

/**
 * Surfaces added after the original sweep: the account/security settings, the
 * password form, and the global header controls.
 */
describe('accessibility — account and chrome', () => {
  const signedIn = () => {
    const client = createTestQueryClient();
    client.setQueryData(sessionKey, {
      user: {
        id: 'u',
        email: 'ada@example.test',
        displayName: 'Ada',
        preferences: { theme: 'dark' as const, routingMode: 'balanced' as const, pinnedModelId: null },
        createdAt: new Date().toISOString(),
      },
    });
    return client;
  };

  it('the password form has no structural violations', async () => {
    const { container } = render(<ChangePasswordForm />, { client: signedIn() });
    expect(await analyse(container)).toEqual([]);
  });

  it('every password field is labelled and typed correctly', async () => {
    // The specific failure a generic axe sweep can miss: a field that is
    // labelled but has the wrong autocomplete, which breaks password managers.
    const { getByLabelText } = render(<ChangePasswordForm />, { client: signedIn() });
    for (const [label, complete] of [
      [/current password/i, 'current-password'],
      [/^new password$/i, 'new-password'],
      [/confirm new password/i, 'new-password'],
    ] as const) {
      const field = getByLabelText(label);
      expect(field).toHaveAttribute('type', 'password');
      expect(field).toHaveAttribute('autocomplete', complete);
    }
  });

  it('the settings dialog has no structural violations', async () => {
    const { container } = render(<SettingsDialog open onClose={() => undefined} />, {
      client: signedIn(),
    });
    expect(await analyse(container)).toEqual([]);
  });

  it('the header controls have no structural violations', async () => {
    const { container } = render(<Header title="A conversation" conversationId="c1" />, {
      client: signedIn(),
    });
    expect(await analyse(container)).toEqual([]);
  });

  it('gives every icon-only header control an accessible name', async () => {
    // axe checks for a name; this checks the names are meaningful rather than
    // present, which is the failure mode of adding aria labels to satisfy a
    // linter.
    const { container } = render(<Header title="A conversation" conversationId="c1" />, {
      client: signedIn(),
    });
    const named = [...container.querySelectorAll('button')].map(
      (b) => b.getAttribute('aria-label') ?? b.textContent?.trim() ?? '',
    );
    expect(named.every((n) => n.length > 0)).toBe(true);
    expect(named.some((n) => /switch to (light|dark) theme/i.test(n))).toBe(true);
    expect(named.some((n) => /account/i.test(n))).toBe(true);
  });
});
