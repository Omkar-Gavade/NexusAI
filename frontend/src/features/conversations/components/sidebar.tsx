import { Link, useNavigate } from 'react-router';
import { LogOut, PanelLeft, Plus, Search, Settings } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { Kbd } from '@/components/ui/kbd';
import { Logo, Wordmark } from '@/components/ui/logo';
import { Rule } from '@/components/ui/rule';
import { Skeleton } from '@/components/ui/skeleton';
import { Menu } from '@/components/ui/menu';
import { useLogout, useSession } from '@/features/auth/use-session';
import { routes } from '@/lib/routes';
import { useUIStore } from '@/stores/ui-store';
import { groupByRecency } from '../group-by-recency';
import { useConversations } from '../use-conversations';
import { ConversationItem } from './conversation-item';

/**
 * Workspace chrome, not a dashboard menu. Dense rows, one accent, no badges
 * except real counts, and group headers that are measure rules rather than
 * headings floating above full-bleed lines.
 */
export function Sidebar() {
  const navigate = useNavigate();
  const { data, isPending, isError } = useConversations();
  const { data: user } = useSession();
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const setDrawerOpen = useUIStore((s) => s.setDrawerOpen);
  const openDialog = useUIStore((s) => s.openDialog);
  const logout = useLogout();

  const groups = data ? groupByRecency(data.conversations) : [];

  return (
    <div className="flex h-full flex-col bg-workspace">
      <div className="flex h-11 items-center gap-2 border-b border-line px-2.5">
        <Link
          to={routes.workspace}
          className="flex items-center gap-2 rounded-control text-ink"
          aria-label="NexusAI home"
        >
          <Logo size={18} className="text-ink-2" />
          <Wordmark />
        </Link>
        <span className="flex-1" />
        <IconButton
          size="sm"
          label="Collapse sidebar"
          icon={<PanelLeft size={14} aria-hidden="true" />}
          onClick={() => {
            toggleSidebar();
            setDrawerOpen(false);
          }}
        />
      </div>

      <nav aria-label="Conversations and projects" className="flex-1 overflow-y-auto p-2">
        <ul className="flex flex-col">
          <li>
            <button
              type="button"
              onClick={() => {
                navigate(routes.workspace);
                setDrawerOpen(false);
              }}
              className="flex h-7 w-full items-center gap-2 rounded-control px-2 text-ui text-ink-2 transition-colors duration-(--duration-instant) hover:bg-hover hover:text-ink max-lg:h-11"
            >
              <Plus size={14} aria-hidden="true" className="shrink-0 text-ink-3" />
              <span className="flex-1 text-left">New conversation</span>
              <Kbd keys={['mod', 'shift', 'n']} />
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => openDialog('search')}
              className="flex h-7 w-full items-center gap-2 rounded-control px-2 text-ui text-ink-2 transition-colors duration-(--duration-instant) hover:bg-hover hover:text-ink max-lg:h-11"
            >
              <Search size={14} aria-hidden="true" className="shrink-0 text-ink-3" />
              <span className="flex-1 text-left">Search</span>
              <Kbd keys={['mod', 'k']} />
            </button>
          </li>
        </ul>

        {isPending && (
          <div className="mt-4 flex flex-col gap-1.5 px-1">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} height={20} width={`${88 - i * 7}%`} />
            ))}
          </div>
        )}

        {isError && (
          <p className="mt-4 px-2 text-micro text-ink-3">
            Couldn&apos;t load conversations. They&apos;ll reappear when the connection returns.
          </p>
        )}

        {data && groups.length === 0 && (
          <p className="mt-4 px-2 text-micro text-ink-3">
            Conversations you start will be listed here.
          </p>
        )}

        {groups.map((group) => (
          <section key={group.label} className="mt-3">
            <Rule label={group.label} className="mb-1 px-1" />
            <ul className="flex flex-col">
              {group.conversations.map((conversation) => (
                <ConversationItem key={conversation.id} conversation={conversation} />
              ))}
            </ul>
          </section>
        ))}
      </nav>

      <div className="border-t border-line p-2">
        <Menu
          align="start"
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
              className="flex h-9 w-full items-center gap-2 rounded-control px-2 text-ui text-ink-2 transition-colors duration-(--duration-instant) hover:bg-hover hover:text-ink"
            >
              <span
                aria-hidden="true"
                className="grid size-[18px] shrink-0 place-items-center rounded-full bg-raised text-note text-ink-2"
              >
                {user?.displayName.charAt(0).toUpperCase() ?? '\u2014'}
              </span>
              <span className="flex-1 truncate text-left">
                {user?.displayName ?? 'Not signed in'}
              </span>
            </button>
          )}
        />
      </div>
    </div>
  );
}
