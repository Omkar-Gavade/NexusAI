import { useState } from 'react';
import clsx from 'clsx';
import { Check, Copy, CornerDownRight } from 'lucide-react';
import { getModelPricing } from '@nexusai/contracts';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { copy } from '@/lib/clipboard';
import { estimatedCost, latency, nullableTokens } from '@/lib/format';
import { toast } from '@/stores/toast-store';
import type { ModelSlot } from '../stream-reducer';
import { LazyMarkdown as Markdown } from './markdown-lazy';
import { ModelMark } from './model-mark';

/**
 * One model's own answer — used both inside the expandable COMPARISON section
 * on a synthesised turn and as a primary side-by-side comparison panel in
 * Model Arena (`compare` mode).
 */
export function ModelResponse({
  slot,
  index,
  onRetry,
  selected = false,
  onSelect,
  onFollowUp,
  arenaMode = false,
  retrying = false,
}: {
  slot: ModelSlot;
  index: number;
  onRetry: (modelId: string) => void;
  selected?: boolean;
  onSelect?: ((modelId: string) => void) | undefined;
  onFollowUp?: ((modelId: string, displayName: string) => void) | undefined;
  arenaMode?: boolean;
  retrying?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const diverges = slot.stance === 'diverges';
  const pricing = getModelPricing(slot.model.modelId);
  const hasCompleteText = slot.phase === 'complete' && slot.text.trim().length > 0;

  const onCopyText = async () => {
    if (!(await copy(slot.text))) {
      toast.error("Couldn't copy — the clipboard is unavailable in this context.");
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <article
      data-testid={`model-panel-${slot.model.modelId}`}
      className={clsx(
        ' flex flex-col border bg-raised transition-colors duration-(--duration-instant)',
        selected ? 'border-accent bg-selected/30' : 'border-line',
        // Echoes the rail's notch: a diverging model is marked structurally.
        diverges && !selected && 'border-l-2 border-l-line-strong',
      )}
    >
      <header className="flex min-h-9 flex-wrap items-center gap-2 border-b border-line px-3 py-1.5">
        <ModelMark index={index} />
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate text-ui font-medium text-ink">{slot.model.displayName}</span>
          <h4 data-register="machine" className="truncate text-meta text-ink-3">
            {slot.model.modelId}
          </h4>
          <span data-register="machine" className="text-note uppercase text-ink-3">
            · {slot.model.provider}
          </span>
        </div>
        <span className="flex-1" />
        {selected && (
          <span
            data-register="machine"
            className="inline-flex items-center gap-1 rounded-xs bg-selected px-1.5 py-0.5 text-note uppercase text-accent"
          >
            <Check size={11} aria-hidden="true" />
            SELECTED
          </span>
        )}
        <span data-register="machine" className="text-meta text-ink-3">
          {slot.stance === 'diverges' ? 'diverges' : slot.stance === 'concurs' ? 'concurs' : '—'}
          {slot.latencyMs !== null && ` · ${latency(slot.latencyMs)}`}
        </span>
      </header>

      <div className="flex-1 p-3">
        {slot.phase === 'failed' ? (
          <Alert
            tone="warning"
            title={`${slot.model.displayName} didn't respond.`}
            action={
              <Button size="sm" loading={retrying} onClick={() => onRetry(slot.model.modelId)}>
                Retry this model
              </Button>
            }
          >
            {arenaMode
              ? 'Other selected models in this comparison are unaffected.'
              : 'The synthesis is unaffected — it was built from the models that did respond.'}
          </Alert>
        ) : slot.phase !== 'complete' && slot.text.length === 0 ? (
          // Final height is reserved so expanding comparison never grows the page.
          <div className="flex flex-col gap-2" aria-label={`${slot.model.displayName} is generating`}>
            <Skeleton height={14} />
            <Skeleton height={14} width="88%" />
            <Skeleton height={14} width="64%" />
          </div>
        ) : slot.text.length === 0 ? (
          <p className="text-ui text-ink-3">This model returned an empty response.</p>
        ) : (
          <div className="[&_.md]:text-ui [&_.md]:leading-5">
            <Markdown content={slot.text} />
            {slot.phase === 'running' && <span className="md-caret" aria-hidden="true" />}
          </div>
        )}
      </div>

      {hasCompleteText && (
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line-subtle px-3 py-2">
          <div
            data-register="machine"
            className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-note text-ink-3"
            title={pricing ? `Pricing source: ${pricing.source}` : 'No verified pricing on file'}
          >
            <span>
              TOKENS: {nullableTokens(slot.inputTokens)} IN / {nullableTokens(slot.outputTokens)} OUT
            </span>
            <span aria-hidden="true">·</span>
            <span>COST: {estimatedCost(slot.estimatedCostUsd)}</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {onSelect && (
              <Button
                size="sm"
                variant={selected ? 'primary' : 'secondary'}
                icon={selected ? <Check size={12} aria-hidden="true" /> : undefined}
                onClick={() => onSelect(slot.model.modelId)}
              >
                {selected ? 'Selected answer' : 'Select this answer'}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              icon={
                copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />
              }
              onClick={onCopyText}
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
            {onFollowUp && (
              <Button
                size="sm"
                variant="ghost"
                icon={<CornerDownRight size={12} aria-hidden="true" />}
                onClick={() => onFollowUp(slot.model.modelId, slot.model.displayName)}
              >
                Continue
              </Button>
            )}
          </div>
        </footer>
      )}
    </article>
  );
}
