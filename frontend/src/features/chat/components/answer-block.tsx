import { useId, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Check, ChevronRight, Columns2, Copy, Layers, RotateCcw, Sparkles } from 'lucide-react';
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
import { ModelResponse } from './model-response';
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
        <div
          data-testid="turn-routing-reason"
          className={clsx(
            'flex flex-wrap items-center gap-2 text-meta text-ink-3',
            !isCompare && 'lg:pl-[calc(var(--rail-width)+var(--rail-gutter))]',
          )}
        >
          {isCompare ? (
            <Columns2 size={12} aria-hidden="true" className="shrink-0 text-accent" />
          ) : (
            <Sparkles size={12} aria-hidden="true" className="shrink-0 text-accent" />
          )}
          <span>{view.routingDecision.reason}</span>
        </div>
      )}

      {isCompare ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-subtle pb-2">
            <div className="flex flex-wrap items-center gap-2">
              <span data-register="machine" className="text-note uppercase text-ink-2">
                MODEL ARENA · {completedSlots.length} OF {slots.length} RESPONDED
              </span>
              {selectedSlot && (
                <span
                  data-testid="selected-answer-banner"
                  className="inline-flex items-center gap-1 rounded-xs border border-accent/40 bg-selected px-2 py-0.5 text-meta text-ink"
                >
                  <Check size={11} aria-hidden="true" className="text-accent" />
                  Preferred: {selectedSlot.model.displayName} (retained for follow-up turns)
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
              className="grid grid-cols-1 gap-4 lg:grid-cols-2"
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
              className="mt-2 border-t border-line pt-4"
            >
              <div className="mb-2 flex items-center gap-2">
                <span data-register="machine" className="text-note uppercase text-accent">
                  COMBINED SYNTHESIS
                </span>
                {view.synthesisModel && (
                  <span data-register="machine" className="text-note text-ink-3">
                    · RECONCILED BY {view.synthesisModel.displayName.toUpperCase()}
                  </span>
                )}
              </div>
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
 * Transparent Performance & Cost inspection panel.
 *
 * Uses measured latency and provider-reported token usage. Calculated costs are
 * labeled explicitly as estimates derived from verified USD list rates, and
 * missing metrics are reported honestly as "Not available" or "Unknown".
 */
function PerformanceDetails({ view }: { view: AnswerView }) {
  return (
    <div
      data-testid="performance-cost-panel"
      className="flex flex-col gap-3 rounded-control border border-line bg-raised p-3"
    >
      <div className="grid grid-cols-2 gap-3 border-b border-line-subtle pb-3 sm:grid-cols-5">
        <div>
          <dt data-register="machine" className="text-note uppercase text-ink-3">
            FIRST TOKEN
          </dt>
          <dd data-register="machine" className="mt-0.5 text-meta text-ink">
            {nullableLatency(view.firstTokenMs)}
          </dd>
        </div>
        <div>
          <dt data-register="machine" className="text-note uppercase text-ink-3">
            TOTAL LATENCY
          </dt>
          <dd data-register="machine" className="mt-0.5 text-meta text-ink">
            {nullableLatency(view.latencyMs)}
          </dd>
        </div>
        <div>
          <dt data-register="machine" className="text-note uppercase text-ink-3">
            INPUT TOKENS
          </dt>
          <dd data-register="machine" className="mt-0.5 text-meta text-ink">
            {nullableTokens(view.inputTokens)}
          </dd>
        </div>
        <div>
          <dt data-register="machine" className="text-note uppercase text-ink-3">
            OUTPUT TOKENS
          </dt>
          <dd data-register="machine" className="mt-0.5 text-meta text-ink">
            {nullableTokens(view.outputTokens)}
          </dd>
        </div>
        <div>
          <dt data-register="machine" className="text-note uppercase text-ink-3">
            ESTIMATED COST
          </dt>
          <dd data-register="machine" className="mt-0.5 text-meta text-ink">
            {estimatedCost(view.estimatedCostUsd)}
          </dd>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span data-register="machine" className="text-note uppercase text-ink-3">
          PER-MODEL TELEMETRY & PRICING SOURCE
        </span>
        <div className="divide-y divide-line-subtle">
          {view.slots.map((slot) => {
            const pricing = getModelPricing(slot.model.modelId);
            const failed = slot.phase === 'failed';
            const statusText = failed
              ? `Failed (${shortfall(slot)})`
              : slot.outcome === 'empty'
                ? 'Empty response'
                : 'Completed';

            return (
              <div
                key={slot.model.modelId}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-meta"
              >
                <div className="min-w-0">
                  <span className="font-medium text-ink">{slot.model.displayName}</span>{' '}
                  <span data-register="machine" className="text-note uppercase text-ink-3">
                    ({slot.model.provider})
                  </span>
                  <span className="block text-micro text-ink-3">
                    {pricing
                      ? `${pricing.source} ($${pricing.inputUsdPerMillion}/1M in · $${pricing.outputUsdPerMillion}/1M out USD)`
                      : 'Pricing source: Unknown (no verified list rate on file)'}
                  </span>
                </div>

                <div
                  data-register="machine"
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 text-note text-ink-2"
                >
                  <span>STATUS: {statusText.toUpperCase()}</span>
                  <span>LATENCY: {nullableLatency(slot.latencyMs)}</span>
                  <span>
                    TOKENS: {nullableTokens(slot.inputTokens)} IN /{' '}
                    {nullableTokens(slot.outputTokens)} OUT
                  </span>
                  <span>COST: {estimatedCost(slot.estimatedCostUsd)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="border-t border-line-subtle pt-2 text-micro text-ink-3">
        Costs are estimates calculated from provider-reported token counts and verified USD list
        rates. Kept separate from provider billing records; missing telemetry is shown as Not
        available or Unknown.
      </p>
    </div>
  );
}
