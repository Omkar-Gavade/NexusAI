import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { ArrowUp, Paperclip, Square } from 'lucide-react';
import type { ChatSelection } from '@nexusai/contracts';
import { IconButton } from '@/components/ui/icon-button';
import { Kbd } from '@/components/ui/kbd';
import { ModelSelector } from '@/features/models/components/model-selector';
import { AttachmentTray, type Attachment } from './attachment-tray';

interface ComposerProps {
  selection: ChatSelection;
  onSelectionChange: (selection: ChatSelection) => void;
  onSend: (prompt: string) => void;
  onStop: () => void;
  streaming: boolean;
  /** Disabled when no real model is configured, or when offline. */
  disabled: boolean;
  disabledReason?: string | undefined;
}

/**
 * A precision tool, not a floating pill.
 *
 * Only four controls are ever visible — attach, routing, send, and the
 * attachment tray when populated. Everything else lives behind the routing
 * dropdown, so the composer is powerful without looking complicated.
 */
export function Composer({
  selection,
  onSelectionChange,
  onSend,
  onStop,
  streaming,
  disabled,
  disabledReason,
}: ComposerProps) {
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  // Stays empty until an upload endpoint exists. Nothing here is simulated:
  // with no way to upload, there is nothing to show.
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const textarea = useRef<HTMLTextAreaElement>(null);

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

  const submit = () => {
    const prompt = value.trim();
    if (!prompt || disabled || streaming) return;
    onSend(prompt);
    setValue('');
  };

  return (
    <div className="px-(--gutter) pb-4 max-lg:px-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        aria-label="Message composer"
        className="mx-auto w-full max-w-(--measure-answer)"
      >
        <div
          className={clsx(
            'rounded-control border bg-workspace p-3 transition-colors duration-(--duration-instant)',
            focused ? 'border-accent' : 'border-line-control',
            disabled && 'opacity-60',
          )}
        >
          <label htmlFor="composer" className="sr-only">
            Ask anything
          </label>
          <textarea
            ref={textarea}
            id="composer"
            rows={1}
            value={value}
            disabled={disabled}
            placeholder="Ask anything…"
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
              'bg-transparent text-body text-ink outline-none placeholder:text-ink-off',
              // 16px on small viewports defeats iOS zoom-on-focus.
              'max-md:text-[16px]',
            )}
          />

          <AttachmentTray
            attachments={attachments}
            onRemove={(id) => setAttachments((list) => list.filter((a) => a.id !== id))}
            onRetry={() => undefined}
          />

          <div className="mt-2 flex items-center gap-2">
            <IconButton
              size="sm"
              label="Attach a file — not available yet"
              icon={<Paperclip size={14} aria-hidden="true" />}
              disabled
            />

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
                disabled={disabled || value.trim().length === 0}
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
