import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import clsx from 'clsx';

/**
 * Built on the native <dialog> with showModal(). Focus trapping, an inert
 * background, Escape handling and top-layer stacking all come from the
 * platform; a hand-rolled trap is ~120 lines that reimplements this worse.
 *
 * Below 640px it renders as a bottom sheet.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  initialFocusRef,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  /** Focus target on open. Defaults to the platform's own choice. */
  initialFocusRef?: RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) {
      node.showModal();
      // Deferred a frame so the element is in the top layer before focusing.
      if (initialFocusRef) requestAnimationFrame(() => initialFocusRef.current?.focus());
    }
    if (!open && node.open) node.close();
  }, [open, initialFocusRef]);

  return (
    /* A click landing on the <dialog> itself is a click on the backdrop — the
       content sits in a child, so this cannot fire from inside. The keyboard
       equivalent (Escape) is handled natively by the platform, which is exactly
       what these rules ask for; they just cannot see the platform behaviour. */
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      aria-labelledby="dialog-title"
      aria-describedby={description ? 'dialog-description' : undefined}
      className={clsx(
        'm-0 w-full bg-transparent p-0 text-ink backdrop:bg-(--scrim)',
        'max-sm:mt-auto max-sm:max-w-none',
        'sm:m-auto sm:max-w-[460px]',
      )}
    >
      <div
        className={clsx(
          'border border-line bg-floating p-6 shadow-modal',
          'max-sm:rounded-t-overlay sm:rounded-overlay',
          'motion-safe:animate-[dialog-in_180ms_var(--ease-out)]',
        )}
      >
        <h2 id="dialog-title" className="text-title font-[550]">
          {title}
        </h2>
        {description && (
          <p id="dialog-description" className="mt-2 text-ui text-ink-2">
            {description}
          </p>
        )}
        {children && <div className="mt-4">{children}</div>}
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </dialog>
  );
}
