import { describe, expect, it } from 'vitest';
import type { Agreement } from '@nexusai/contracts';
import { agreementSentence, contextWindow, latency, tokens } from './format';

const agreement = (partial: Partial<Agreement>): Agreement => ({
  responded: 4,
  requested: 4,
  concur: 3,
  diverge: 1,
  ...partial,
});

describe('latency', () => {
  it.each([
    [0, '0 ms'],
    [420, '420 ms'],
    [999, '999 ms'],
    [1000, '1.0 s'],
    [2140, '2.1 s'],
    [61_000, '61.0 s'],
  ])('formats %ims as %s', (ms, expected) => {
    expect(latency(ms)).toBe(expected);
  });
});

describe('tokens and contextWindow', () => {
  it.each([
    [0, '0'],
    [999, '999'],
    [1500, '1.5k'],
    [12_000, '12k'],
  ])('formats %i tokens as %s', (count, expected) => {
    expect(tokens(count)).toBe(expected);
  });

  it.each([
    [8192, '8k'],
    [200_000, '200k'],
    [1_048_576, '1M'],
  ])('formats a %i context window as %s', (size, expected) => {
    expect(contextWindow(size)).toBe(expected);
  });
});

describe('agreementSentence', () => {
  it('states a single model plainly, with no agreement language', () => {
    expect(agreementSentence(agreement({ requested: 1, responded: 1, concur: 1, diverge: 0 }))).toBe(
      'ONE MODEL',
    );
  });

  it('reports unanimity', () => {
    expect(agreementSentence(agreement({ concur: 4, diverge: 0 }))).toBe('FOUR MODELS · ALL CONCUR');
  });

  it('reports a split', () => {
    expect(agreementSentence(agreement({ concur: 3, diverge: 1 }))).toBe(
      'FOUR MODELS · THREE CONCUR · ONE DIVERGES',
    );
  });

  it('uses plural verbs correctly on both sides', () => {
    expect(agreementSentence(agreement({ concur: 2, diverge: 2 }))).toBe(
      'FOUR MODELS · TWO CONCUR · TWO DIVERGE',
    );
  });

  it('says how many responded when a model dropped out', () => {
    // Never implies four answers arrived when only three did.
    expect(
      agreementSentence(agreement({ requested: 4, responded: 3, concur: 3, diverge: 0 })),
    ).toBe('THREE OF FOUR RESPONDED · ALL CONCUR');
  });

  it('reports total disagreement', () => {
    expect(agreementSentence(agreement({ concur: 0, diverge: 4 }))).toBe(
      'FOUR MODELS · ALL DIVERGE',
    );
  });

  it('does not claim agreement when nothing responded', () => {
    expect(
      agreementSentence(agreement({ requested: 4, responded: 0, concur: 0, diverge: 0 })),
    ).toBe('ZERO OF FOUR RESPONDED');
  });

  // The backend only assigns a stance the synthesis pass actually judged.
  // Unclassified models must never be counted as agreement.
  it('claims no agreement when no stance was classified', () => {
    expect(agreementSentence(agreement({ responded: 3, requested: 3, concur: 0, diverge: 0 }))).toBe(
      'THREE MODELS',
    );
  });

  it('reports only what was classified when some stances are unknown', () => {
    expect(agreementSentence(agreement({ responded: 4, requested: 4, concur: 2, diverge: 1 }))).toBe(
      'FOUR MODELS · TWO CONCUR · ONE DIVERGES',
    );
  });

  it('does not claim unanimity when only some models were classified', () => {
    const sentence = agreementSentence(
      agreement({ responded: 4, requested: 4, concur: 2, diverge: 0 }),
    );
    expect(sentence).not.toMatch(/ALL CONCUR/);
    expect(sentence).toBe('FOUR MODELS · TWO CONCUR');
  });

  it('falls back to digits beyond the spelled-out range', () => {
    expect(
      agreementSentence(agreement({ requested: 12, responded: 12, concur: 12, diverge: 0 })),
    ).toContain('12');
  });
});
