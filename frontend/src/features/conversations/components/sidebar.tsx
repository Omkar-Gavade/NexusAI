import { Link, useNavigate } from 'react-router';
import { ChevronsUpDown, LogOut, PanelLeft, Plus, Search, Settings } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { Kbd } from '@/components/ui/kbd';
import { Logo, Wordmark } from '@/components/ui/logo';
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
    <div className="h-full bg-workspace">
      <SidebarRail />

      {/* The full sidebar. Hidden at desktop widths while collapsed; below `lg`
          the sidebar is a drawer, where collapsing does not apply at all. */}
      <div className="flex h-full flex-col lg:group-data-[collapsed]/side:hidden">
      <div className="flex h-14 items-center gap-2 px-3.5">
        <Link
          to={routes.workspace}
          className="flex items-center gap-2.5 rounded-control text-ink"
          aria-label="NexusAI home"
        >
          <Logo size={24} />
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

      <nav aria-label="Conversations and projects" className="flex-1 overflow-y-auto px-2.5 pb-3">
        <ul className="flex flex-col gap-1.5">
          <li>
            <button
              type="button"
              onClick={() => {
                navigate(routes.workspace);
                setDrawerOpen(false);
              }}
              className="group flex h-10 w-full items-center gap-2.5 rounded-control border border-line bg-raised px-3 text-ui font-medium text-ink shadow-float transition-[border-color,background-color] duration-(--duration-instant) hover:border-line-strong hover:bg-hover max-lg:h-11"
            >
              <span className="grid size-5 shrink-0 place-items-center rounded-md bg-brand text-white">
                <Plus size={13} strokeWidth={2.5} aria-hidden="true" />
              </span>
              <span className="flex-1 text-left">New conversation</span>
              <Kbd keys={['mod', 'shift', 'n']} />
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => openDialog('search')}
              className="flex h-9 w-full items-center gap-2.5 rounded-control px-3 text-ui text-ink-3 transition-colors duration-(--duration-instant) hover:bg-hover hover:text-ink max-lg:h-11"
            >
              <Search size={15} aria-hidden="true" className="shrink-0" />
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
          <section key={group.label} className="mt-5" aria-label={group.label}>
            <h2 className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
              {group.label}
            </h2>
            <ul className="flex flex-col">
              {group.conversations.map((conversation) => (
                <ConversationItem key={conversation.id} conversation={conversation} />
              ))}
            </ul>
          </section>
        ))}
      </nav>

      <div className="border-t border-line-subtle p-2.5">
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
              className="flex h-12 w-full items-center gap-2.5 rounded-control px-2 text-left transition-colors duration-(--duration-instant) hover:bg-hover"
            >
              <span
                aria-hidden="true"
                className="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-[13px] font-semibold text-white"
              >
                {user?.displayName.charAt(0).toUpperCase() ?? '\u2014'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-ui font-medium text-ink">
                  {user?.displayName ?? 'Not signed in'}
                </span>
                {user?.email && (
                  <span className="block truncate text-[12px] text-ink-3">{user.email}</span>
                )}
              </span>
              <ChevronsUpDown size={14} aria-hidden="true" className="shrink-0 text-ink-3" />
            </button>
          )}
        />
      </div>
      </div>
    </div>
  );
}

/**
 * The collapsed sidebar.
 *
 * Collapsing narrows to this rather than to nothing: the workspace keeps its
 * left edge, so the interaction reads as the panel narrowing instead of
 * vanishing and dragging the conversation sideways. It carries only what is
 * worth a permanent 52px — identity, the way back, and the one action that
 * starts work.
 */
function SidebarRail() {
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const navigate = useNavigate();

  return (
    <div className="hidden h-full flex-col items-center gap-1 py-2.5 lg:group-data-[collapsed]/side:flex">
      <Link
        to={routes.workspace}
        aria-label="NexusAI home"
        className="grid size-9 place-items-center rounded-control text-ink-2 hover:text-ink"
      >
        <Logo size={24} />
      </Link>

      <IconButton
        size="md"
        label="Expand sidebar"
        icon={<PanelLeft size={15} aria-hidden="true" />}
        onClick={toggleSidebar}
      />

      <IconButton
        size="md"
        label="New conversation"
        icon={<Plus size={15} aria-hidden="true" />}
        onClick={() => navigate(routes.workspace)}
      />
    </div>
  );
}
