import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient } from '@/test/render';
import { useUIStore } from '@/stores/ui-store';
import { Sidebar } from '@/features/conversations/components/sidebar';

vi.mock('@/features/conversations/use-conversations', () => ({
  useConversations: () => ({ data: { conversations: [] }, isPending: false, isError: false }),
  conversationsKey: ['conversations'],
  useDeleteConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));

/**
 * Collapsing narrows the sidebar to a rail; it does not remove it.
 *
 * The previous behaviour was `lg:w-0`, so the panel vanished and the workspace
 * lurched sideways with no transition — the collapse had no animation at
 * desktop widths at all, because the only transition on the element was scoped
 * `max-lg:` for the mobile drawer.
 */
function setup() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => useUIStore.setState({ sidebarCollapsed: false, drawerOpen: false }));

describe('sidebar collapse', () => {
  it('offers a control that collapses, and one that expands again', async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole('button', { name: /collapse sidebar/i }));
    expect(useUIStore.getState().sidebarCollapsed).toBe(true);

    // The rail's own control is what brings it back — a collapsed sidebar that
    // cannot be reopened from itself is a dead end.
    await user.click(screen.getByRole('button', { name: /expand sidebar/i }));
    expect(useUIStore.getState().sidebarCollapsed).toBe(false);
  });

  it('keeps identity and the primary action reachable while collapsed', () => {
    setup();
    // Rendered regardless of state; CSS decides which half is visible, so both
    // are always in the accessibility tree for the breakpoint that shows them.
    expect(screen.getByRole('button', { name: /expand sidebar/i })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /nexusai home/i }).length).toBeGreaterThan(0);
    // Two: the full sidebar's row and the rail's icon button. Both stay
    // mounted and CSS shows whichever the breakpoint and state call for, so
    // collapsing never removes the action from the tree.
    expect(screen.getAllByRole('button', { name: /^new conversation$/i }).length).toBe(2);
  });
});
