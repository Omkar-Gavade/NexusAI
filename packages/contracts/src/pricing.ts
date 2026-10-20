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
 * Verified per-1M-token standard API list rates in USD.
 * Kept strictly separate from provider billing records; used solely to compute
 * clearly-labeled per-response cost estimates when actual provider token counts
 * are reported. Test adapters and unverified models are excluded so their cost
 * reports as `null` ("Unknown") rather than a fabricated $0.00 claim.
 */
export const VERIFIED_MODEL_PRICING: Readonly<Record<string, ModelPricing>> = {
  'gpt-4o': {
    modelId: 'gpt-4o',
    upstreamModel: 'gpt-4o',
    inputUsdPerMillion: 2.5,
    outputUsdPerMillion: 10.0,
    currency: 'USD',
    source: 'OpenAI API Standard Pricing (GPT-4o)',
    asOf: '2025-05',
  },
  'claude-sonnet': {
    modelId: 'claude-sonnet',
    upstreamModel: 'claude-sonnet-4-5',
    inputUsdPerMillion: 3.0,
    outputUsdPerMillion: 15.0,
    currency: 'USD',
    source: 'Anthropic API Standard Pricing (claude-sonnet-4-5)',
    asOf: '2025-05',
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
  'mistral-large': {
    modelId: 'mistral-large',
    upstreamModel: 'mistral-medium-latest',
    inputUsdPerMillion: 0.4,
    outputUsdPerMillion: 2.0,
    currency: 'USD',
    source: 'Mistral AI La Plateforme Pricing (mistral-medium-latest)',
    asOf: '2025-05',
  },
  'deepseek-chat': {
    modelId: 'deepseek-chat',
    upstreamModel: 'deepseek-v4-flash',
    inputUsdPerMillion: 0.14,
    outputUsdPerMillion: 0.28,
    currency: 'USD',
    source: 'DeepSeek API Standard Pricing (deepseek-v4-flash)',
    asOf: '2025-05',
  },
  'llama-groq': {
    modelId: 'llama-groq',
    upstreamModel: 'openai/gpt-oss-120b',
    inputUsdPerMillion: 0.15,
    outputUsdPerMillion: 0.6,
    currency: 'USD',
    source: 'Groq Cloud On-Demand Pricing (openai/gpt-oss-120b)',
    asOf: '2025-05',
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
