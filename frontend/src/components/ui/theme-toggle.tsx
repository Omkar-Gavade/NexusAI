import { Moon, Sun } from 'lucide-react';
import { useThemeStore } from '@/stores/theme-store';
import { useAccountTheme } from '@/features/auth/use-account-theme';

/**
 * Light/dark control, shared by the marketing header and the workspace.
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
  // Writes locally and, when there is a session, through to the account — so
  // the preference follows the user rather than the browser. Signed out, on
  // the marketing pages, it is local only.
  const { setTheme } = useAccountTheme();

  const next = resolved === 'dark' ? 'light' : 'dark';
  const Icon = resolved === 'dark' ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      // The label names the destination, not the current state: a control
      // announced as "dark theme" is ambiguous about what pressing it does.
      aria-label={`Switch to ${next} theme`}
      // The 32px box is the visual size; below the desktop breakpoint the hit
      // area grows to the 44px touch minimum without changing layout. This is
      // the same `before:` treatment `IconButton` uses — the control is
      // hand-rolled rather than an `IconButton` because it renders its own
      // icon from the resolved theme, and it had been missing the hit area
      // that every other icon control in the product has.
      className="relative grid size-8 place-items-center rounded-control text-ink-3 transition-colors duration-(--duration-instant) hover:bg-hover hover:text-ink before:absolute before:left-1/2 before:top-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[''] lg:before:hidden"
    >
      <Icon size={15} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}
