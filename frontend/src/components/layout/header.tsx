import { LogOut, MoreHorizontal, Menu as MenuIcon, PanelLeft, Pencil, Settings, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { IconButton } from '@/components/ui/icon-button';
import { Menu } from '@/components/ui/menu';
import { routes } from '@/lib/routes';
import { toast } from '@/stores/toast-store';
import { useDeleteConversation } from '@/features/conversations/use-conversations';
import { useUIStore } from '@/stores/ui-store';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useLogout, useSession } from '@/features/auth/use-session';

/**
 * 44px rather than 48: the header carries one title and a couple of controls,
 * and every pixel of chrome height is taken from the reading area.
 */
export function Header({
  title,
  conversationId,
  onRename,
}: {
  title: string;
  conversationId: string | null;
  onRename?: () => void;
}) {
  const { sidebarCollapsed, toggleSidebar, setDrawerOpen } = useUIStore();
  const [confirming, setConfirming] = useState(false);
  const remove = useDeleteConversation();
  const navigate = useNavigate();

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-1.5 border-b border-line px-2.5">
      <IconButton
        label="Open navigation"
        icon={<MenuIcon size={16} aria-hidden="true" />}
        onClick={() => setDrawerOpen(true)}
        className="lg:hidden"
      />

      {sidebarCollapsed && (
        <IconButton
          label="Expand sidebar"
          icon={<PanelLeft size={15} aria-hidden="true" />}
          onClick={toggleSidebar}
          className="max-lg:hidden"
        />
      )}

      <h2 className="min-w-0 flex-1 truncate text-ui text-ink-2">{title}</h2>

      {conversationId && (
        <Menu
          label="Conversation actions"
          items={[
            ...(onRename
              ? [
                  {
                    id: 'rename',
                    label: 'Rename',
                    icon: <Pencil size={13} aria-hidden="true" />,
                    run: onRename,
                  },
                ]
              : []),
            {
              id: 'delete',
              label: 'Delete conversation',
              tone: 'danger' as const,
              icon: <Trash2 size={13} aria-hidden="true" />,
              run: () => setConfirming(true),
            },
          ]}
          trigger={(props) => (
            <IconButton
              {...props}
              label="Conversation actions"
              icon={<MoreHorizontal size={16} aria-hidden="true" />}
            />
          )}
        />
      )}

      {/* Global controls, right of the per-conversation ones. They stay put
          while the sidebar collapses, which is what makes them the reliable
          home for identity and theme. */}
      <span aria-hidden="true" className="mx-1 h-4 w-px bg-line-subtle" />
      <ThemeToggle />
      <AccountMenu />

      <ConfirmDialog
        open={confirming}
        title="Delete this conversation?"
        description={`"${title}" and its messages will be permanently removed. This cannot be undone.`}
        confirmLabel="Delete"
        pending={remove.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          if (!conversationId) return;
          remove.mutate(conversationId, {
            onError: () => toast.error("Couldn't delete that conversation."),
            onSuccess: () => navigate(routes.workspace, { replace: true }),
          });
          setConfirming(false);
        }}
      />
    </header>
  );
}

/**
 * Identity and the actions attached to it.
 *
 * The sidebar shows who is signed in; this is the control that is always
 * reachable, including while the sidebar is collapsed to its rail. It offers
 * only what the backend actually supports — settings and sign-out — rather
 * than a menu of plausible-looking entries.
 */
function AccountMenu() {
  const { data: user } = useSession();
  const logout = useLogout();
  const openDialog = useUIStore((s) => s.openDialog);

  return (
    <Menu
      align="end"
      label="Account"
      items={[
        {
          id: 'settings',
          label: 'Settings',
          icon: <Settings size={13} aria-hidden="true" />,
          run: () => openDialog('settings'),
        },
        {
          id: 'logout',
          label: 'Sign out',
          icon: <LogOut size={13} aria-hidden="true" />,
          run: () => logout.mutate(),
        },
      ]}
      trigger={(props) => (
        <button
          {...props}
          type="button"
          aria-label={user ? `Account: ${user.displayName}` : 'Account'}
          className="grid size-7 shrink-0 place-items-center rounded-full bg-raised text-meta text-ink-2 transition-colors duration-(--duration-instant) hover:bg-hover hover:text-ink"
        >
          {user?.displayName.charAt(0).toUpperCase() ?? '\u2014'}
        </button>
      )}
    />
  );
}
