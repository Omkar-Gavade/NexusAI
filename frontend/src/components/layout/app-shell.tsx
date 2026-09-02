import { useEffect, useMemo } from 'react';
import clsx from 'clsx';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { Toaster } from '@/components/ui/toaster';
import { Sidebar } from '@/features/conversations/components/sidebar';
import { SearchDialog } from '@/features/search/search-dialog';
import { SettingsDialog } from '@/features/settings/settings-dialog';
import { useAccountTheme } from '@/features/auth/use-account-theme';
import { routes } from '@/lib/routes';
import { useShortcuts } from '@/lib/use-shortcuts';
import { useUIStore } from '@/stores/ui-store';

/**
 * Owns the drawer, the skip link, the single <main> landmark, and the
 * workspace-level overlays. Below 1024px the sidebar is an off-canvas drawer: a
 * 264px persistent rail would leave less than the reading measure, and that
 * arithmetic is why the breakpoint sits at 1024 rather than a round 1000.
 */
export function AppShell() {
  const { drawerOpen, sidebarCollapsed, setDrawerOpen, dialog, openDialog, closeDialog } =
    useUIStore();

  // Adopts the account's theme once the session arrives, so a preference set on
  // one device follows the account to the next.
  useAccountTheme();

  const location = useLocation();
  const navigate = useNavigate();

  // Navigating is an implicit dismissal of the drawer.
  useEffect(() => setDrawerOpen(false), [location.pathname, setDrawerOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen, setDrawerOpen]);

  const shortcuts = useMemo(
    () => ({
      'mod+k': () => openDialog('search'),
      'mod+shift+n': () => navigate(routes.workspace),
      'mod+,': () => openDialog('settings'),
    }),
    [openDialog, navigate],
  );
  useShortcuts(shortcuts);

  return (
    /* The workspace viewport lock, scoped to the workspace. Sized in viewport
       units rather than percentages so it does not depend on a height chain
       through html/body — that chain is what leaked this constraint onto every
       other route. Children keep using h-full against this definite height. */
    <div className="flex h-dvh overflow-hidden">
      <a className="skip-link" href="#workspace">
        Skip to conversation
      </a>

      <aside
        data-collapsed={sidebarCollapsed || undefined}
        className={clsx(
          'group/side shrink-0 overflow-hidden border-r border-line',
          // Desktop: in flow. Below lg: fixed and translated off-canvas.
          'max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-(--z-drawer) max-lg:w-[280px]',
          'max-lg:transition-transform max-lg:duration-(--duration-slow) max-lg:ease-expand',
          drawerOpen ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full',
          // Collapsing narrows to a rail rather than to nothing, so the border
          // stays put and the workspace reflows instead of jumping.
          'lg:transition-[width] lg:duration-(--duration-slow) lg:ease-expand',
          'motion-reduce:lg:transition-none',
          sidebarCollapsed ? 'lg:w-(--sidebar-rail)' : 'lg:w-(--sidebar-width)',
        )}
        // Off-canvas content stays out of the tab order entirely.
        inert={!drawerOpen && window.innerWidth < 1024 ? true : undefined}
      >
        <Sidebar />
      </aside>

      {drawerOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 z-(--z-scrim) bg-(--scrim) lg:hidden"
        />
      )}

      <main id="workspace" tabIndex={-1} className="flex min-w-0 flex-1 flex-col outline-none">
        <Outlet />
      </main>

      <SearchDialog open={dialog === 'search'} onClose={closeDialog} />
      <SettingsDialog open={dialog === 'settings'} onClose={closeDialog} />
      <Toaster />
    </div>
  );
}
