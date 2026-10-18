import { estimateModelCost, getModelPricing } from '@nexusai/contracts';
import {
  estimatedCost,
  nullableLatency,
  nullableTokens,
} from '@/lib/format';
import { ROSTER } from './model-roster';

const SAMPLE_TELEMETRY = [
  {
    modelId: 'gemini-flash',
    displayName: ROSTER[2].model,
    provider: ROSTER[2].provider,
    status: 'Completed',
    firstTokenMs: 310,
    latencyMs: 1120,
    inputTokens: 184,
    outputTokens: 320,
  },
  {
    modelId: 'llama-groq',
    displayName: ROSTER[5].model,
    provider: ROSTER[5].provider,
    status: 'Completed',
    firstTokenMs: 180,
    latencyMs: 640,
    inputTokens: 184,
    outputTokens: 295,
  },
  {
    modelId: 'mistral-large',
    displayName: ROSTER[3].model,
    provider: ROSTER[3].provider,
    status: 'Failed (rate limited)',
    firstTokenMs: null,
    latencyMs: 910,
    inputTokens: null,
    outputTokens: null,
  },
] as const;

/**
 * Transparent Performance & Cost breakdown for the homepage (#provenance).
 *
 * Demonstrates the exact telemetry NexusAI measures per response, using the
 * shared cost-estimation contract and formatters, while explicitly showing how
 * missing token counts or unverified rates render as "Not available" / "Unknown".
 */
export function PerformanceTransparency() {
  return (
    <div
      data-testid="homepage-performance-transparency"
      className="border border-line bg-canvas p-4 md:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-subtle pb-3">
        <span data-register="machine" className="text-note uppercase text-ink-2">
          MEASURED TELEMETRY & VERIFIED USD COST ESTIMATES
        </span>
        <span data-register="machine" className="text-note uppercase text-ink-3">
           ILLUSTRATIVE TURN METRICS
        </span>
      </div>

      <div className="mt-3 divide-y divide-line-subtle">
        {SAMPLE_TELEMETRY.map((row) => {
          const pricing = getModelPricing(row.modelId);
          const cost = estimateModelCost(row.modelId, row.inputTokens, row.outputTokens);

          return (
            <div
              key={row.modelId}
              className="grid gap-3 py-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)] md:items-center"
            >
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-ui font-[550] text-ink">{row.displayName}</span>
                  <span data-register="machine" className="text-note uppercase text-ink-3">
                    {row.provider}
                  </span>
                </div>
                <span className="mt-0.5 block text-micro text-ink-3">
                  {pricing
                    ? `${pricing.source} ($${pricing.inputUsdPerMillion}/1M in · $${pricing.outputUsdPerMillion}/1M out USD)`
                    : 'Pricing source: Unknown'}
                </span>
              </div>

              <dl
                data-register="machine"
                className="grid grid-cols-2 gap-2 text-note sm:grid-cols-5"
              >
                <div>
                  <dt className="text-ink-3">STATUS</dt>
                  <dd className="mt-0.5 text-ink-2">{row.status.toUpperCase()}</dd>
                </div>
                <div>
                  <dt className="text-ink-3">FIRST TOKEN</dt>
                  <dd className="mt-0.5 text-ink">{nullableLatency(row.firstTokenMs)}</dd>
                </div>
                <div>
                  <dt className="text-ink-3">LATENCY</dt>
                  <dd className="mt-0.5 text-ink">{nullableLatency(row.latencyMs)}</dd>
                </div>
                <div>
                  <dt className="text-ink-3">TOKENS (IN/OUT)</dt>
                  <dd className="mt-0.5 text-ink">
                    {nullableTokens(row.inputTokens)} / {nullableTokens(row.outputTokens)}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-3">EST. COST</dt>
                  <dd className="mt-0.5 text-ink">{estimatedCost(cost.estimatedCostUsd)}</dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>

      <p className="mt-3 border-t border-line-subtle pt-3 text-micro text-ink-3">
        Latency is measured from dispatch to first token and completion. Token counts come from
        provider usage metadata when reported. Costs are labeled estimates derived from verified
        USD list rates and kept separate from provider billing records; missing telemetry is
        always reported as Not available or Unknown.
      </p>
    </div>
  );
}
