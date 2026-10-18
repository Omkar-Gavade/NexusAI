import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { ArrowUp, Check, Columns2, Paperclip, Sparkles, Square, X } from 'lucide-react';
import {
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
}

/**
 * A precision tool, not a floating pill.
 *
 * Exposes Standard (Smart Router / single-model override) and Compare (Model
 * Arena) modes directly in the composer toolbar, with live task-routing
 * feedback and multi-model Arena selection.
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

  const allModels = useMemo(() => catalogData?.models ?? [], [catalogData]);
  const routableModels = useMemo(
    () => allModels.filter((m) => isRoutable(m.availability)),
    [allModels],
  );

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
    const chosen = defaults.length >= 2 ? defaults : fallback;
    if (chosen.length >= 2) {
      onSelectionChange({ mode: 'compare', modelIds: chosen });
    }
  };

  const toggleCompareModel = (modelId: string) => {
    if (selection.mode !== 'compare') return;
    const exists = selection.modelIds.includes(modelId);
    if (exists) {
      // Keep at least 2 models selected in Compare mode.
      if (selection.modelIds.length <= 2) return;
      onSelectionChange({
        mode: 'compare',
        modelIds: selection.modelIds.filter((id) => id !== modelId),
      });
    } else {
      if (selection.modelIds.length >= 5) return;
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

  const compareInvalid = selection.mode === 'compare' && selection.modelIds.length < 2;

  const submit = () => {
    const prompt = value.trim();
    if (!prompt || disabled || streaming || compareInvalid) return;
    onSend(prompt);
    setValue('');
  };

  return (
    // `viewport-fit=cover` is set on the viewport meta, so on a notched iPhone
    // the bottom inset is real screen the browser will happily draw under.
    // Without this the send button sits beneath the home indicator.
    <div className="px-(--gutter) pb-[max(1rem,env(safe-area-inset-bottom))] max-lg:px-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        aria-label="Message composer"
        className="mx-auto w-full max-w-(--measure-conversation)"
      >
        <div
          className={clsx(
            'rounded-control border bg-workspace p-3 transition-colors duration-(--duration-instant)',
            focused ? 'border-accent' : 'border-line-control',
            disabled && 'opacity-60',
          )}
        >
          {followUpContext && (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-control border border-line-subtle bg-elevated px-2.5 py-1.5 text-meta text-ink-2">
              <span className="truncate">
                Continuing with selected answer from{' '}
                <strong className="font-medium text-ink">{followUpContext.modelName}</strong>
              </span>
              {followUpContext.onClear && (
                <button
                  type="button"
                  onClick={followUpContext.onClear}
                  aria-label="Clear selected answer context"
                  className="inline-flex items-center gap-1 rounded-xs px-1.5 py-0.5 text-micro text-ink-3 hover:bg-hover hover:text-ink"
                >
                  <X size={11} aria-hidden="true" />
                  Clear
                </button>
              )}
            </div>
          )}

          {selection.mode === 'compare' && allModels.length > 0 && (
            <div
              role="group"
              aria-label="Arena comparison models"
              className="mb-2.5 border-b border-line-subtle pb-2.5"
            >
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <span data-register="machine" className="text-note uppercase text-ink-3">
                  MODEL ARENA · SELECT 2–5 MODELS TO COMPARE CONCURRENTLY
                </span>
                <span data-register="machine" className="text-meta text-ink-2">
                  {selection.modelIds.length} selected
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {allModels.map((m, idx) => {
                  const routable = isRoutable(m.availability);
                  const isSelected = selection.modelIds.includes(m.id);
                  const lockedMinimum = isSelected && selection.modelIds.length <= 2;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={!routable}
                      aria-pressed={isSelected}
                      title={
                        !routable
                          ? (m.availabilityReason ?? 'Model is currently unavailable')
                          : lockedMinimum
                            ? 'At least 2 models are required in Compare mode'
                            : `${m.displayName} (${m.provider.displayName})`
                      }
                      onClick={() => toggleCompareModel(m.id)}
                      className={clsx(
                        'inline-flex h-(--control-sm) items-center gap-1.5 rounded-control border px-2 text-meta transition-colors duration-(--duration-instant)',
                        isSelected
                          ? 'border-accent bg-selected text-ink'
                          : 'border-line-subtle bg-elevated text-ink-2 hover:border-line-control hover:text-ink',
                        !routable && 'cursor-not-allowed opacity-45',
                      )}
                    >
                      <ModelMark index={idx} />
                      <span>{m.displayName}</span>
                      <span data-register="machine" className="text-note text-ink-3">
                        {m.provider.displayName}
                      </span>
                      {isSelected && <Check size={11} aria-hidden="true" className="text-accent" />}
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
              selection.mode === 'compare'
                ? 'Ask one prompt to compare selected models side by side…'
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
              'block max-h-(--composer-max-height) min-h-[27px] w-full',
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

          <AttachmentTray
            attachments={attachments}
            onRemove={(id) => setAttachments((list) => list.filter((a) => a.id !== id))}
            onRetry={() => undefined}
          />

          {selection.mode === 'auto' && routingPreview && routingPreview.selectedModelIds.length > 0 && (
            <div
              data-testid="smart-routing-indicator"
              className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line-subtle pt-2 text-meta text-ink-2"
            >
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <Sparkles size={12} aria-hidden="true" className="shrink-0 text-accent" />
                <span className="truncate">{routingPreview.reason}</span>
              </span>
              <span data-register="machine" className="text-note uppercase text-ink-3">
                TASK: {routingPreview.taskCategory.toUpperCase()}
              </span>
            </div>
          )}

          {selection.mode === 'manual' && (
            <div
              data-testid="manual-override-indicator"
              className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line-subtle pt-2 text-meta text-ink-2"
            >
              <span className="truncate">
                Manual override:{' '}
                <strong className="font-medium text-ink">
                  {allModels.find((m) => m.id === selection.modelId)?.displayName ??
                    selection.modelId}
                </strong>{' '}
                — bypasses automatic routing.
              </span>
              <button
                type="button"
                onClick={() => onSelectionChange({ mode: 'auto', routing: lastRouting })}
                className="text-micro text-accent hover:underline"
              >
                Use Smart Router
              </button>
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <IconButton
              size="sm"
              label="Attach a file — not available yet"
              icon={<Paperclip size={14} aria-hidden="true" />}
              disabled
            />

            <div
              role="group"
              aria-label="Interaction mode"
              className="inline-flex h-(--control-sm) items-center rounded-control border border-line-subtle bg-elevated p-0.5"
            >
              <button
                type="button"
                aria-pressed={selection.mode !== 'compare'}
                onClick={switchToStandard}
                className={clsx(
                  'inline-flex h-full items-center gap-1 rounded-xs px-2 text-meta transition-colors duration-(--duration-instant)',
                  selection.mode !== 'compare'
                    ? 'bg-selected font-medium text-ink'
                    : 'text-ink-3 hover:text-ink',
                )}
              >
                Standard
              </button>
              <button
                type="button"
                aria-pressed={selection.mode === 'compare'}
                disabled={allModels.length < 2}
                onClick={switchToCompare}
                className={clsx(
                  'inline-flex h-full items-center gap-1 rounded-xs px-2 text-meta transition-colors duration-(--duration-instant)',
                  selection.mode === 'compare'
                    ? 'bg-selected font-medium text-ink'
                    : 'text-ink-3 hover:text-ink',
                  allModels.length < 2 && 'cursor-not-allowed opacity-50',
                )}
              >
                <Columns2 size={12} aria-hidden="true" />
                Compare
              </button>
            </div>

            <ModelSelector selection={selection} onChange={onSelectionChange} />

            <span className="flex-1" />

            {streaming ? (
              <IconButton
                size="sm"
                variant="secondary"
                label="Stop generating"
                icon={<Square size={11} aria-hidden="true" className="fill-current" />}
                onClick={onStop}
              />
            ) : (
              <IconButton
                size="sm"
                variant="primary"
                label="Send message"
                icon={<ArrowUp size={14} aria-hidden="true" />}
                disabled={disabled || value.trim().length === 0 || compareInvalid}
                onClick={submit}
              />
            )}
          </div>
        </div>

        <p className="mt-2 h-4 text-center text-micro text-ink-3">
          {disabled && disabledReason ? (
            disabledReason
          ) : focused ? (
            <span className="inline-flex items-center gap-1.5">
              <Kbd keys={['enter']} /> to send
              <span aria-hidden="true">·</span>
              <Kbd keys={['shift', 'enter']} /> for a new line
            </span>
          ) : null}
        </p>
      </form>
    </div>
  );
}
