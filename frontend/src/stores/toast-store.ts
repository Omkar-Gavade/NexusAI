import { create } from 'zustand';

export type ToastTone = 'neutral' | 'danger';

export interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
  action?: { label: string; run: () => void };
}

interface ToastStore {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id'>) => string;
  dismiss: (id: string) => void;
}

/** At most three. A fourth replaces the oldest rather than growing a column. */
const MAX_VISIBLE = 3;

let sequence = 0;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  push: (toast) => {
    const id = `toast-${(sequence += 1)}`;
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }].slice(-MAX_VISIBLE) }));
    return id;
  },

  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

/**
 * Toasts confirm actions that happen away from the reading surface. A failure
 * with a visible location belongs inline, next to the thing that failed —
 * a toast detaches the problem from its context and then disappears.
 */
export const toast = {
  show: (message: string, action?: Toast['action']) =>
    useToastStore.getState().push(action ? { message, tone: 'neutral', action } : { message, tone: 'neutral' }),
  error: (message: string, action?: Toast['action']) =>
    useToastStore.getState().push(action ? { message, tone: 'danger', action } : { message, tone: 'danger' }),
};
