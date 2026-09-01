const IS_APPLE =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '');

const SYMBOLS: Record<string, string> = {
  mod: IS_APPLE ? '⌘' : 'Ctrl',
  shift: '⇧',
  alt: IS_APPLE ? '⌥' : 'Alt',
  enter: '↵',
  escape: 'Esc',
};

/** Keyboard hints are machine register: the system assigned them. */
export function Kbd({ keys }: { keys: string[] }) {
  return (
    <span data-register="machine" className="text-note text-ink-3 shrink-0" aria-hidden="true">
      {keys.map((key) => SYMBOLS[key] ?? key.toUpperCase()).join(IS_APPLE ? '' : '+')}
    </span>
  );
}
