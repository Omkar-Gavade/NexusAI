/**
 * The marketing spectrum: one hue per idea, so colour on the page means
 * something — this card is routing, that one is the Arena — instead of one
 * accent repeated until it stops meaning anything.
 *
 * Model hues are positional (catalog order), not vendor colours: they tell
 * models apart in an illustration and claim nothing about a provider.
 */
export interface Hue {
  /** Solid hue for dots, bars and icon tiles. */
  readonly solid: string;
  /** Two-stop gradient for icon tiles and accents. */
  readonly gradient: string;
  /** rgb triplet, for tints and glows at any alpha. */
  readonly rgb: string;
}

const make = (from: string, to: string, rgb: string): Hue => ({
  solid: from,
  gradient: `linear-gradient(135deg, ${from}, ${to})`,
  rgb,
});

export const HUES = {
  indigo: make('#6366f1', '#8b5cf6', '99 102 241'),
  fuchsia: make('#d946ef', '#ec4899', '217 70 239'),
  violet: make('#8b5cf6', '#6366f1', '139 92 246'),
  cyan: make('#06b6d4', '#3b82f6', '6 182 212'),
  emerald: make('#10b981', '#06b6d4', '16 185 129'),
  amber: make('#f59e0b', '#f43f5e', '245 158 11'),
  rose: make('#f43f5e', '#d946ef', '244 63 94'),
  blue: make('#3b82f6', '#6366f1', '59 130 246'),
} as const satisfies Record<string, Hue>;

/** One hue per catalog model, in catalog order. */
export const MODEL_HUE: Readonly<Record<string, Hue>> = {
  'gpt-4o': HUES.emerald,
  'claude-sonnet': HUES.amber,
  'gemini-flash': HUES.blue,
  'mistral-large': HUES.rose,
  'deepseek-chat': HUES.indigo,
  'llama-groq': HUES.fuchsia,
};

export function modelHue(modelId: string): Hue {
  return MODEL_HUE[modelId] ?? HUES.violet;
}
