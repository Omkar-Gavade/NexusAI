import { useEffect } from 'react';

const MOD = /Mac|iPhone|iPad/.test(
  typeof navigator === 'undefined' ? '' : (navigator.platform ?? ''),
)
  ? 'metaKey'
  : 'ctrlKey';

type Binding = Record<string, () => void>;

/** True when the keystroke belongs to whatever the user is typing into. */
function isEditing(target: EventTarget | null): boolean {
  const node = target as HTMLElement | null;
  if (!node) return false;
  return (
    node.tagName === 'INPUT' ||
    node.tagName === 'TEXTAREA' ||
    node.isContentEditable === true
  );
}

/**
 * Global shortcuts. Modifier combinations fire even while typing — they are
 * unambiguous — while bare keys are suppressed inside a field so they cannot
 * swallow ordinary input.
 */
export function useShortcuts(bindings: Binding) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modified = event[MOD];
      const key = event.key.toLowerCase();
      const combo = `${modified ? 'mod+' : ''}${event.shiftKey ? 'shift+' : ''}${key}`;

      const handler = bindings[combo];
      if (!handler) return;
      if (!modified && isEditing(event.target)) return;

      event.preventDefault();
      handler();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [bindings]);
}
