import { useId, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Check, ChevronRight, Columns2, Copy, Layers, RotateCcw, Sparkles, UserRound } from 'lucide-react';
import { getModelPricing } from '@nexusai/contracts';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Rule } from '@/components/ui/rule';
import { copy } from '@/lib/clipboard';
import {
  agreementSentence,
  estimatedCost,
  latency,
  nullableLatency,
  nullableTokens,
} from '@/lib/format';
import { toast } from '@/stores/toast-store';
import type { AnswerView } from '../answer-view';
import { useStreamedText } from '../use-streamed-text';
import type { ModelSlot } from '../stream-reducer';
import { LazyMarkdown as Markdown } from './markdown-lazy';
import { ModelResponse, shortfall } from './model-response';
import { ProvenanceRail } from './provenance-rail';
import { SourceList } from './source-list';

/**
 * One assistant turn, live or from history.
 *
 * In Standard mode, the synthesis has NO container — it is typeset text on the
 * canvas across a 68ch measure alongside the Provenance Rail. In Compare
 * (Model Arena) mode, selected models render concurrently in a responsive
 * side-by-side grid with answer selection and optional on-demand synthesis.
 */
export function AnswerBlock({
  view,
  onRegenerate,
  onRetryModel,
  onSelectAnswer,
  onCombineAnswers,
  onFollowUpAnswer,
  combining = false,
  retryingModelId = null,
}: {
  view: AnswerView;
  onRegenerate: () => void;
  onRetryModel: (modelId: string) => void;
  onSelectAnswer?: ((modelId: string | null) => void) | undefined;
  onCombineAnswers?: (() => void) | undefined;
  onFollowUpAnswer?: ((modelId: string, displayName: string) => void) | undefined;
  combining?: boolean;
  retryingModelId?: string | null;
}) {
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [perfOpen, setPerfOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const comparisonId = useId();
  const sourcesId = useId();
  const perfId = useId();

  const { slots, streaming } = view;
  const isCompare = view.mode === 'compare';
  const completedSlots = slots.filter(
    (s) => s.phase === 'complete' && s.text.trim().length > 0,
  );
  const settledSlots = slots.filter((s) => s.phase === 'complete' || s.phase === 'failed');
  const selectedSlot = view.selectedModelId
    ? slots.find((s) => s.model.modelId === view.selectedModelId)
    : undefined;

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
  const fatal =
    view.error !== null &&
    view.text.length === 0 &&
    !(isCompare && completedSlots.length > 0);

  const onCopy = async () => {
    const targetText =
      view.text.trim() ||
      selectedSlot?.text ||
      completedSlots[0]?.text ||
      '';
    if (!(await copy(targetText))) {
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
      /* Standard turns are capped at the reading measure plus the rail; Model
         Arena turns expand across the conversation measure so two side-by-side
         panels can display code and prose without cramping. */
      className={clsx(
        'group/turn flex flex-col gap-3 motion-safe:animate-[nx-answer-in_150ms_var(--ease-out)]',
        isCompare
          ? 'w-full max-w-(--measure-conversation)'
          : 'max-w-[calc(var(--measure-answer)+var(--rail-width)+var(--rail-gutter))]',
      )}
      aria-busy={streaming || undefined}
    >
      {view.routingDecision && (
        <RoutingLine
          decision={view.routingDecision}
          mode={view.mode ?? 'auto'}
          indent={!isCompare}
        />
      )}

      {isCompare ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <span data-register="machine" className="text-note uppercase text-ink-2">
                Model Arena
              </span>
              <span data-register="machine" className="text-meta text-ink-3" aria-live="polite">
                {streaming
                  ? `${settledSlots.length} of ${slots.length} finished`
                  : `${completedSlots.length} of ${slots.length} responded`}
              </span>
              {selectedSlot && (
                <span
                  data-testid="selected-answer-banner"
                  className="inline-flex items-center gap-1 text-meta text-ink-2"
                >
                  <Check size={12} aria-hidden="true" className="text-accent" />
                  Follow-ups continue from{' '}
                  <strong className="font-[550] text-ink">{selectedSlot.model.displayName}</strong>
                </span>
              )}
            </div>

            {!streaming && completedSlots.length >= 2 && onCombineAnswers && (
              <Button
                size="sm"
                variant={view.text.trim() ? 'ghost' : 'secondary'}
                loading={combining}
                icon={<Layers size={13} aria-hidden="true" />}
                onClick={onCombineAnswers}
              >
                {view.text.trim() ? 'Re-combine answers' : 'Combine answers'}
              </Button>
            )}
          </div>

          {fatal ? (
            <Alert
              title="None of the selected models could complete this comparison."
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
              data-testid="arena-comparison-grid"
              data-count={slots.length}
              className={clsx(
                // Columns follow the line-up rather than a fixed two: three
                // models get three columns where there is room, four become a
                // 2×2 so no column drops below a readable width. Below md they
                // stack — narrow columns of prose are worse than scrolling.
                'grid grid-cols-1 gap-3',
                slots.length === 3 ? 'md:grid-cols-2 xl:grid-cols-3' : 'md:grid-cols-2',
              )}
            >
              {slots.map((slot, index) => (
                <ModelResponse
                  key={slot.model.modelId}
                  slot={slot}
                  index={index}
                  arenaMode
                  retrying={retryingModelId === slot.model.modelId}
                  selected={view.selectedModelId === slot.model.modelId}
                  onSelect={
                    onSelectAnswer
                      ? (modelId) =>
                          onSelectAnswer(
                            view.selectedModelId === modelId ? null : modelId,
                          )
                      : undefined
                  }
                  onFollowUp={onFollowUpAnswer}
                  onRetry={onRetryModel}
                />
              ))}
            </div>
          )}

          {view.text.trim().length > 0 && (
            <div
              data-testid="arena-combined-synthesis"
              className="mt-3 flex flex-col gap-3 motion-safe:animate-[nx-answer-in_180ms_var(--ease-out)]"
            >
              <Rule
                label={
                  view.synthesisModel
                    ? `Combined · reconciled by ${view.synthesisModel.displayName}`
                    : 'Combined answer'
                }
              />
              <div className="flex gap-(--rail-gutter) max-lg:flex-col max-lg:gap-3">
                {slots.length > 0 && (
                  <div className="max-lg:order-2 lg:self-stretch">
                    <ProvenanceRail slots={slots} live={false} onSelect={revealModel} />
                  </div>
                )}
                <div className="min-w-0 flex-1 max-lg:order-1">
                  <Markdown content={body} />
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
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
      )}

      {!fatal && <Metadata view={view} copied={copied} onCopy={onCopy} onRegenerate={onRegenerate} />}

      {!streaming && ( (!isCompare && multiModel) || view.sources.length > 0 || slots.length > 0) && (
        <div
          className={clsx(
            'flex flex-col gap-1',
            !isCompare && 'lg:pl-[calc(var(--rail-width)+var(--rail-gutter))]',
          )}
        >
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

          {!isCompare && multiModel && (
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
                    <ModelResponse
                      slot={slot}
                      index={index}
                      retrying={retryingModelId === slot.model.modelId}
                      selected={view.selectedModelId === slot.model.modelId}
                      onSelect={
                        onSelectAnswer
                          ? (modelId) =>
                              onSelectAnswer(
                                view.selectedModelId === modelId ? null : modelId,
                              )
                          : undefined
                      }
                      onFollowUp={onFollowUpAnswer}
                      onRetry={onRetryModel}
                    />
                  </div>
                ))}
              </div>
            </Disclosure>
          )}

          {slots.length > 0 && (
            <Disclosure
              id={perfId}
              action="performance and cost details"
              label="PERFORMANCE & COST"
              open={perfOpen}
              onToggle={() => setPerfOpen((open) => !open)}
            >
              <PerformanceDetails view={view} />
            </Disclosure>
          )}
        </div>
      )}
    </article>
  );
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
  // The Arena header already counts models as they finish.
  else if (view.streaming && view.text.length === 0 && view.mode !== 'compare') parts.push('WORKING');

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
      {!view.streaming && (view.text.length > 0 || view.mode === 'compare') && view.error === null && (
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

/**
 * How the router decided, in one line, from the decision the server recorded.
 *
 * The category is a chip because it is the classifier's output — a value, not
 * prose — and the sentence beside it is the server's own explanation, read back
 * verbatim. A manual pick and an Arena line-up are labelled as what they are,
 * so a turn the user steered is never presented as the router's choice.
 */
function RoutingLine({
  decision,
  mode,
  indent,
}: {
  decision: NonNullable<AnswerView['routingDecision']>;
  mode: 'auto' | 'manual' | 'compare';
  indent: boolean;
}) {
  const Icon = mode === 'compare' ? Columns2 : mode === 'manual' ? UserRound : Sparkles;
  const label = mode === 'compare' ? 'Arena' : mode === 'manual' ? 'Manual' : 'Smart route';

  return (
    <div
      data-testid="turn-routing-reason"
      className={clsx(
        'flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-meta text-ink-3',
        indent && 'lg:pl-[calc(var(--rail-width)+var(--rail-gutter))]',
      )}
    >
      <span
        data-register="machine"
        className="inline-flex shrink-0 items-center gap-1 text-note uppercase text-ink-2"
      >
        <Icon size={11} aria-hidden="true" className="text-accent" />
        {label}
      </span>
      <span
        data-register="machine"
        className="shrink-0 rounded-mark border border-line px-1.5 text-note uppercase leading-[18px] text-ink-3"
      >
        {decision.taskCategory}
      </span>
      <span className="min-w-0">{decision.reason}</span>
    </div>
  );
}

/**
 * Performance & cost, measured or marked as missing.
 *
 * A real description list for the turn and a real table per model, so a
 * screen reader can move by row and column instead of hearing a run of
 * uppercase labels. Every figure is either measured (latency, time to first
 * token), provider-reported (tokens), or computed from those and a dated list
 * price (cost) — and anything absent says so in words rather than as a zero.
 */
function PerformanceDetails({ view }: { view: AnswerView }) {
  // Named by the catalog's display name: the provider's own model id is an
  // internal identifier and stays off the page.
  const sources = view.slots.flatMap((slot) => {
    const pricing = getModelPricing(slot.model.modelId);
    return pricing ? [{ name: slot.model.displayName, ...pricing }] : [];
  });

  return (
    <div
      data-testid="performance-cost-panel"
      className="flex flex-col gap-4 border border-line bg-raised p-3.5"
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-5">
        <Figure label="FIRST TOKEN" value={nullableLatency(view.firstTokenMs)} hint="Until the first text you saw" />
        <Figure label="TOTAL LATENCY" value={nullableLatency(view.latencyMs)} hint="Whole turn" />
        <Figure label="INPUT TOKENS" value={nullableTokens(view.inputTokens)} hint="Provider-reported" />
        <Figure label="OUTPUT TOKENS" value={nullableTokens(view.outputTokens)} hint="Provider-reported" />
        <Figure label="ESTIMATED COST" value={estimatedCost(view.estimatedCostUsd)} hint="From list prices, USD" />
      </dl>

      <div className="-mx-3.5 overflow-x-auto px-3.5">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <caption className="sr-only">Per-model telemetry</caption>
          <thead>
            <tr data-register="machine" className="text-note uppercase text-ink-3">
              <th scope="col" className="pb-1.5 pr-3 font-[500]">Model</th>
              <th scope="col" className="pb-1.5 pr-3 font-[500]">Status</th>
              <th scope="col" className="pb-1.5 pr-3 text-right font-[500]">First token</th>
              <th scope="col" className="pb-1.5 pr-3 text-right font-[500]">Total</th>
              <th scope="col" className="pb-1.5 pr-3 text-right font-[500]">Tokens in / out</th>
              <th scope="col" className="pb-1.5 text-right font-[500]">Est. cost</th>
            </tr>
          </thead>
          <tbody data-register="machine" className="text-meta text-ink-2">
            {view.slots.map((slot) => {
              const failed = slot.phase === 'failed';
              const statusText = failed
                ? `Failed (${shortfall(slot)})`
                : slot.phase === 'queued' || slot.phase === 'running'
                  ? 'Running'
                  : slot.outcome === 'empty'
                    ? 'Empty response'
                    : 'Completed';
              return (
                <tr key={slot.model.modelId} className="border-t border-line-subtle">
                  <th scope="row" className="py-1.5 pr-3 font-human text-ui font-[550] text-ink">
                    {slot.model.displayName}{' '}
                    <span data-register="machine" className="text-note font-normal uppercase text-ink-3">
                      {slot.model.provider}
                    </span>
                  </th>
                  <td className={clsx('py-1.5 pr-3', failed && 'text-warn')}>{statusText}</td>
                  <td className="py-1.5 pr-3 text-right">{nullableLatency(slot.firstTokenMs)}</td>
                  <td className="py-1.5 pr-3 text-right">{nullableLatency(slot.latencyMs)}</td>
                  <td className="py-1.5 pr-3 text-right">
                    {nullableTokens(slot.inputTokens)} / {nullableTokens(slot.outputTokens)}
                  </td>
                  <td className="py-1.5 text-right">{estimatedCost(slot.estimatedCostUsd)}</td>
                </tr>
              );
            })}
            {view.otherUsage && (
              <tr className="border-t border-line-subtle">
                <th scope="row" className="py-1.5 pr-3 font-human text-ui font-[550] text-ink">
                  {view.synthesisModel ? `Synthesis · ${view.synthesisModel.displayName}` : 'Other calls'}
                  <span className="block font-human text-micro font-normal text-ink-3">
                    Synthesis pass and any retried calls
                  </span>
                </th>
                <td className="py-1.5 pr-3">Included in totals</td>
                <td className="py-1.5 pr-3 text-right">—</td>
                <td className="py-1.5 pr-3 text-right">—</td>
                <td className="py-1.5 pr-3 text-right">
                  {nullableTokens(view.otherUsage.inputTokens)} / {nullableTokens(view.otherUsage.outputTokens)}
                </td>
                <td className="py-1.5 text-right">{estimatedCost(view.otherUsage.estimatedCostUsd)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-1 border-t border-line-subtle pt-3 text-micro text-ink-3">
        <p>
          Costs are estimates calculated from provider-reported token counts and verified USD list
          rates — not provider billing records. Missing telemetry is shown as Not available or
          Unknown, never as zero.
        </p>
        {sources.length > 0 && (
          <ul data-register="machine" className="flex flex-col gap-0.5 text-note text-ink-3">
            {sources.map((p) => (
              <li key={p.modelId}>
                {p.name}: ${p.inputUsdPerMillion}/1M in · ${p.outputUsdPerMillion}/1M out ·{' '}
                {p.source} · as of {p.asOf}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint: string }) {
  const missing = value === 'Not available' || value === 'Unknown';
  return (
    <div className="min-w-0">
      <dt data-register="machine" className="text-note uppercase text-ink-3">
        {label}
      </dt>
      <dd
        data-register="machine"
        className={clsx('mt-1 text-ui', missing ? 'text-ink-3' : 'text-ink')}
      >
        {value}
      </dd>
      <dd className="text-micro text-ink-3">{hint}</dd>
    </div>
  );
}
