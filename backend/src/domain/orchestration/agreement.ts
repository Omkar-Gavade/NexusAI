import type { Agreement, Stance } from '@nexusai/contracts';
import { VERDICT_CLOSE, VERDICT_OPEN } from '../synthesis/prompt.ts';

export interface VerdictParse {
  readonly stances: Record<string, Stance>;
  /** Text with the verdict block removed — what the user actually reads. */
  readonly remainder: string;
  readonly parsed: boolean;
}

/**
 * Extracts the synthesiser's stance verdicts.
 *
 * Anything it did not classify stays absent, and the caller defaults it to
 * `unknown`. A model that failed is never assigned a stance at all.
 */
export function parseVerdicts(raw: string): VerdictParse {
  const start = raw.indexOf(VERDICT_OPEN);
  const end = raw.indexOf(VERDICT_CLOSE);

  if (start === -1 || end === -1 || end < start) {
    return { stances: {}, remainder: raw.trimStart(), parsed: false };
  }

  const block = raw.slice(start + VERDICT_OPEN.length, end);
  const remainder = (raw.slice(0, start) + raw.slice(end + VERDICT_CLOSE.length)).trimStart();

  const stances: Record<string, Stance> = {};
  for (const line of block.split('\n')) {
    const match = /^\s*([A-Za-z0-9._-]+)\s*:\s*(concurs|diverges)\s*$/.exec(line);
    if (!match) continue;
    const [, modelId, stance] = match;
    if (modelId && stance) stances[modelId] = stance as Stance;
  }

  return { stances, remainder, parsed: Object.keys(stances).length > 0 };
}

export interface OutcomeSummary {
  readonly modelId: string;
  readonly responded: boolean;
  readonly stance: Stance;
}

/**
 * Agreement counted from what actually happened.
 *
 * `responded` is the number of models that returned usable text — never the
 * number requested. The frontend renders "THREE OF FOUR RESPONDED" straight
 * from these numbers, so an inflated count is a visible lie.
 */
export function computeAgreement(outcomes: readonly OutcomeSummary[]): Agreement {
  const responded = outcomes.filter((o) => o.responded);
  return {
    requested: outcomes.length,
    responded: responded.length,
    concur: responded.filter((o) => o.stance === 'concurs').length,
    diverge: responded.filter((o) => o.stance === 'diverges').length,
  };
}
