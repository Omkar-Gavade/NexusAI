import { MoreHorizontal, Menu as MenuIcon, PanelLeft, Pencil, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { IconButton } from '@/components/ui/icon-button';
import { Menu } from '@/components/ui/menu';
import { routes } from '@/lib/routes';
import { toast } from '@/stores/toast-store';
import { useDeleteConversation } from '@/features/conversations/use-conversations';
import { useUIStore } from '@/stores/ui-store';

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
