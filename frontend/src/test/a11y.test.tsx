import { describe, expect, it } from 'vitest';
import axe from 'axe-core';
import { createTestQueryClient, render } from '@/test/render';
import { catalog, model } from '@/test/fixtures';
import { HomePage } from '@/pages/home/home-page';
import { LoginPage } from '@/pages/auth/login-page';
import { RegisterPage } from '@/pages/auth/register-page';
import { NotFoundPage } from '@/pages/not-found-page';
import { Composer } from '@/features/chat/components/composer';
import { AnswerBlock } from '@/features/chat/components/answer-block';
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
