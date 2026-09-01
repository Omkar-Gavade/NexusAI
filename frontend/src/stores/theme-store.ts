import { create } from 'zustand';
import type { ThemePreference } from '@nexusai/contracts';

const STORAGE_KEY = 'nexusai.theme';

type Resolved = 'dark' | 'light';

interface ThemeStore {
  preference: ThemePreference;
  resolved: Resolved;
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

function readStored(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'dark' || stored === 'light' || stored === 'system' ? stored : 'system';
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

const initialPreference = readStored();

export const useThemeStore = create<ThemeStore>((set, get) => ({
  preference: initialPreference,
  resolved: resolve(initialPreference),

  setPreference: (preference) => {
    localStorage.setItem(STORAGE_KEY, preference);
    const resolved = resolve(preference);
    apply(resolved);
    set({ preference, resolved });
  },

  syncWithSystem: () => {
    if (get().preference !== 'system') return;
    const resolved = systemTheme();
    apply(resolved);
    set({ resolved });
  },
}));
