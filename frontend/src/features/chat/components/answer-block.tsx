import { useId, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Check, ChevronRight, Copy, RotateCcw } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Rule } from '@/components/ui/rule';
import { copy } from '@/lib/clipboard';
import { agreementSentence, latency } from '@/lib/format';
import { toast } from '@/stores/toast-store';
import type { AnswerView } from '../answer-view';
import { useStreamedText } from '../use-streamed-text';
import type { ModelSlot } from '../stream-reducer';
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

  /*
   * The single model this turn asked for, if it asked for exactly one. Used to
   * attribute a failure to the model the user actually chose: an explicit
   * selection that fails must say which model failed and offer a retry — never
   * quietly answer from a different one, because the choice was the request.
   */
  const chosen =
    slots.length === 1 && (view.agreement?.requested ?? slots.length) === 1
      ? (slots[0]?.model.displayName ?? null)
      : null;
  // Throttles only the markdown re-parse while text is arriving; the completed
  // answer is always the exact final string.
  const body = useStreamedText(view.text, streaming);
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
    <article
      /* Capped at the reading measure plus the rail, and left-aligned in a
         wider column. The answer is a document and its line length does not
         grow with the display; the space to its right is what the reader's own
         messages are offset into. */
      className="group/turn flex max-w-[calc(var(--measure-answer)+var(--rail-width)+var(--rail-gutter))] flex-col gap-3 motion-safe:animate-[nx-answer-in_150ms_var(--ease-out)]"
      aria-busy={streaming || undefined}
    >
      <div className="flex gap-(--rail-gutter) max-lg:flex-col max-lg:gap-3">
        {slots.length > 0 && (
          <div className="max-lg:order-2 lg:self-stretch">
            <ProvenanceRail slots={slots} live={streaming} onSelect={revealModel} />
          </div>
        )}

        <div className="min-w-0 flex-1 max-lg:order-1">
          {/* Orchestration status, while the answer is still being assembled.
              Shown only before any synthesis text exists — the moment the
              answer starts arriving it is replaced by the answer, because a
              status line above real prose is instrumentation the reader has
              stopped needing. */}
          {!fatal && streaming && view.text.length === 0 && slots.length > 0 && (
            <OrchestrationStatus slots={slots} />
          )}

          {fatal ? (
            <Alert
              title={chosen ? `${chosen} couldn't complete this response.` : "The response couldn't be generated."}
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
            <div
              /*
               * Announced while it is being written, and only then.
               *
               * A screen reader otherwise gets silence during the one part of
               * the interaction that is actually happening. `polite` queues
               * rather than interrupts, and the markdown re-parse is already
               * throttled to ~10Hz, so this does not turn into a token-by-token
               * announcement. The attribute is dropped once the answer settles
               * so the finished text is not re-read on every later re-render.
               */
              aria-live={streaming ? 'polite' : undefined}
              aria-busy={streaming || undefined}
            >
              <Markdown content={body} />
              {streaming && <span className="md-caret" aria-hidden="true" />}
            </div>
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
    </article>
  );
}

/**
 * What the system is doing, in one line, using the real plan.
 *
 * The count comes from the slots the server actually planned — never a fixed
 * number — and the stage is derived from the slots themselves rather than from
 * a new field: while any model is still outstanding this is the fan-out; once
 * they have all settled and no text has arrived, the synthesis pass is running.
 *
 * A model that failed is shown as settled, not as an error. An individual
 * provider failure is not the reader's problem to solve mid-turn — the turn
 * continues with whoever answered, and the shortfall is reported afterwards by
 * the agreement line and the rail. What must never happen is a provider's raw
 * error becoming the answer.
 */
/**
 * Short, neutral words for why a model contributed nothing.
 *
 * The provider's own message never reaches this component — the server sends a
 * fixed string and an error code — and even the code is not shown raw. A
 * reader needs to know that a model dropped out and roughly why; `429`,
 * `RESOURCE_EXHAUSTED` and a provider stack trace are operator concerns, and
 * putting them in a chat transcript makes a handled condition look like a
 * crash.
 */
function shortfall(slot: ModelSlot): string {
  switch (slot.errorCode) {
    case 'RATE_LIMITED':
      return 'rate limited';
    case 'TIMEOUT':
      return 'timed out';
    case 'MODEL_NOT_CONFIGURED':
      return 'not configured';
    default:
      return 'unavailable';
  }
}

/**
 * What the orchestration is doing, in two compact lines.
 *
 * Counts come from the plan the server actually made, never a constant. The
 * stage is derived from the slots rather than a new field: while any model is
 * outstanding this is the fan-out; once all have settled with no text yet, the
 * synthesis pass is running.
 *
 * This is deliberately not six cards. The hierarchy is answer first, question
 * second, orchestration third — so the whole thing is two lines of machine
 * register that disappear the moment real text arrives, and the per-model
 * detail stays where it already lived, behind COMPARISON.
 *
 * A model that failed reads as settled, not as an error. Its lane is one quiet
 * word. The turn continues with whoever answered, and the shortfall is stated
 * afterwards by the agreement line.
 */
function OrchestrationStatus({ slots }: { slots: ModelSlot[] }) {
  const responded = slots.filter((s) => s.phase === 'complete').length;
  const settled = slots.filter((s) => s.phase === 'complete' || s.phase === 'failed').length;
  const synthesising = settled === slots.length;

  const summary = [
    `${slots.length} model${slots.length === 1 ? '' : 's'}`,
    `${responded} response${responded === 1 ? '' : 's'}`,
    synthesising ? 'synthesising' : 'comparing',
  ].join(' · ');

  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      <p data-register="machine" className="flex items-center gap-2 text-meta uppercase text-ink-3">
        <span
          aria-hidden="true"
          className="block size-1.5 shrink-0 bg-accent motion-safe:animate-[live-step_1.6s_step-end_infinite]"
        />
        {summary}
      </p>

      {/* One row, not a dashboard: name, and a single word of state. */}
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {slots.map((slot) => {
          const failed = slot.phase === 'failed';
          const done = slot.phase === 'complete';

          return (
            <li
              key={slot.model.modelId}
              data-register="machine"
              className={clsx('flex items-baseline gap-1.5 text-meta', failed ? 'text-ink-3' : 'text-ink-2')}
            >
              {/* The catalog's display name, not the raw id: this line is read
                  by a person, and `gemini-flash` is an internal identifier.
                  The id still appears in the comparison card header, where the
                  reader is deliberately looking at provenance. */}
              <span className={clsx(!done && !failed && 'motion-safe:animate-[live-step_1.6s_step-end_infinite]')}>
                {slot.model.displayName}
              </span>
              <span className="text-ink-3">
                {failed
                  ? shortfall(slot)
                  : done
                    ? slot.latencyMs === null
                      ? 'done'
                      : latency(slot.latencyMs)
                    : 'working'}
              </span>
            </li>
          );
        })}
      </ul>
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

  /*
   * The model the user actually chose, when they chose exactly one.
   *
   * `requested === 1` is what separates an explicit single-model turn from a
   * multi-model turn that degraded to one survivor: the first should be
   * credited to the model by name, the second should say that only one of
   * several answered. Both are direct answers, and calling them the same thing
   * would hide which one happened.
   *
   * Read from the turn's own provenance, never from the current selector — a
   * conversation reloaded months later must show the model that answered it,
   * not whatever the user happens to have selected today.
   */
  const soleModel =
    view.slots.length === 1 && (view.agreement?.requested ?? view.slots.length) === 1
      ? (view.slots[0]?.model.displayName ?? null)
      : null;

  if (view.cancelled) parts.push('STOPPED');
  // Display name, not the catalog id, and not upper-cased: "GPT-4o" is the
  // product's name for it and "GPT-4O" is not.
  if (soleModel) parts.push(soleModel);
  else if (view.agreement) parts.push(agreementSentence(view.agreement));
  else if (view.streaming && view.text.length === 0) parts.push('WORKING');

  /*
   * "Still writing", in both modes.
   *
   * The orchestration status carries the fan-out phase, but it stands down the
   * moment real text exists — so once a synthesised answer starts streaming the
   * metadata read only "THREE MODELS", with nothing saying the answer was still
   * arriving. A single chosen model said ANSWERING from the first frame,
   * because there is no fan-out phase to report for it.
   */
  if (view.streaming && (soleModel || view.text.length > 0)) parts.push('ANSWERING');

  /*
   * Synthesised, or answered directly.
   *
   * `synthesisModel === null` on a finished answer is the server's record that
   * no synthesis pass wrote it — either one model responded and there was
   * nothing to reconcile, or every synthesis-capable model was unavailable and
   * the best real response was delivered instead. Both are honest outcomes and
   * both must be distinguishable: labelling a direct answer as synthesised
   * would claim a reconciliation that never happened.
   */
  if (!view.streaming && view.text.length > 0 && view.error === null) {
    parts.push(view.synthesisModel === null ? 'ANSWERED DIRECTLY' : 'SYNTHESISED');
  }

  if (view.latencyMs !== null) parts.push(latency(view.latencyMs).toUpperCase());

  return (
    // Wraps rather than clips: at 390px the machine-register line takes two
    // lines on its own, which pushed the action buttons past the right edge and
    // cut "Regenerate" in half. The actions drop below the metadata instead.
    <div className="flex min-h-(--control-sm) flex-wrap items-center gap-x-3 gap-y-1 lg:pl-[calc(var(--rail-width)+var(--rail-gutter))]">
      <p data-register="machine" className="text-meta text-ink-3">
        {parts.join(' · ')}
      </p>

      {/* Named rather than icon-only: two unlabelled glyphs beside a metadata
          line are a guess. Quiet by default and revealed on hover, but always in
          the tab order and revealed by focus-within, so a keyboard user never
          has to discover them by accident. */}
      {!view.streaming && view.text.length > 0 && view.error === null && (
        <div className="flex items-center gap-1 opacity-0 transition-opacity duration-(--duration-instant) focus-within:opacity-100 group-hover/turn:opacity-100 max-lg:opacity-100">
          <Button
            size="sm"
            variant="ghost"
            icon={copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
            onClick={onCopy}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<RotateCcw size={13} aria-hidden="true" />}
            onClick={onRegenerate}
          >
            Regenerate
          </Button>
        </div>
      )}
    </div>
  );
}
