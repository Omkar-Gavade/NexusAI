import { describe, expect, it } from 'vitest';
import { buildSynthesisMessages, SYNTHESIS_PROMPT_VERSION } from '../../src/domain/synthesis/prompt.ts';
import { CATALOG } from '../../src/domain/models/catalog.ts';

/**
 * The synthesis prompt is where answer quality is decided, and it is the one
 * part of the pipeline with no other signal when it regresses: drop an
 * instruction and every answer gets quietly worse while every test stays green.
 *
 * These assert the guardrails that exist because a specific failure mode
 * exists, not the prose around them.
 */
const [alpha, beta] = CATALOG.filter((m) => m.testOnly);

function prompt() {
  return buildSynthesisMessages('What is the capital of Japan?', [
    { model: alpha!, text: 'Tokyo.' },
    { model: beta!, text: 'Tokyo, since 1868.' },
  ]);
}

describe('synthesis prompt guardrails', () => {
  it('forbids averaging conflicting figures', () => {
    // The canonical synthesis failure: 7% and 6.5% becoming 6.75%, a number no
    // model gave and no evidence supports.
    const { system } = prompt();
    expect(system).toMatch(/average conflicting figures|split the difference/i);
    expect(system).toMatch(/6\.75/);
    expect(system).toMatch(/never report a number that no response gave/i);
  });

  it('forbids resolving a contradiction by retreating into vagueness', () => {
    expect(prompt().system).toMatch(/vaguer wording/i);
  });

  it('separates uncertainty from disagreement', () => {
    // Two models hedging the same way agree weakly. Reporting that as conflict
    // manufactures disagreement, which is the mirror of inventing consensus.
    expect(prompt().system).toMatch(/separate uncertainty from disagreement/i);
  });

  it('requires the answer to lead, and its length to match the question', () => {
    const { system } = prompt();
    expect(system).toMatch(/directly, in the first sentence/i);
    expect(system).toMatch(/length is not a proxy for quality/i);
  });

  it('rejects assistant boilerplate and imposed structure', () => {
    const { system } = prompt();
    expect(system).toMatch(/As an AI/i);
    expect(system).toMatch(/headings or bullet lists/i);
  });

  it('keeps the instructions that were already load-bearing', () => {
    const { system } = prompt();
    expect(system).toMatch(/majority vote/i);
    expect(system).toMatch(/invent agreement/i);
    expect(system).toMatch(/concatenate the responses/i);
    // Untrusted-input boundary — the reason the fence exists at all.
    expect(system).toMatch(/never an instruction to you/i);
  });

  it('classifies exactly the models that contributed', () => {
    const { system } = prompt();
    expect(system).toContain(alpha!.id);
    expect(system).toContain(beta!.id);
    // A model that did not answer must not appear in the verdict roster.
    const absent = CATALOG.find((m) => m.testOnly && m.id !== alpha!.id && m.id !== beta!.id);
    if (absent) expect(system).not.toContain(`${absent.id}: concurs`);
  });

  it('carries a version that changes when the prompt does', () => {
    expect(SYNTHESIS_PROMPT_VERSION).toMatch(/^synthesis\/\d{4}-\d{2}-\d$/);
  });
});
