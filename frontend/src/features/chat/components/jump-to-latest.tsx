import { ArrowDown } from 'lucide-react';

/** Appears only when following has been interrupted, and says why it is there. */
export function JumpToLatest({ onClick }: { onClick: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
      <button
        type="button"
        onClick={onClick}
        className="pointer-events-auto inline-flex h-(--control-md) items-center gap-1.5 rounded-control border border-line bg-floating px-3 text-ui text-ink-2 shadow-float transition-colors duration-(--duration-instant) hover:text-ink motion-safe:animate-[toast-in_180ms_var(--ease-out)]"
      >
        <ArrowDown size={13} aria-hidden="true" />
        Jump to latest
      </button>
    </div>
  );
}
