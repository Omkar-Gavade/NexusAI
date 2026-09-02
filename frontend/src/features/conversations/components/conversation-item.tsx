import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { NavLink, useNavigate, useParams } from 'react-router';
import type { Conversation } from '@nexusai/contracts';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { IconButton } from '@/components/ui/icon-button';
import { Menu } from '@/components/ui/menu';
import { routes } from '@/lib/routes';
import { toast } from '@/stores/toast-store';
import { useDeleteConversation, useRenameConversation } from '../use-conversations';

/**
 * Active state uses three channels — a 2px accent rail, a tinted fill, and a
 * heavier weight — never a filled colour block, which destroys the title's
 * contrast and is the clearest generated-dashboard tell there is.
 *
 * No icon: forty identical document glyphs down a sidebar is noise, and the
 * row's position already says what it is.
 */
export function ConversationItem({ conversation }: { conversation: Conversation }) {
  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const navigate = useNavigate();
  const { conversationId } = useParams();

  const rename = useRenameConversation();
  const remove = useDeleteConversation();

  const onDelete = () => {
    const wasOpen = conversationId === conversation.id;
    remove.mutate(conversation.id, {
      onError: () => toast.error("Couldn't delete that conversation."),
      onSuccess: () => {
        if (wasOpen) navigate(routes.workspace, { replace: true });
      },
    });
    setConfirmingDelete(false);
  };

  if (renaming) {
    return (
      <li>
        <RenameField
          initial={conversation.title}
          pending={rename.isPending}
          onCancel={() => setRenaming(false)}
          onCommit={(title) => {
            setRenaming(false);
            if (title === conversation.title) return;
            rename.mutate(
              { id: conversation.id, title },
              { onError: () => toast.error("Couldn't rename that conversation.") },
            );
          }}
        />
      </li>
    );
  }

  return (
    <li className="group/row relative">
      <NavLink
        to={routes.conversation(conversation.id)}
        onKeyDown={(event) => {
          if (event.key === 'F2') {
            event.preventDefault();
            setRenaming(true);
          }
          if (event.key === 'Delete') {
            event.preventDefault();
            setConfirmingDelete(true);
          }
        }}
        className={({ isActive }) =>
          clsx(
            'relative flex h-7 items-center rounded-control pl-2.5 pr-7 max-lg:h-11',
            'text-nav transition-colors duration-(--duration-instant)',
            isActive ? 'bg-selected font-[550] text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink',
          )
        }
      >
        {({ isActive }) => (
          <>
            {isActive && (
              <span aria-hidden="true" className="absolute inset-y-1 left-0 w-0.5 bg-accent" />
            )}
            <span className="truncate">{conversation.title}</span>
          </>
        )}
      </NavLink>

      {/* Kept in the tab order at all times: hover is not a keyboard gate. */}
      <div className="absolute right-0.5 top-1/2 -translate-y-1/2 opacity-0 focus-within:opacity-100 group-hover/row:opacity-100 max-lg:opacity-100">
        <Menu
          label={`Actions for ${conversation.title}`}
          items={[
            {
              id: 'rename',
              label: 'Rename',
              icon: <Pencil size={13} aria-hidden="true" />,
              run: () => setRenaming(true),
            },
            {
              id: 'delete',
              label: 'Delete',
              tone: 'danger',
              icon: <Trash2 size={13} aria-hidden="true" />,
              run: () => setConfirmingDelete(true),
            },
          ]}
          trigger={(props) => (
            <IconButton
              {...props}
              size="sm"
              label={`Actions for ${conversation.title}`}
              icon={<MoreHorizontal size={14} aria-hidden="true" />}
            />
          )}
        />
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete this conversation?"
        description={`"${conversation.title}" and its messages will be permanently removed. This cannot be undone.`}
        confirmLabel="Delete"
        pending={remove.isPending}
        onConfirm={onDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </li>
  );
}

function RenameField({
  initial,
  pending,
  onCommit,
  onCancel,
}: {
  initial: string;
  pending: boolean;
  onCommit: (title: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initial);

  useEffect(() => {
    ref.current?.select();
  }, []);

  const commit = () => {
    const title = value.trim();
    // An empty title is a slip, not an instruction to erase the name.
    if (!title) return onCancel();
    onCommit(title.slice(0, 120));
  };

  return (
    <input
      ref={ref}
      value={value}
      disabled={pending}
      aria-label="Conversation title"
      maxLength={120}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
      }}
      className="h-7 w-full rounded-control border border-accent bg-canvas px-2 text-ui text-ink max-lg:h-11"
    />
  );
}
