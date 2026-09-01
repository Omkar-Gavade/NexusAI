import { create } from 'zustand';

const COLLAPSED_KEY = 'nexusai.sidebar.collapsed';

/** What the side panel is showing. Only one at a time — two 360px panels leave
 *  no reading measure, so opening one closes the other. */
/** Workspace-level overlays. Only one is ever open. */
export type DialogView = 'none' | 'search' | 'settings';

interface UIStore {
  /** Mobile drawer. */
  drawerOpen: boolean;
  /** Desktop sidebar collapse, persisted. */
  sidebarCollapsed: boolean;
  dialog: DialogView;

  setDrawerOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  openDialog: (view: Exclude<DialogView, 'none'>) => void;
  closeDialog: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  drawerOpen: false,
  sidebarCollapsed: localStorage.getItem(COLLAPSED_KEY) === 'true',
  dialog: 'none',

  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),

  toggleSidebar: () =>
    set((state) => {
      const sidebarCollapsed = !state.sidebarCollapsed;
      localStorage.setItem(COLLAPSED_KEY, String(sidebarCollapsed));
      return { sidebarCollapsed };
    }),

  openDialog: (dialog) => set({ dialog, drawerOpen: false }),
  closeDialog: () => set({ dialog: 'none' }),
}));
