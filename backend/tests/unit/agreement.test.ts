import { describe, expect, it } from 'vitest';
import { computeAgreement, parseVerdicts } from '../../src/domain/orchestration/agreement.ts';
import { VERDICT_CLOSE, VERDICT_OPEN } from '../../src/domain/synthesis/prompt.ts';
import { deriveTitle } from '../../src/domain/orchestration/orchestrator.ts';

describe('parseVerdicts', () => {
  it('extracts stances and strips the block from the prose', () => {
    const raw = `${VERDICT_OPEN}\nalpha: concurs\nbeta: diverges\n${VERDICT_CLOSE}\nThe answer.`;
    const parsed = parseVerdicts(raw);

    expect(parsed.parsed).toBe(true);
    expect(parsed.stances).toEqual({ alpha: 'concurs', beta: 'diverges' });
    // The verdict block is machine notation, never part of what is read.
    expect(parsed.remainder).toBe('The answer.');
    expect(parsed.remainder).not.toContain(VERDICT_OPEN);
  });

  it('tolerates whitespace and mixed casing in ids', () => {
    const raw = `${VERDICT_OPEN}\n  test-alpha :  concurs \n${VERDICT_CLOSE}\nText`;
    expect(parseVerdicts(raw).stances).toEqual({ 'test-alpha': 'concurs' });
  });

  it('ignores lines that are not a verdict', () => {
    const raw = `${VERDICT_OPEN}\nalpha: concurs\nnonsense\nbeta: maybe\n${VERDICT_CLOSE}\nText`;
    expect(parseVerdicts(raw).stances).toEqual({ alpha: 'concurs' });
  });

  // A stance is rendered on the provenance rail as fact. Guessing one when the
  // synthesiser did not classify would put a fabricated claim on screen.
  it('classifies nothing when the block is absent', () => {
    const parsed = parseVerdicts('Just an answer with no verdicts.');
    expect(parsed.parsed).toBe(false);
    expect(parsed.stances).toEqual({});
    expect(parsed.remainder).toBe('Just an answer with no verdicts.');
  });

  it('classifies nothing when the block never closes', () => {
    const parsed = parseVerdicts(`${VERDICT_OPEN}\nalpha: concurs\nstill going`);
    expect(parsed.parsed).toBe(false);
    expect(parsed.stances).toEqual({});
  });
});

describe('computeAgreement', () => {
  it('counts only models that actually responded', () => {
    // The frontend renders "THREE OF FOUR RESPONDED" straight from these.
    // Reporting the requested count here would be a visible lie.
    const agreement = computeAgreement([
      { modelId: 'a', responded: true, stance: 'concurs' },
      { modelId: 'b', responded: true, stance: 'concurs' },
      { modelId: 'c', responded: true, stance: 'diverges' },
      { modelId: 'd', responded: false, stance: 'unknown' },
    ]);
    expect(agreement).toEqual({ requested: 4, responded: 3, concur: 2, diverge: 1 });
  });

  it('never counts a failed model as agreeing', () => {
    const agreement = computeAgreement([
      { modelId: 'a', responded: false, stance: 'concurs' },
      { modelId: 'b', responded: true, stance: 'concurs' },
    ]);
    expect(agreement.responded).toBe(1);
    expect(agreement.concur).toBe(1);
  });

  it('leaves concur and diverge below responded when nothing was classified', () => {
    const agreement = computeAgreement([
      { modelId: 'a', responded: true, stance: 'unknown' },
      { modelId: 'b', responded: true, stance: 'unknown' },
    ]);
    expect(agreement).toEqual({ requested: 2, responded: 2, concur: 0, diverge: 0 });
  });

  it('reports zero responded when every model failed', () => {
    const agreement = computeAgreement([
      { modelId: 'a', responded: false, stance: 'unknown' },
      { modelId: 'b', responded: false, stance: 'unknown' },
    ]);
    expect(agreement).toEqual({ requested: 2, responded: 0, concur: 0, diverge: 0 });
  });
});

describe('deriveTitle', () => {
  it('uses the message when it is short enough', () => {
    expect(deriveTitle('How do sagas work?')).toBe('How do sagas work?');
  });

  it('collapses whitespace', () => {
    expect(deriveTitle('  How   do\nsagas work? ')).toBe('How do sagas work?');
  });

  it('truncates at a word boundary when one is far enough in', () => {
    const title = deriveTitle('word '.repeat(20));
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.endsWith('word')).toBe(true);
  });

  // Cutting at a space only 20 characters in would produce a title shorter than
  // it needs to be, so a boundary that early is ignored.
  it('ignores a word boundary that would make the title too short', () => {
    const title = deriveTitle('a'.repeat(20) + ' ' + 'b'.repeat(80));
    expect(title).toHaveLength(60);
    expect(title.startsWith('a'.repeat(20))).toBe(true);
  });

  it('hard-cuts when there is no usable boundary', () => {
    expect(deriveTitle('x'.repeat(200))).toHaveLength(60);
  });

  it('falls back rather than producing an empty title', () => {
    expect(deriveTitle('   ')).toBe('New conversation');
  });
});
