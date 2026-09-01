import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';

export interface MenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  run: () => void;
}

/**
 * A small actions menu. Focus moves through real DOM focus rather than
 * aria-activedescendant, because these are commands rather than a value being
 * chosen — the listbox pattern belongs to ModelSelector, not here.
 */
export function Menu({
  trigger,
  items,
  align = 'end',
  label,
}: {
  trigger: (props: {
    ref: React.Ref<HTMLButtonElement>;
    onClick: () => void;
    'aria-expanded': boolean;
    'aria-haspopup': 'menu';
    'aria-controls': string;
  }) => ReactNode;
  items: MenuItem[];
  align?: 'start' | 'end';
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    // Focus the first command so the menu is immediately keyboard-operable.
    listRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus();

    const onPointerDown = (event: PointerEvent) => {
      if (
        !listRef.current?.contains(event.target as Node) &&
        !triggerRef.current?.contains(event.target as Node)
      ) {
        close(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const focusables = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ??
        [],
    );
    const index = focusables.indexOf(document.activeElement as HTMLElement);

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        close();
        break;
      case 'ArrowDown':
        event.preventDefault();
        focusables[Math.min(index + 1, focusables.length - 1)]?.focus();
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusables[Math.max(index - 1, 0)]?.focus();
        break;
      case 'Home':
        event.preventDefault();
        focusables[0]?.focus();
        break;
      case 'End':
        event.preventDefault();
        focusables.at(-1)?.focus();
        break;
      case 'Tab':
        close(false);
        break;
    }
  };

  return (
    <div className="relative">
      {trigger({
        ref: triggerRef,
        onClick: () => setOpen((o) => !o),
        'aria-expanded': open,
        'aria-haspopup': 'menu',
        'aria-controls': id,
      })}

      {open && (
        <div
          ref={listRef}
          id={id}
          role="menu"
          tabIndex={-1}
          aria-label={label}
          onKeyDown={onKeyDown}
          className={clsx(
            'absolute top-full z-(--z-dropdown) mt-1 min-w-[180px] rounded-overlay border border-line',
            'bg-floating p-1 shadow-float motion-safe:animate-[dropdown-in_140ms_var(--ease-out)]',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              aria-disabled={item.disabled || undefined}
              onClick={() => {
                if (item.disabled) return;
                item.run();
                close();
              }}
              className={clsx(
                'flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-ui',
                'transition-colors duration-(--duration-instant) max-md:min-h-11',
                item.disabled
                  ? 'text-ink-off'
                  : item.tone === 'danger'
                    ? 'text-danger hover:bg-danger-quiet'
                    : 'text-ink-2 hover:bg-hover hover:text-ink',
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
