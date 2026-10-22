import { useState } from 'react';
import clsx from 'clsx';
import { Check, Copy, CornerDownRight, RotateCcw } from 'lucide-react';
import { getModelPricing } from '@nexusai/contracts';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { copy } from '@/lib/clipboard';
import { estimatedCost, latency, nullableTokens } from '@/lib/format';
import { toast } from '@/stores/toast-store';
import type { ModelSlot } from '../stream-reducer';
import { LazyMarkdown as Markdown } from './markdown-lazy';
import { ModelMark } from './model-mark';

/**
 * Short, neutral words for why a model contributed nothing.
 *
 * The provider's own message never reaches the client — the server sends a
 * fixed string and an error code — and even the code is not shown raw: `429`
 * and `RESOURCE_EXHAUSTED` are operator concerns, and printing them in a
 * transcript makes a handled condition look like a crash.
 */
export function shortfall(slot: Pick<ModelSlot, 'errorCode'>): string {
  switch (slot.errorCode) {
    case 'RATE_LIMITED':
      return 'rate limited';
    case 'TIMEOUT':
      return 'timed out';
    case 'MODEL_NOT_CONFIGURED':
      return 'not configured';
    case 'AUTH_ERROR':
      return 'unavailable';
    case 'CONTENT_POLICY':
      return 'declined';
    case 'CANCELLED':
      return 'stopped';
    default:
      return 'unavailable';
  }
}

/**
 * One model's own answer.
 *
 * In the Arena it is a column: a header that says who and how it went, the
 * answer, and a footer of measurements and actions. The three parts are rows
 * of a parent subgrid (`arena`), so headers, bodies and footers line up across
 * columns no matter how long each answer is — the comparison is read across,
 * and ragged footers make that harder than it needs to be.
 *
 * In a synthesised turn's COMPARISON list it is the same object, stacked.
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
  retryDisabledReason = null,
}: {
  slot: ModelSlot;
  index: number;
  onRetry: (modelId: string) => void;
  selected?: boolean;
  onSelect?: ((modelId: string) => void) | undefined;
  onFollowUp?: ((modelId: string, displayName: string) => void) | undefined;
  arenaMode?: boolean;
  retrying?: boolean;
  /** Set while a retry cannot run yet; shown as the reason. */
  retryDisabledReason?: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const diverges = slot.stance === 'diverges';
  const pricing = getModelPricing(slot.model.modelId);
  const running = slot.phase === 'queued' || slot.phase === 'running';
  const failed = slot.phase === 'failed';
  const hasText = slot.text.trim().length > 0;
  const hasCompleteText = slot.phase === 'complete' && hasText;

  const onCopyText = async () => {
    if (!(await copy(slot.text))) {
      toast.error("Couldn't copy — the clipboard is unavailable in this context.");
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const status = running
    ? hasText
      ? 'writing'
      : 'waiting'
    : failed
      ? shortfall(slot)
      : slot.outcome === 'empty'
        ? 'empty'
        : null;

  return (
    <article
      data-testid={`model-panel-${slot.model.modelId}`}
      aria-label={`${slot.model.displayName} response`}
      aria-busy={running || undefined}
      className={clsx(
        'relative overflow-hidden rounded-card border bg-raised shadow-float transition-[border-color,background-color] duration-(--duration-quick) ease-out',
        arenaMode
          ? 'row-span-3 grid grid-rows-subgrid gap-0 motion-safe:animate-[nx-panel-in_200ms_var(--ease-out)]'
          : 'flex flex-col',
        selected
          ? 'border-accent/60 bg-[color-mix(in_oklab,var(--surface-selected)_55%,var(--surface-raised))] motion-safe:animate-[nx-select_420ms_var(--ease-out)]'
          : failed
            ? 'border-line border-dashed'
            : 'border-line',
        // Echoes the rail's notch: a diverging model is marked structurally.
        diverges && !selected && 'border-l-2 border-l-line-strong',
      )}
    >
      {selected && (
        <span aria-hidden="true" className="absolute inset-x-0 -top-px h-0.5 bg-accent" />
      )}

      <header className="flex min-h-10 items-center gap-2 border-b border-line-subtle px-3 py-2">
        {arenaMode ? (
          <span
            data-register="machine"
            aria-hidden="true"
            className={clsx(
              'grid size-4.5 shrink-0 place-items-center rounded-mark border text-[10px] leading-none',
              selected ? 'border-accent bg-accent text-ink-inv' : 'border-line-strong text-ink-2',
            )}
          >
            {index + 1}
          </span>
        ) : (
          <ModelMark index={index} />
        )}
        <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <h4 className="truncate text-ui font-[550] text-ink">{slot.model.displayName}</h4>
          <span data-register="machine" className="truncate text-note uppercase text-ink-3">
            {slot.model.provider}
          </span>
        </div>

        {selected && (
          // An icon in the header, because the column is narrow and the
          // model's name matters more; the footer button carries the words.
          <span className="shrink-0 text-accent" title="Preferred answer">
            <Check size={13} aria-hidden="true" />
            <span className="sr-only">Preferred answer</span>
          </span>
        )}

        <span data-register="machine" className="shrink-0 text-meta text-ink-3">
          {status ? (
            <span className={clsx('inline-flex items-center gap-1.5', failed && 'text-warn')}>
              {running && (
                <span
                  aria-hidden="true"
                  className="block size-1.5 bg-accent motion-safe:animate-[live-step_1.6s_step-end_infinite]"
                />
              )}
              {status}
            </span>
          ) : (
            <>
              {!arenaMode && slot.stance !== 'unknown' && <span>{slot.stance} · </span>}
              {slot.firstTokenMs != null && (
                <span title="Time to first token">{latency(slot.firstTokenMs)} · </span>
              )}
              {slot.latencyMs !== null && <span title="Total time">{latency(slot.latencyMs)}</span>}
            </>
          )}
        </span>
      </header>

      <div
        className={clsx(
          'min-w-0 px-3 py-3',
          // In the Arena a long answer scrolls inside its column, so the row of
          // panels stays a row and the next turn is not pushed a screen away.
          // Below md the panels stack and the page scrolls instead.
          arenaMode && 'md:max-h-[34rem] md:overflow-y-auto',
        )}
        {...(arenaMode
          ? { tabIndex: 0, role: 'region', 'aria-label': `${slot.model.displayName} answer` }
          : {})}
      >
        {running && !hasText ? (
          // Final height is reserved so arrival never jolts the grid.
          <div className="flex flex-col gap-2 pt-0.5" aria-label={`${slot.model.displayName} is generating`}>
            <Skeleton height={13} />
            <Skeleton height={13} width="90%" />
            <Skeleton height={13} width="72%" />
            <Skeleton height={13} width="40%" />
          </div>
        ) : !hasText && !failed ? (
          <p className="text-ui text-ink-3">This model returned an empty response.</p>
        ) : (
          <>
            {hasText && (
              <div className={clsx('[&_.md]:text-[14.5px] [&_.md]:leading-6', failed && 'opacity-70')}>
                <Markdown content={slot.text} />
                {slot.phase === 'running' && <span className="md-caret" aria-hidden="true" />}
              </div>
            )}

            {failed && (
              <div
                role="status"
                className={clsx('flex flex-col gap-2 text-micro text-ink-2', hasText && 'mt-3 border-t border-line-subtle pt-3')}
              >
                <p>
                  <span className="font-[550] text-ink">
                    {hasText
                      ? `${slot.model.displayName} stopped part-way (${shortfall(slot)}).`
                      : `${slot.model.displayName} didn't respond (${shortfall(slot)}).`}
                  </span>{' '}
                  {arenaMode
                    ? 'The other answers in this comparison are unaffected.'
                    : 'The synthesis is unaffected — it was built from the models that did respond.'}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {(arenaMode || hasCompleteText || failed) && (
        <footer className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-line-subtle px-3 py-2">
          <div
            data-register="machine"
            className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-note text-ink-3"
            title={pricing ? `Pricing source: ${pricing.source}` : 'No verified pricing on file'}
          >
            {hasCompleteText ? (
              <>
                <span>
                  {nullableTokens(slot.inputTokens)} in / {nullableTokens(slot.outputTokens)} out
                </span>
                <span aria-hidden="true">·</span>
                <span>{estimatedCost(slot.estimatedCostUsd)}</span>
              </>
            ) : (
              <span>{running ? 'measuring…' : '—'}</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {failed ? (
              <Button
                size="sm"
                variant="secondary"
                loading={retrying}
                disabled={retryDisabledReason !== null || retrying}
                title={retryDisabledReason ?? undefined}
                icon={<RotateCcw size={12} aria-hidden="true" />}
                onClick={() => onRetry(slot.model.modelId)}
              >
                Retry this model
              </Button>
            ) : hasCompleteText ? (
              <>
                {onSelect && (
                  <Button
                    size="sm"
                    variant={selected ? 'primary' : 'secondary'}
                    aria-pressed={selected}
                    icon={selected ? <Check size={12} aria-hidden="true" /> : undefined}
                    onClick={() => onSelect(slot.model.modelId)}
                  >
                    {selected ? 'Selected answer' : 'Select this answer'}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={copied ? 'Copied' : `Copy ${slot.model.displayName} answer`}
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
                    aria-label={`Continue with ${slot.model.displayName}'s answer`}
                    icon={<CornerDownRight size={12} aria-hidden="true" />}
                    onClick={() => onFollowUp(slot.model.modelId, slot.model.displayName)}
                  >
                    Continue
                  </Button>
                )}
              </>
            ) : null}
          </div>
        </footer>
      )}
    </article>
  );
}
