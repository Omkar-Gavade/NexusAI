import { useId, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Check, ChevronRight, Copy, RotateCcw } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Rule } from '@/components/ui/rule';
import { Tooltip } from '@/components/ui/tooltip';
import { copy } from '@/lib/clipboard';
import { agreementSentence, latency } from '@/lib/format';
import { toast } from '@/stores/toast-store';
import type { AnswerView } from '../answer-view';
import { LazyMarkdown as Markdown } from './markdown-lazy';
import { ModelResponse } from './model-response';
import { ProvenanceRail } from './provenance-rail';
import { SourceList } from './source-list';

/**
 * One assistant turn, live or from history.
 *
 * The synthesis has NO container — no card, no border, no fill, no avatar. It
 * is typeset text on the canvas across a 68ch measure, the way an article is.
 * Wrapping generated prose in a bordered box halves the readable width and
 * makes long answers feel like receipts.
 */
export function AnswerBlock({
  view,
  onRegenerate,
  onRetryModel,
}: {
  view: AnswerView;
  onRegenerate: () => void;
  onRetryModel: (modelId: string) => void;
}) {
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const comparisonId = useId();
  const sourcesId = useId();

  const { slots, streaming } = view;
  const multiModel = slots.length > 1;
  const fatal = view.error !== null && view.text.length === 0;

  const onCopy = async () => {
    if (!(await copy(view.text))) {
      toast.error("Couldn't copy — the clipboard is unavailable in this context.");
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const revealModel = (modelId: string) => {
    setComparisonOpen(true);
    // Deferred so the region has expanded before the target exists in layout.
    requestAnimationFrame(() => {
      document.getElementById(`${comparisonId}-${modelId}`)?.scrollIntoView({ block: 'nearest' });
    });
  };

  return (
    <div className="group/turn flex flex-col gap-3" aria-busy={streaming || undefined}>
      <div className="flex gap-(--rail-gutter) max-lg:flex-col max-lg:gap-3">
        {slots.length > 0 && (
          <div className="max-lg:order-2 lg:self-stretch">
            <ProvenanceRail slots={slots} live={streaming} onSelect={revealModel} />
          </div>
        )}

        <div className="min-w-0 flex-1 max-lg:order-1">
          {fatal ? (
            <Alert
              title="The response couldn't be generated."
              action={
                <Button
                  size="sm"
                  icon={<RotateCcw size={13} aria-hidden="true" />}
                  onClick={onRegenerate}
                >
                  Try again
                </Button>
              }
            >
              {view.error?.message}
            </Alert>
          ) : (
            <>
              <Markdown content={view.text} />
              {streaming && <span className="md-caret" aria-hidden="true" />}
            </>
          )}

          {/* A partial answer is retained, never discarded — the reader already
              saw it, and throwing it away is destructive. */}
          {view.error && view.text.length > 0 && (
            <div className="mt-4">
              <Alert
                title="This response was interrupted."
                action={
                  <Button
                    size="sm"
                    icon={<RotateCcw size={13} aria-hidden="true" />}
                    onClick={onRegenerate}
                  >
                    Regenerate
                  </Button>
                }
              >
                What arrived before the interruption is kept above.
              </Alert>
            </div>
          )}
        </div>
      </div>

      {!fatal && <Metadata view={view} copied={copied} onCopy={onCopy} onRegenerate={onRegenerate} />}

      {!streaming && (multiModel || view.sources.length > 0) && (
        <div className="flex flex-col gap-1 lg:pl-[calc(var(--rail-width)+var(--rail-gutter))]">
          {view.sources.length > 0 && (
            <Disclosure
              id={sourcesId}
              action={`sources for this answer (${view.sources.length})`}
              label={`SOURCES · ${view.sources.length}`}
              open={sourcesOpen}
              onToggle={() => setSourcesOpen((open) => !open)}
            >
              <SourceList sources={view.sources} idPrefix={sourcesId} />
            </Disclosure>
          )}

          {multiModel && (
            <Disclosure
              id={comparisonId}
              action="the model-by-model comparison"
              label="COMPARISON"
              open={comparisonOpen}
              onToggle={() => setComparisonOpen((open) => !open)}
            >
              <div className="flex flex-col gap-3">
                {slots.map((slot, index) => (
                  <div key={slot.model.modelId} id={`${comparisonId}-${slot.model.modelId}`}>
                    <ModelResponse slot={slot} index={index} onRetry={onRetryModel} />
                  </div>
                ))}
              </div>
            </Disclosure>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A measure rule that opens. grid-template-rows animates without measuring a
 * pixel height in JS — the one case where animating a non-transform property is
 * both simpler and smoother than the alternative.
 */
function Disclosure({
  id,
  label,
  action,
  open,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  /** Completes "Show …" / "Hide …" so the control says what it does. */
  action: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${open ? 'Hide' : 'Show'} ${action}`}
        className="flex w-full items-center py-1 text-left"
      >
        <Rule
          decorative
          label={label}
          className="flex-1"
          trailing={
            <ChevronRight
              size={13}
              aria-hidden="true"
              className={clsx(
                'shrink-0 text-ink-3 transition-transform duration-(--duration-instant)',
                open && 'rotate-90',
              )}
            />
          }
        />
      </button>

      <div
        id={id}
        className={clsx(
          'grid transition-[grid-template-rows] duration-(--duration-normal) ease-expand',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <div className="pt-3">{children}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Tier 4. Machine register throughout, so latency and model names can never be
 * mistaken for the answer no matter how the page is scanned.
 */
function Metadata({
  view,
  copied,
  onCopy,
  onRegenerate,
}: {
  view: AnswerView;
  copied: boolean;
  onCopy: () => void;
  onRegenerate: () => void;
}) {
  const parts: string[] = [];

  if (view.cancelled) parts.push('STOPPED');
  if (view.agreement) parts.push(agreementSentence(view.agreement));
  else if (view.streaming) parts.push('WORKING');
  if (view.latencyMs !== null) parts.push(latency(view.latencyMs).toUpperCase());

  return (
    <div className="flex min-h-(--control-sm) items-center gap-3 lg:pl-[calc(var(--rail-width)+var(--rail-gutter))]">
      <p data-register="machine" className="text-meta text-ink-3">
        {parts.join(' · ')}
      </p>

      {/* Always in the tab order regardless of opacity: keyboard users are
          never gated behind hover. */}
      {!view.streaming && view.text.length > 0 && view.error === null && (
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-(--duration-instant) focus-within:opacity-100 group-hover/turn:opacity-100 max-lg:opacity-100">
          <Tooltip label={copied ? 'Copied' : 'Copy response'}>
            <IconButton
              size="sm"
              label={copied ? 'Copied' : 'Copy response'}
              icon={copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
              onClick={onCopy}
            />
          </Tooltip>
          <Tooltip label="Regenerate">
            <IconButton
              size="sm"
              label="Regenerate response"
              icon={<RotateCcw size={13} aria-hidden="true" />}
              onClick={onRegenerate}
            />
          </Tooltip>
        </div>
      )}
    </div>
  );
}
