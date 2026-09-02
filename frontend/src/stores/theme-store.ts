import { create } from 'zustand';
import type { ThemePreference } from '@nexusai/contracts';

const STORAGE_KEY = 'nexusai.theme';

type Resolved = 'dark' | 'light';

interface ThemeStore {
  preference: ThemePreference;
  resolved: Resolved;
  /**
   * Whether this device holds a theme the person actually picked, as opposed
   * to the `system` default it starts on.
   *
   * `preference` alone cannot answer that: `system` is both "never chose" and
   * a choice someone can make in Settings, and those two have to be told apart
   * when an account preference arrives and something has to win.
   */
  chosen: boolean;
  setPreference: (preference: ThemePreference) => void;
  /** Re-resolves when the OS theme changes while the preference is `system`. */
  syncWithSystem: () => void;
}

function systemTheme(): Resolved {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function resolve(preference: ThemePreference): Resolved {
  return preference === 'system' ? systemTheme() : preference;
}

/** The stored preference, or `null` when this device has never had one set. */
function readStored(): ThemePreference | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'dark' || stored === 'light' || stored === 'system' ? stored : null;
}

/**
 * Applying the theme is an attribute write, not a re-render: every colour is a
 * custom property, so the whole palette swaps with no React work and no flicker.
 * The transition is deliberately not animated — animating thirty colour
 * properties across the tree is exactly the decorative cost this design rejects.
 */
function apply(resolved: Resolved): void {
  const root = document.documentElement;
  root.dataset.theme = resolved;

  // Read the canvas back off the element rather than repeating its value here:
  // tokens.css is the single source of visual truth, and a second copy of the
  // background colour is a copy that will eventually disagree with the first.
  const canvas = getComputedStyle(root).getPropertyValue('--surface-canvas').trim();
  if (canvas) {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', canvas);
  }
}

const storedPreference = readStored();
const initialPreference = storedPreference ?? 'system';

export const useThemeStore = create<ThemeStore>((set, get) => ({
  preference: initialPreference,
  resolved: resolve(initialPreference),
  chosen: storedPreference !== null,

  setPreference: (preference) => {
    localStorage.setItem(STORAGE_KEY, preference);
    const resolved = resolve(preference);
    apply(resolved);
    // Writing it is the choice. Everything after this treats the value as the
    // person's own rather than as the default they were given.
    set({ preference, resolved, chosen: true });
  },

  syncWithSystem: () => {
    if (get().preference !== 'system') return;
    const resolved = systemTheme();
    apply(resolved);
    set({ resolved });
  },
}));
