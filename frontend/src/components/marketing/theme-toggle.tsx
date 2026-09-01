import { Moon, Sun } from 'lucide-react';
import { useThemeStore } from '@/stores/theme-store';

/**
 * Light/dark control for the public pages.
 *
 * Two states, not three. The workspace's settings dialog offers `system` as
 * well, which is the right default and the right place for it — but a header
 * toggle exists to answer "I want the other one, now", and cycling through a
 * third state that looks identical to whichever it resolves to makes the
 * control feel broken.
 *
 * Writes through the same store the workspace uses, so a preference set here
 * survives into the app and back.
 */
export function ThemeToggle() {
  const resolved = useThemeStore((s) => s.resolved);
  const setPreference = useThemeStore((s) => s.setPreference);

  const next = resolved === 'dark' ? 'light' : 'dark';
  const Icon = resolved === 'dark' ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={() => setPreference(next)}
      // The label names the destination, not the current state: a control
      // announced as "dark theme" is ambiguous about what pressing it does.
      aria-label={`Switch to ${next} theme`}
      className="grid size-8 place-items-center rounded-control text-ink-3 transition-colors duration-(--duration-instant) hover:bg-hover hover:text-ink"
    >
      <Icon size={15} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}
