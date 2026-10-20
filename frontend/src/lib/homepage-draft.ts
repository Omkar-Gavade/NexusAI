import { z } from 'zod';
import { ARENA_MAX_MODELS, ARENA_MIN_MODELS, isRoutable, type Model } from '@nexusai/contracts';
import { HOMEPAGE_DRAFT_STORAGE_KEY } from './routes';

/**
 * The prompt a visitor wrote on the homepage, carried across sign-up into the
 * workspace. One schema for both ends: the writer and the reader previously
 * agreed only by convention, and the reader never looked for the Arena models
 * the visitor had picked — it substituted the first three it found.
 */
const HomepageDraft = z.object({
  prompt: z.string().max(32_000).default(''),
  mode: z.enum(['standard', 'compare']).default('standard'),
  modelIds: z.array(z.string().min(1).max(80)).max(ARENA_MAX_MODELS).optional(),
});
export type HomepageDraft = z.infer<typeof HomepageDraft>;

export function writeHomepageDraft(draft: HomepageDraft): void {
  try {
    sessionStorage.setItem(HOMEPAGE_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Storage can be unavailable (private mode, quota). The draft is a
    // convenience; signing up still works without it.
  }
}

/** Reads and clears the draft. Anything malformed is discarded, not trusted. */
export function takeHomepageDraft(): HomepageDraft | null {
  try {
    const raw = sessionStorage.getItem(HOMEPAGE_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(HOMEPAGE_DRAFT_STORAGE_KEY);
    const parsed = HomepageDraft.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * The Arena line-up to open with: the visitor's own picks where this deployment
 * can actually run them, topped up from what is routable, and never more than
 * the Arena allows. Returns null when fewer than two models could run at all.
 */
export function arenaModelsFor(requested: readonly string[] | undefined, catalog: readonly Model[]) {
  const routable = catalog.filter((m) => isRoutable(m.availability)).map((m) => m.id);
  const kept = [...new Set(requested ?? [])]
    .filter((id) => routable.includes(id))
    .slice(0, ARENA_MAX_MODELS);
  if (kept.length >= ARENA_MIN_MODELS) return kept;

  // Too few of the picks can run here: top up to a three-model default.
  const topUp = routable.filter((id) => !kept.includes(id));
  const chosen = [...kept, ...topUp].slice(0, Math.min(3, ARENA_MAX_MODELS));
  return chosen.length >= ARENA_MIN_MODELS ? chosen : null;
}
