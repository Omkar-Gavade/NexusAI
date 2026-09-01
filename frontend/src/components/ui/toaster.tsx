import { useEffect, useRef } from 'react';
import clsx from 'clsx';
import { X } from 'lucide-react';
import { useToastStore, type Toast } from '@/stores/toast-store';
import { IconButton } from './icon-button';

const DISMISS_AFTER = 5000;

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div
      // Not aria-live on the container: each toast announces itself with the
      // role matching its severity, so a neutral confirmation does not interrupt.
      className="pointer-events-none fixed bottom-4 right-4 z-(--z-toast) flex w-[min(360px,calc(100vw-32px))] flex-col gap-2 max-sm:left-4 max-sm:right-4 max-sm:w-auto"
    >
      {toasts.map((toast) => (
        <ToastRow key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

function ToastRow({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const paused = useRef(false);

  useEffect(() => {
    // A toast carrying an action does not expire: the user has to be able to
    // reach the action, and five seconds is not enough to notice and decide.
    if (toast.action) return;

    const timer = window.setInterval(() => {
      if (!paused.current) {
        window.clearInterval(timer);
        dismiss(toast.id);
      }
    }, DISMISS_AFTER);

    return () => window.clearInterval(timer);
  }, [toast.id, toast.action, dismiss]);

  return (
    <div
      role={toast.tone === 'danger' ? 'alert' : 'status'}
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
      onFocus={() => (paused.current = true)}
      onBlur={() => (paused.current = false)}
      className={clsx(
        'pointer-events-auto flex items-center gap-3 rounded-overlay border bg-floating p-3 shadow-float',
        'motion-safe:animate-[toast-in_180ms_var(--ease-out)]',
        toast.tone === 'danger' ? 'border-danger/40' : 'border-line',
      )}
    >
      <p className="min-w-0 flex-1 text-ui text-ink">{toast.message}</p>

      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.run();
            dismiss(toast.id);
          }}
          className="shrink-0 rounded-control px-2 py-1 text-ui font-[550] text-accent hover:bg-hover"
        >
          {toast.action.label}
        </button>
      )}

      <IconButton
        size="sm"
        label="Dismiss"
        icon={<X size={13} aria-hidden="true" />}
        onClick={() => dismiss(toast.id)}
      />
    </div>
  );
}
