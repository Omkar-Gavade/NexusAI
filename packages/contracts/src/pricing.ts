import { z } from 'zod';

export const ModelPricing = z.object({
  modelId: z.string(),
  upstreamModel: z.string(),
  inputUsdPerMillion: z.number().positive(),
  outputUsdPerMillion: z.number().positive(),
  currency: z.literal('USD'),
  source: z.string(),
  asOf: z.string(),
});
export type ModelPricing = z.infer<typeof ModelPricing>;

export interface CostEstimate {
  readonly estimatedCostUsd: number | null;
  readonly currency: 'USD';
  readonly source: string | null;
  readonly upstreamModel: string | null;
}

/**
 * Per-1M-token standard API list rates in USD, each checked against the
 * provider's own pricing page on the `asOf` date.
 *
 * Kept strictly separate from provider billing records; used solely to compute
 * clearly-labelled per-response cost estimates when the provider reported
 * token counts. A model without an entry here reports its cost as `null`
 * ("Unknown") rather than a fabricated figure — which is deliberately the case
 * for the two models below whose current price could not be pinned down:
 *
 * - `mistral-large` → `mistral-medium-latest`. Mistral does not document which
 *   version the alias resolves to, and its pricing page (October 2026) lists
 *   only Mistral Medium 3.5, at $1.50 in / $7.50 out — nearly four times the
 *   $0.40 / $2.00 previously recorded here. Re-add once the model is pinned
 *   to an explicit version whose price is published.
 * - `deepseek-chat` → `deepseek-v4-flash`, a legacy alias now served by
 *   DeepSeek-V4.1-Flash and "billed at the Flash price", which DeepSeek sets
 *   by time of day (peak and off-peak). A single static rate would be wrong
 *   for part of every day.
 */
export const VERIFIED_MODEL_PRICING: Readonly<Record<string, ModelPricing>> = {
  'gpt-4o': {
    modelId: 'gpt-4o',
    upstreamModel: 'gpt-4o',
    inputUsdPerMillion: 2.5,
    outputUsdPerMillion: 10.0,
    currency: 'USD',
    source: 'OpenAI API pricing (GPT-4o, standard tier)',
    asOf: '2026-10',
  },
  'claude-sonnet': {
    modelId: 'claude-sonnet',
    upstreamModel: 'claude-sonnet-4-5',
    inputUsdPerMillion: 3.0,
    outputUsdPerMillion: 15.0,
    currency: 'USD',
    source: 'Anthropic API pricing (Claude Sonnet 4.5, base rates)',
    asOf: '2026-10',
  },
  'gemini-flash': {
    modelId: 'gemini-flash',
    upstreamModel: 'gemini-2.5-flash',
    // Paid tier, standard. Output includes thinking tokens, which the adapter
    // counts. The earlier 0.15 / 0.60 were preview-era rates and understated
    // output cost about fourfold.
    inputUsdPerMillion: 0.3,
    outputUsdPerMillion: 2.5,
    currency: 'USD',
    source: 'Google Gemini API pricing (gemini-2.5-flash, paid tier)',
    asOf: '2026-10',
  },
  'llama-groq': {
    modelId: 'llama-groq',
    upstreamModel: 'openai/gpt-oss-120b',
    inputUsdPerMillion: 0.15,
    outputUsdPerMillion: 0.6,
    currency: 'USD',
    source: 'GroqCloud model pricing (openai/gpt-oss-120b, on-demand)',
    asOf: '2026-10',
  },
};

export function getModelPricing(modelId: string): ModelPricing | null {
  return VERIFIED_MODEL_PRICING[modelId] ?? null;
}

/**
 * Computes an estimated cost in USD from provider-reported token counts.
 * Returns `estimatedCostUsd: null` when token counts are missing, non-positive,
 * or the model has no verified pricing entry — never returns a $0.00 claim.
 */
export function estimateModelCost(
  modelId: string,
  inputTokens: number | null | undefined,
  outputTokens: number | null | undefined,
): CostEstimate {
  const pricing = getModelPricing(modelId);
  if (!pricing) {
    return {
      estimatedCostUsd: null,
      currency: 'USD',
      source: null,
      upstreamModel: null,
    };
  }

  if (
    inputTokens === null ||
    inputTokens === undefined ||
    outputTokens === null ||
    outputTokens === undefined ||
    inputTokens < 0 ||
    outputTokens < 0 ||
    (inputTokens === 0 && outputTokens === 0)
  ) {
    return {
      estimatedCostUsd: null,
      currency: 'USD',
      source: pricing.source,
      upstreamModel: pricing.upstreamModel,
    };
  }

  const inputCost = (inputTokens / 1_000_000) * pricing.inputUsdPerMillion;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputUsdPerMillion;
  const total = Number((inputCost + outputCost).toFixed(8));

  return {
    estimatedCostUsd: total > 0 ? total : null,
    currency: 'USD',
    source: pricing.source,
    upstreamModel: pricing.upstreamModel,
  };
}
