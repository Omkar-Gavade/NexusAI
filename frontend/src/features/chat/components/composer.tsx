import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { ArrowUp, Columns2, CornerDownRight, Paperclip, Sparkles, Square, X } from 'lucide-react';
import {
  ARENA_MAX_MODELS,
  ARENA_MIN_MODELS,
  isRoutable,
  previewSmartRoute,
  type ChatSelection,
  type RoutingMode,
} from '@nexusai/contracts';
import { IconButton } from '@/components/ui/icon-button';
import { Kbd } from '@/components/ui/kbd';
import { ModelSelector } from '@/features/models/components/model-selector';
import { useModels } from '@/features/models/use-models';
import { AttachmentTray, type Attachment } from './attachment-tray';
import { ModelMark } from './model-mark';

interface ComposerProps {
  selection: ChatSelection;
  onSelectionChange: (selection: ChatSelection) => void;
  onSend: (prompt: string) => void;
  onStop: () => void;
  streaming: boolean;
  /** Disabled when no real model is configured, or when offline. */
  disabled: boolean;
  disabledReason?: string | undefined;
  followUpContext?: {
    modelName: string;
    onClear?: () => void;
  } | null;
  initialValue?: string | undefined;
  /**
   * Replaces the draft and focuses the field — a starter picked from the
   * empty conversation. `nonce` lets the same text be applied twice.
   */
  prefill?: { text: string; nonce: number } | null | undefined;
}

/**
 * The instrument the whole workspace is operated from.
 *
 * Three layers, top to bottom, each present only when it has something true to
 * say: context (the Arena line-up, or the answer a follow-up continues from),
 * the prompt, and the controls. The Smart Router's live decision sits between
 * the prompt and the controls because it is a consequence of what is typed —
 * it changes as you write, so it is read in the same glance as the text.
 *
 * Docked rather than floating: the composer is architecture you return to, not
 * a toast. Its 8px radius is the overlay radius because it is the one surface
 * that sits above the scrolling conversation.
 */
export function Composer({
  selection,
  onSelectionChange,
  onSend,
  onStop,
  streaming,
  disabled,
  disabledReason,
  followUpContext,
  initialValue,
  prefill,
}: ComposerProps) {
  const [value, setValue] = useState(initialValue ?? '');
  const [focused, setFocused] = useState(false);
  const [lastRouting, setLastRouting] = useState<RoutingMode>(
    selection.mode === 'auto' ? selection.routing : 'balanced',
  );
  // Stays empty until an upload endpoint exists. Nothing here is simulated:
  // with no way to upload, there is nothing to show.
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const { data: catalogData } = useModels();

  useEffect(() => {
    if (selection.mode === 'auto') {
      setLastRouting(selection.routing);
    }
  }, [selection]);

  useEffect(() => {
    if (initialValue && value === '') {
      setValue(initialValue);
    }
    // Only apply when initialValue arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValue]);

  useEffect(() => {
    if (!prefill) return;
    setValue(prefill.text);
    const node = textarea.current;
    if (!node) return;
    node.focus();
    // Caret at the end, so a starter that ends in a blank line is ready for
    // whatever the reader pastes next.
    requestAnimationFrame(() => node.setSelectionRange(prefill.text.length, prefill.text.length));
  }, [prefill]);

  const allModels = useMemo(() => catalogData?.models ?? [], [catalogData]);
  const routableModels = useMemo(
    () => allModels.filter((m) => isRoutable(m.availability)),
    [allModels],
  );

  // The same function the server runs, over the same candidates in the same
  // order, so the preview names the model the request will actually reach.
  const routingPreview = useMemo(() => {
    if (selection.mode !== 'auto' || routableModels.length === 0) return null;
    const candidates = routableModels.map((m) => ({
      id: m.id,
      displayName: m.displayName,
      providerId: m.provider.id,
      availability: m.availability,
      contextWindow: m.contextWindow,
      capabilities: m.capabilities,
    }));
    return previewSmartRoute(value, selection.routing, candidates);
  }, [selection, routableModels, value]);

  const switchToStandard = () => {
    if (selection.mode === 'compare') {
      onSelectionChange({ mode: 'auto', routing: lastRouting });
    }
  };

  const switchToCompare = () => {
    if (selection.mode === 'compare') return;
    const defaults = routableModels.slice(0, 3).map((m) => m.id);
    const fallback = allModels.slice(0, 2).map((m) => m.id);
    const chosen = defaults.length >= ARENA_MIN_MODELS ? defaults : fallback;
    if (chosen.length >= ARENA_MIN_MODELS) {
      onSelectionChange({ mode: 'compare', modelIds: chosen });
    }
  };

  const toggleCompareModel = (modelId: string) => {
    if (selection.mode !== 'compare') return;
    const exists = selection.modelIds.includes(modelId);
    if (exists) {
      if (selection.modelIds.length <= ARENA_MIN_MODELS) return;
      onSelectionChange({
        mode: 'compare',
        modelIds: selection.modelIds.filter((id) => id !== modelId),
      });
    } else {
      if (selection.modelIds.length >= ARENA_MAX_MODELS) return;
      onSelectionChange({
        mode: 'compare',
        modelIds: [...selection.modelIds, modelId],
      });
    }
  };

  // Auto-grow. Collapsing to zero before measuring is what makes scrollHeight
  // report the content rather than whatever box the element currently fills.
  const resize = useCallback(() => {
    const node = textarea.current;
    if (!node) return;
    node.style.height = '0px';
    node.style.height = `${node.scrollHeight}px`;
  }, []);

  // useLayoutEffect so the height is corrected before paint and the box never
  // visibly jumps as the user types.
  useLayoutEffect(resize, [value, resize]);

  // The mount-time measurement can land before the stylesheet is applied, which
  // reports the unstyled element's height and leaves the field stuck open at
  // its maximum. One re-measure after the first frame settles it.
  useEffect(() => {
    const frame = requestAnimationFrame(resize);
    void document.fonts?.ready.then(resize);
    return () => cancelAnimationFrame(frame);
  }, [resize]);

  const compareInvalid = selection.mode === 'compare' && selection.modelIds.length < ARENA_MIN_MODELS;
  const isCompare = selection.mode === 'compare';

  const submit = () => {
    const prompt = value.trim();
    if (!prompt || disabled || streaming || compareInvalid) return;
    onSend(prompt);
    setValue('');
  };

  const routedTo = routingPreview?.selectedModelIds
    .map((id) => allModels.find((m) => m.id === id)?.displayName ?? id)
    .join(', ');

  return (
    // `viewport-fit=cover` is set on the viewport meta, so on a notched iPhone
    // the bottom inset is real screen the browser will happily draw under.
    // Without this the send button sits beneath the home indicator.
    <div className="relative px-(--gutter) pb-[max(0.75rem,env(safe-area-inset-bottom))] max-lg:px-3">
      {/* The conversation scrolls under the composer and fades rather than
          being cut by a hard edge. Functional, not decoration: it tells the
          reader there is more above. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-8 h-8 bg-linear-to-b from-transparent to-canvas"
      />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        aria-label="Message composer"
        className="mx-auto w-full max-w-(--measure-composer)"
      >
        <div
          className={clsx(
            'group/composer relative rounded-overlay border bg-raised shadow-float',
            'transition-[border-color,box-shadow] duration-(--duration-quick) ease-out',
            focused
              ? 'border-accent/60 shadow-[var(--shadow-float-value),0_0_0_3px_color-mix(in_oklab,var(--accent)_14%,transparent)]'
              : 'border-line hover:border-line-strong',
            disabled && 'opacity-60',
          )}
        >
          {followUpContext && (
            <div className="flex items-center gap-2 border-b border-line-subtle px-3.5 py-2 text-meta text-ink-2 motion-safe:animate-[nx-slide-down_160ms_var(--ease-out)]">
              <CornerDownRight size={13} aria-hidden="true" className="shrink-0 text-accent" />
              <span className="min-w-0 flex-1 truncate">
                Continuing with selected answer from{' '}
                <strong className="font-[550] text-ink">{followUpContext.modelName}</strong>
              </span>
              {followUpContext.onClear && (
                <button
                  type="button"
                  onClick={followUpContext.onClear}
                  aria-label="Clear selected answer context"
                  className="inline-flex h-6 items-center gap-1 rounded-control px-1.5 text-micro text-ink-3 transition-colors duration-(--duration-instant) hover:bg-hover hover:text-ink"
                >
                  <X size={12} aria-hidden="true" />
                  Clear
                </button>
              )}
            </div>
          )}

          {isCompare && allModels.length > 0 && (
            <div
              role="group"
              aria-label="Arena comparison models"
              className="border-b border-line-subtle px-3.5 pb-2.5 pt-2.5 motion-safe:animate-[nx-slide-down_160ms_var(--ease-out)]"
            >
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <span data-register="machine" className="text-note uppercase text-ink-3">
                  Arena line-up
                </span>
                <span data-register="machine" className="text-meta text-ink-3" aria-live="polite">
                  <span className="text-ink">{selection.modelIds.length}</span> of{' '}
                  {ARENA_MIN_MODELS}–{ARENA_MAX_MODELS} selected
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {allModels.map((m) => {
                  const routable = isRoutable(m.availability);
                  const position = selection.modelIds.indexOf(m.id);
                  const isSelected = position !== -1;
                  const atMinimum = isSelected && selection.modelIds.length <= ARENA_MIN_MODELS;
                  const atMaximum = !isSelected && selection.modelIds.length >= ARENA_MAX_MODELS;
                  const reason = !routable
                    ? (m.availabilityReason ?? 'Model is currently unavailable')
                    : atMinimum
                      ? `At least ${ARENA_MIN_MODELS} models are required in Compare mode`
                      : atMaximum
                        ? `The Arena compares at most ${ARENA_MAX_MODELS} models`
                        : `${m.displayName} (${m.provider.displayName})`;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={!routable}
                      aria-pressed={isSelected}
                      aria-disabled={atMaximum || atMinimum || undefined}
                      title={reason}
                      onClick={() => toggleCompareModel(m.id)}
                      className={clsx(
                        'inline-flex h-(--control-sm) items-center gap-1.5 rounded-control border px-2 text-meta',
                        'transition-[background-color,border-color,color] duration-(--duration-instant) ease-out',
                        isSelected
                          ? 'border-accent/50 bg-selected text-ink'
                          : 'border-line bg-workspace text-ink-2 hover:border-line-strong hover:text-ink',
                        !routable && 'opacity-45',
                        atMaximum && 'opacity-60',
                      )}
                    >
                      {isSelected ? (
                        <span
                          data-register="machine"
                          className="grid size-3.5 place-items-center rounded-mark bg-accent text-[10px] leading-none text-ink-inv motion-safe:animate-[nx-pop_160ms_var(--ease-out)]"
                          aria-hidden="true"
                        >
                          {position + 1}
                        </span>
                      ) : (
                        <ModelMark index={allModels.indexOf(m)} />
                      )}
                      <span>{m.displayName}</span>
                      <span data-register="machine" className="text-note text-ink-3 max-sm:hidden">
                        {m.provider.displayName}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <label htmlFor="composer" className="sr-only">
            Ask anything
          </label>
          <textarea
            ref={textarea}
            id="composer"
            rows={1}
            value={value}
            disabled={disabled}
            placeholder={
              isCompare
                ? `Ask once — ${selection.modelIds.length} models answer side by side…`
                : 'Ask anything…'
            }
            enterKeyHint="send"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends only when the event originated in the textarea. An
              // open listbox portals its own focus, so its Enter can never
              // reach this handler and accidentally submit the chat.
              if (event.key === 'Enter' && !event.shiftKey && event.currentTarget === event.target) {
                event.preventDefault();
                submit();
              }
              // Escape stops generation. It never clears the input — destroying
              // typed text on Escape is unrecoverable.
              if (event.key === 'Escape' && streaming) {
                event.preventDefault();
                onStop();
              }
            }}
            className={clsx(
              'block max-h-(--composer-max-height) min-h-[52px] w-full px-3.5 pb-1 pt-3',
              // `ink-3`, not `ink-off`. The placeholder is the only text in an empty
              // composer and it is what tells you what the field is for — an
              // enabled control's placeholder is not covered by WCAG 1.4.3's
              // inactive-control exemption, and `--text-disabled` measures
              // 3.22:1 in dark against 4.5 required.
              'bg-transparent text-body text-ink outline-none placeholder:text-ink-3',
              // 16px on small viewports defeats iOS zoom-on-focus.
              'max-md:text-[16px]',
            )}
          />

          <div className="px-3.5">
            <AttachmentTray
              attachments={attachments}
              onRemove={(id) => setAttachments((list) => list.filter((a) => a.id !== id))}
              onRetry={() => undefined}
            />
          </div>

          {selection.mode === 'auto' && routingPreview && routingPreview.selectedModelIds.length > 0 && (
            <div
              data-testid="smart-routing-indicator"
              title={routingPreview.reason}
              className="flex min-w-0 items-center gap-2 px-3.5 pb-1 pt-1 text-meta text-ink-3"
            >
              <span
                data-register="machine"
                className="inline-flex shrink-0 items-center gap-1 rounded-mark border border-accent/30 bg-accent-quiet px-1.5 text-note uppercase leading-[18px] text-accent"
              >
                <Sparkles size={10} aria-hidden="true" />
                {routingPreview.taskCategory}
              </span>
              {/* The full sentence stays in the DOM for assistive tech and the
                  tooltip; on narrow screens only the destination is shown. */}
              <span className="min-w-0 truncate max-sm:hidden">{routingPreview.reason}</span>
              <span data-register="machine" className="min-w-0 truncate sm:hidden" aria-hidden="true">
                → {routedTo}
              </span>
            </div>
          )}

          {selection.mode === 'manual' && (
            <div
              data-testid="manual-override-indicator"
              className="flex min-w-0 items-center gap-2 px-3.5 pb-1 pt-1 text-meta text-ink-3"
            >
              <span
                data-register="machine"
                className="shrink-0 rounded-mark border border-line px-1.5 text-note uppercase leading-[18px] text-ink-2"
              >
                Manual
              </span>
              <span className="min-w-0 truncate">
                <strong className="font-[550] text-ink-2">
                  {allModels.find((m) => m.id === selection.modelId)?.displayName ??
                    selection.modelId}
                </strong>{' '}
                answers alone — no routing, no synthesis.
              </span>
              <button
                type="button"
                onClick={() => onSelectionChange({ mode: 'auto', routing: lastRouting })}
                className="ml-auto shrink-0 rounded-control px-1.5 text-micro text-accent transition-colors duration-(--duration-instant) hover:bg-hover"
              >
                Use Smart Router
              </button>
            </div>
          )}

          <div className="flex min-w-0 items-center gap-1.5 px-2 pb-2 pt-1">
            <IconButton
              size="sm"
              label="Attach a file — not available yet"
              icon={<Paperclip size={14} aria-hidden="true" />}
              disabled
            />

            <div
              role="group"
              aria-label="Interaction mode"
              className="relative inline-grid h-(--control-sm) shrink-0 grid-cols-[1fr_1fr] items-center rounded-control border border-line bg-workspace p-0.5"
            >
              {/* One sliding fill rather than two toggled backgrounds, so the
                  change of mode reads as a move between two positions. */}
              <span
                aria-hidden="true"
                className={clsx(
                  'absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-[3px] bg-active',
                  'transition-transform duration-(--duration-quick) ease-out',
                  isCompare && 'translate-x-full',
                )}
              />
              <button
                type="button"
                aria-pressed={!isCompare}
                onClick={switchToStandard}
                className={clsx(
                  'relative inline-flex h-full items-center justify-center gap-1 px-2 text-meta transition-colors duration-(--duration-instant)',
                  !isCompare ? 'font-[550] text-ink' : 'text-ink-3 hover:text-ink',
                )}
              >
                <Sparkles size={12} aria-hidden="true" className={clsx('max-sm:hidden', !isCompare && 'text-accent')} />
                Standard
              </button>
              <button
                type="button"
                aria-pressed={isCompare}
                disabled={allModels.length < ARENA_MIN_MODELS}
                onClick={switchToCompare}
                className={clsx(
                  'relative inline-flex h-full items-center justify-center gap-1 px-2 text-meta transition-colors duration-(--duration-instant)',
                  isCompare ? 'font-[550] text-ink' : 'text-ink-3 hover:text-ink',
                  allModels.length < ARENA_MIN_MODELS && 'opacity-50',
                )}
              >
                <Columns2 size={12} aria-hidden="true" className={clsx('max-sm:hidden', isCompare && 'text-accent')} />
                Compare
              </button>
            </div>

            {!isCompare && (
              <div className="min-w-0 shrink">
                <ModelSelector selection={selection} onChange={onSelectionChange} />
              </div>
            )}

            <span className="min-w-0 flex-1" />

            <span
              className={clsx(
                'text-micro text-ink-3 transition-opacity duration-(--duration-quick) max-md:hidden',
                focused && !streaming && !disabled ? 'opacity-100' : 'opacity-0',
              )}
              aria-hidden={!focused}
            >
              <Kbd keys={['enter']} /> send <span className="mx-1 text-ink-off">·</span>
              <Kbd keys={['shift', 'enter']} /> new line
            </span>

            {streaming ? (
              <IconButton
                size="md"
                variant="secondary"
                label="Stop generating"
                icon={<Square size={11} aria-hidden="true" className="fill-current" />}
                onClick={onStop}
              />
            ) : (
              <IconButton
                size="md"
                variant="primary"
                label="Send message"
                icon={<ArrowUp size={15} aria-hidden="true" />}
                disabled={disabled || value.trim().length === 0 || compareInvalid}
                onClick={submit}
              />
            )}
          </div>
        </div>

        {disabled && disabledReason ? (
          <p role="status" className="mt-2 text-center text-micro text-ink-3">
            {disabledReason}
          </p>
        ) : (
          <p className="mt-1.5 text-center text-micro text-ink-3 max-md:hidden">
            Answers come from third-party models. Check anything that matters.
          </p>
        )}
      </form>
    </div>
  );
}
