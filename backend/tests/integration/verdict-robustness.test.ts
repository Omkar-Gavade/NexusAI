import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Agreement, ChatEvent, Stance } from '@nexusai/contracts';
import { createHarness, type Harness } from '../fixtures/harness.ts';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

const ANSWER = 'Four. Adding two and two gives four in ordinary arithmetic.';

/** Runs a turn whose synthesiser returns exactly `synthesis`. */
async function turnWith(synthesis: string) {
  h.testAdapter.reset();
  h.testAdapter.setDefault({ kind: 'succeed', text: synthesis });

  const { user } = await h.container.auth.register({
    email: `verdict-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
    password: 'a-sufficiently-long-password',
    displayName: 'Verdict',
  });

  const events: ChatEvent[] = [];
  for await (const event of h.container.orchestrator.run(
    {
      userId: user.id,
      conversationId: null,
      message: 'What is 2 + 2?',
      clientMessageId: `verdict-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      selection: { mode: 'auto', routing: 'balanced' },
      requestId: 'verdict-test',
    },
    new AbortController().signal,
  )) {
    events.push(event);
  }

  const agreementEvent = events.find((e) => e.type === 'agreement') as
    | { agreement: Agreement; stances: Record<string, Stance> }
    | undefined;

  return {
    agreement: agreementEvent?.agreement,
    stances: agreementEvent?.stances,
    answer: events
      .filter((e) => e.type === 'delta')
      .map((e) => (e as { text: string }).text)
      .join(''),
  };
}

const block = (body: string) => `<verdicts>\n${body}\n</verdicts>\n${ANSWER}`;

/**
 * Stance is rendered to the user as fact, so anything the synthesiser did not
 * clearly state has to degrade to `unknown` rather than be inferred. These
 * cover the shapes a real model actually produces when it half-follows a
 * format instruction.
 */
describe('verdict robustness', () => {
  it('applies a well-formed verdict', async () => {
    const { agreement, stances, answer } = await turnWith(
      block('test-alpha: concurs\ntest-beta: diverges\ntest-gamma: concurs'),
    );

    expect(stances).toEqual({
      'test-alpha': 'concurs',
      'test-beta': 'diverges',
      'test-gamma': 'concurs',
    });
    expect(agreement).toEqual({ requested: 3, responded: 3, concur: 2, diverge: 1 });
    expect(answer).not.toContain('<verdicts>');
  });

  it('treats an invalid stance value as unclassified rather than guessing', async () => {
    const { agreement, stances } = await turnWith(
      block('test-alpha: maybe\ntest-beta: agrees\ntest-gamma: concurs'),
    );

    expect(stances!['test-alpha']).toBe('unknown');
    expect(stances!['test-beta']).toBe('unknown');
    expect(stances!['test-gamma']).toBe('concurs');
    // Unclassified models are still counted as having responded.
    expect(agreement).toEqual({ requested: 3, responded: 3, concur: 1, diverge: 0 });
  });

  it('ignores a verdict for a model that was never in the plan', async () => {
    const { agreement, stances } = await turnWith(
      block('test-alpha: concurs\ngpt-4o: diverges\nnot-a-model: concurs'),
    );

    expect(Object.keys(stances!).sort()).toEqual(['test-alpha', 'test-beta', 'test-gamma']);
    expect(stances).not.toHaveProperty('gpt-4o');
    // A stance for a model that never ran must not inflate any count.
    expect(agreement).toEqual({ requested: 3, responded: 3, concur: 1, diverge: 0 });
  });

  it('resolves a duplicated model id deterministically instead of double counting', async () => {
    const { agreement, stances } = await turnWith(
      block('test-alpha: concurs\ntest-alpha: diverges\ntest-beta: concurs'),
    );

    expect(stances!['test-alpha']).toBe('diverges');
    expect(agreement!.concur + agreement!.diverge).toBeLessThanOrEqual(agreement!.responded);
    expect(agreement).toEqual({ requested: 3, responded: 3, concur: 1, diverge: 1 });
  });

  it('parses a block that is padded with commentary', async () => {
    const { stances, answer } = await turnWith(
      `<verdicts>\nHere are my verdicts:\ntest-alpha: concurs\n(the others were unclear)\ntest-beta: diverges\n</verdicts>\n${ANSWER}`,
    );

    expect(stances!['test-alpha']).toBe('concurs');
    expect(stances!['test-beta']).toBe('diverges');
    expect(stances!['test-gamma']).toBe('unknown');
    expect(answer).not.toContain('Here are my verdicts');
  });

  it('leaves every stance unknown when the block is omitted, and still answers', async () => {
    const { agreement, stances, answer } = await turnWith(ANSWER);

    expect(Object.values(stances!)).toEqual(['unknown', 'unknown', 'unknown']);
    expect(agreement).toEqual({ requested: 3, responded: 3, concur: 0, diverge: 0 });
    // A missing verdict must not cost the user the answer.
    expect(answer).toContain('Four.');
  });

  it('leaves every stance unknown when the block never closes', async () => {
    const { agreement, answer } = await turnWith(`<verdicts>\ntest-alpha: concurs\n${ANSWER}`);

    expect(agreement).toEqual({ requested: 3, responded: 3, concur: 0, diverge: 0 });
    expect(answer.length).toBeGreaterThan(0);
  });

  // The rail reads these numbers directly, so an inflated count is a visible lie.
  it('never reports more classified models than responded, whatever the block says', async () => {
    const { agreement } = await turnWith(
      block(
        [...Array(20)].map((_, i) => `test-alpha: concurs\nmodel-${i}: concurs`).join('\n'),
      ),
    );

    expect(agreement!.concur + agreement!.diverge).toBeLessThanOrEqual(agreement!.responded);
    expect(agreement!.responded).toBeLessThanOrEqual(agreement!.requested);
  });
});
