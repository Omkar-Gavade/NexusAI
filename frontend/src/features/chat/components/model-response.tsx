import clsx from 'clsx';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { latency } from '@/lib/format';
import type { ModelSlot } from '../stream-reducer';
import { LazyMarkdown as Markdown } from './markdown-lazy';
import { ModelMark } from './model-mark';

/**
 * One model's own answer — a card, and one of only six in the product, because
 * the grouping carries real meaning: this text has a different author from the
 * synthesis.
 *
 * Deliberately quieter than the synthesis: 13px on a raised surface against
 * 16px on the canvas. The evidence must not compete with the conclusion.
 */
export function ModelResponse({
  slot,
  index,
  onRetry,
}: {
  slot: ModelSlot;
  index: number;
  onRetry: (modelId: string) => void;
}) {
  const diverges = slot.stance === 'diverges';

  return (
    <article
      className={clsx(
        'border border-line bg-raised',
        // Echoes the rail's notch: a diverging model is marked structurally.
        diverges && 'border-l-2 border-l-line-strong',
      )}
    >
      <header className="flex h-8 items-center gap-2 border-b border-line px-3">
        <ModelMark index={index} />
        <h4 data-register="machine" className="truncate text-meta text-ink-2">
          {slot.model.modelId}
        </h4>
        <span className="flex-1" />
        <span data-register="machine" className="text-meta text-ink-3">
          {slot.stance === 'diverges' ? 'diverges' : slot.stance === 'concurs' ? 'concurs' : '—'}
          {slot.latencyMs !== null && ` · ${latency(slot.latencyMs)}`}
        </span>
      </header>

      <div className="p-3">
        {slot.phase === 'failed' ? (
          <Alert
            tone="warning"
            title={`${slot.model.displayName} didn't respond.`}
            action={
              <Button size="sm" onClick={() => onRetry(slot.model.modelId)}>
                Retry this model
              </Button>
            }
          >
            The synthesis is unaffected — it was built from the models that did respond.
          </Alert>
        ) : slot.phase !== 'complete' ? (
          // Final height is reserved so expanding comparison never grows the page.
          <div className="flex flex-col gap-2">
            <Skeleton height={14} />
            <Skeleton height={14} width="88%" />
            <Skeleton height={14} width="64%" />
          </div>
        ) : slot.text.length === 0 ? (
          <p className="text-ui text-ink-3">This model returned an empty response.</p>
        ) : (
          <div className="[&_.md]:text-ui [&_.md]:leading-5">
            <Markdown content={slot.text} />
          </div>
        )}
      </div>
    </article>
  );
}
