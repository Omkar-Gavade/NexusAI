import { useState, type CSSProperties } from 'react';
import clsx from 'clsx';
import { Check, Columns2, Sparkles } from 'lucide-react';
import { estimateModelCost } from '@nexusai/contracts';
import { ModelMark } from '@/features/chat/components/model-mark';
import { estimatedCost, latency, nullableTokens } from '@/lib/format';
import { ROSTER } from './model-roster';
import { modelHue } from './spectrum';

const ARENA_ILLUSTRATION = [
  {
    modelId: 'gemini-flash',
    displayName: ROSTER[2].model,
    provider: ROSTER[2].provider,
    latencyMs: 920,
    inputTokens: 142,
    outputTokens: 210,
    text: 'Use an AbortController per model stream linked to a parent request signal. When the user cancels, abort the parent controller; when a single provider times out, abort only its child controller so sibling streams continue unaffected.',
  },
  {
    modelId: 'llama-groq',
    displayName: ROSTER[5].model,
    provider: ROSTER[5].provider,
    latencyMs: 540,
    inputTokens: 142,
    outputTokens: 195,
    text: 'Isolate each fetch stream in its own Promise.allSettled lane with a dedicated AbortSignal.any([userSignal, AbortSignal.timeout(ms)]). Never share a mutable reader lock across concurrent consumers.',
  },
  {
    modelId: 'gpt-4o',
    displayName: ROSTER[0].model,
    provider: ROSTER[0].provider,
    latencyMs: 1380,
    inputTokens: 142,
    outputTokens: 230,
    text: 'Compose a turn-level AbortController with per-adapter timeout controllers. Ensure reader.cancel() runs in a finally block before releasing the worker slot, preventing hanging streams from starving the pool.',
  },
] as const;

/**
 * Interactive Model Arena preview for the homepage (#product).
 *
 * Clearly labeled as illustrative data. Demonstrates independent concurrent
 * responses, selecting a preferred answer for follow-up context, and combining
 * answers on demand into a synthesized response.
 */
export function ModelArenaPreview() {
  const [selectedModelId, setSelectedModelId] = useState<string>('llama-groq');
  const [combined, setCombined] = useState<boolean>(false);

  const selectedModel =
    ARENA_ILLUSTRATION.find((m) => m.modelId === selectedModelId) ?? ARENA_ILLUSTRATION[0];

  return (
    <div
      data-testid="homepage-model-arena-preview"
      className="rounded-overlay border border-line bg-canvas/80 p-4 shadow-[var(--shadow-modal-value),var(--shadow-glow-value)] md:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-subtle pb-3.5">
        <div className="flex items-center gap-2">
          <Columns2 size={14} aria-hidden="true" className="text-accent" />
          <span data-register="machine" className="text-note uppercase text-ink">
            MODEL ARENA · 3 OF 3 MODELS RESPONDED
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span data-register="machine" className="text-note uppercase text-ink-3">
            ILLUSTRATIVE PREVIEW — NOT LIVE MODEL OUTPUT
          </span>
          <button
            type="button"
            aria-pressed={combined}
            onClick={() => setCombined((prev) => !prev)}
            className={clsx(
              'inline-flex h-(--control-sm) items-center gap-1.5 rounded-control border px-2.5 text-meta font-medium transition-colors duration-(--duration-instant)',
              combined
                ? 'border-accent bg-selected text-ink'
                : 'border-line-control bg-raised text-ink-2 hover:text-ink',
            )}
          >
            <Sparkles size={12} aria-hidden="true" className="text-accent" />
            <span>{combined ? 'Hide combined synthesis' : 'Combine answers'}</span>
          </button>
        </div>
      </div>

      {/* Side-by-side comparison panels */}
      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {ARENA_ILLUSTRATION.map((item, idx) => {
          const isSelected = selectedModelId === item.modelId;
          const cost = estimateModelCost(item.modelId, item.inputTokens, item.outputTokens);
          const hue = modelHue(item.modelId);

          return (
            <article
              key={item.modelId}
              style={{ '--card-rgb': hue.rgb } as CSSProperties}
              className={clsx(
                'relative flex flex-col justify-between overflow-hidden rounded-card border bg-raised transition-[border-color,box-shadow] duration-(--duration-quick)',
                isSelected
                  ? 'border-[rgb(var(--card-rgb)/0.75)] shadow-[0_0_0_3px_rgb(var(--card-rgb)/0.18),0_16px_40px_-18px_rgb(var(--card-rgb)/0.7)]'
                  : 'border-line',
              )}
            >
              {/* Each column in its model's colour. */}
              <span
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-[3px]"
                style={{ backgroundImage: hue.gradient }}
              />
              <div>
                <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <ModelMark index={idx} />
                    <span className="truncate text-ui font-[550] text-ink">
                      {item.displayName}
                    </span>
                    <span data-register="machine" className="text-note uppercase text-ink-3">
                      {item.provider}
                    </span>
                  </div>
                  <span data-register="machine" className="shrink-0 text-note text-ink-3">
                    {latency(item.latencyMs)}
                  </span>
                </header>

                <div className="p-3.5">
                  <p className="text-ui leading-relaxed text-ink-2">{item.text}</p>
                </div>
              </div>

              <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line-subtle px-3 py-2">
                <span data-register="machine" className="text-note text-ink-3">
                  {nullableTokens(item.inputTokens)} in / {nullableTokens(item.outputTokens)} out ·{' '}
                  {estimatedCost(cost.estimatedCostUsd)}
                </span>

                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setSelectedModelId(item.modelId)}
                  className={clsx(
                    'inline-flex h-(--control-sm) items-center gap-1.5 rounded-control border px-2.5 text-meta font-medium transition-colors duration-(--duration-instant)',
                    isSelected
                      ? 'border-accent bg-selected text-ink'
                      : 'border-line-control bg-canvas text-ink-2 hover:text-ink',
                  )}
                >
                  {isSelected && <Check size={12} aria-hidden="true" style={{ color: hue.solid }} />}
                  <span>{isSelected ? 'Selected answer' : 'Select this answer'}</span>
                </button>
              </footer>
            </article>
          );
        })}
      </div>

      {/* Selected answer context status */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line-subtle pt-3 text-meta text-ink-2">
        <span>
          Preferred answer:{' '}
          <strong className="font-[550] text-ink">{selectedModel.displayName}</strong> — follow-up
          questions retain this model’s response as context without mixing unselected outputs.
        </span>
      </div>

      {/* Optional combined synthesis preview */}
      {combined && (
        <div
          data-testid="homepage-arena-combined-synthesis"
          className="relative mt-4 overflow-hidden rounded-card border border-line bg-raised p-4 pl-5"
        >
          <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-spectrum" />
          <div className="flex items-center justify-between gap-2">
            <span data-register="machine" className="text-note uppercase text-accent">
              COMBINED SYNTHESIS · RECONCILED FROM 3 COMPLETED RESPONSES
            </span>
            <span data-register="machine" className="text-note uppercase text-ink-3">
              SYNTHESISED ON DEMAND
            </span>
          </div>
          <p className="mt-2 max-w-[68ch] text-body text-ink">
            All three models recommend isolating each stream with its own child signal composed via{' '}
            <code>AbortSignal.any</code> so an individual timeout cancels only that provider while
            a user-initiated stop aborts the parent controller, releasing the reader lock inside a{' '}
            <code>finally</code> block.
          </p>
        </div>
      )}
    </div>
  );
}
