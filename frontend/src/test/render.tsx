import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
}

/**
 * Renders inside the providers a workspace component actually depends on.
 *
 * `route` seeds the router's location, which is how anything reading a query
 * parameter — the `?next=` destination on the auth pages — can be tested at all.
 */
export function render(
  ui: ReactElement,
  { client = createTestQueryClient(), route = '/' } = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  }
  return { client, ...rtlRender(ui, { wrapper: Wrapper }) };
}

// Named re-exports rather than `export *`: a star export of testing-library
// also carries its own `render`, which shadows the wrapper above and produces
// a component rendered with no QueryClient.
export { screen, waitFor, within, fireEvent, act, cleanup } from '@testing-library/react';
