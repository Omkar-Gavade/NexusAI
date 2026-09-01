import type { Agreement } from '@nexusai/contracts';

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const time = new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' });
const date = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });

/** Latency reads as seconds above a second, milliseconds below. */
export function latency(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function tokens(count: number): string {
  if (count < 1000) return String(count);
  return `${(count / 1000).toFixed(count < 10_000 ? 1 : 0)}k`;
}

export function contextWindow(size: number): string {
  if (size >= 1_000_000) return `${Math.round(size / 1_000_000)}M`;
  if (size >= 1000) return `${Math.round(size / 1000)}k`;
  return String(size);
}

export function timestamp(iso: string): string {
  const then = new Date(iso);
  const elapsedDays = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (elapsedDays === 0) return time.format(then);
  if (elapsedDays < 7) return relative.format(-elapsedDays, 'day');
  return date.format(then);
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'] as const;

function word(n: number): string {
  return WORDS[n] ?? String(n);
}

/**
 * The agreement line, in words rather than a badge and as a count rather than a
 * percentage. A synthesised confidence percentage is a number nobody measured,
 * and inventing one would break the product's honesty rule.
 */
export function agreementSentence(agreement: Agreement): string {
  const { responded, requested, concur, diverge } = agreement;

  if (requested === 1) return 'ONE MODEL';

  const head =
    responded === requested
      ? `${word(responded).toUpperCase()} MODELS`
      : `${word(responded).toUpperCase()} OF ${word(requested).toUpperCase()} RESPONDED`;

  if (responded === 0) return head;

  // `concur + diverge` can be less than `responded`: a stance is only assigned
  // when the synthesis pass actually classified that model, and it stays
  // `unknown` otherwise. Reading `diverge === 0` as unanimity would announce
  // "ALL CONCUR" for a turn where nothing was judged at all.
  const classified = concur + diverge;
  if (classified === 0) return head;
  if (diverge === 0 && concur === responded) return `${head} · ALL CONCUR`;
  if (concur === 0 && diverge === responded) return `${head} · ALL DIVERGE`;

  // A zero side is omitted rather than printed as "ZERO DIVERGE".
  const parts = [head];
  if (concur > 0) {
    parts.push(`${word(concur).toUpperCase()} ${concur === 1 ? 'CONCURS' : 'CONCUR'}`);
  }
  if (diverge > 0) {
    parts.push(`${word(diverge).toUpperCase()} ${diverge === 1 ? 'DIVERGES' : 'DIVERGE'}`);
  }
  return parts.join(' · ');
}
