import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router';
import { Logo } from '@/components/ui/logo';
import { HomePage } from '@/pages/home/home-page';
import { LoginPage } from '@/pages/auth/login-page';
import { NotFoundPage } from '@/pages/not-found-page';
import { RegisterPage } from '@/pages/auth/register-page';
import { routePatterns } from '@/lib/routes';
import { RequireAuth } from './require-auth';

/**
 * The authenticated workspace is a separate chunk. Someone landing on the
 * marketing page should not download the chat surface, the markdown renderer,
 * or the model selector to read it.
 */
const AppShell = lazy(async () => ({
  default: (await import('@/components/layout/app-shell')).AppShell,
}));
const ConversationPage = lazy(async () => ({
  default: (await import('@/pages/app/conversation-page')).ConversationPage,
}));

function WorkspaceFallback() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <Logo size={22} className="text-ink-3" />
      <span className="sr-only">Loading workspace</span>
    </div>
  );
}

function Workspace() {
  return (
    <Suspense fallback={<WorkspaceFallback />}>
      <AppShell />
    </Suspense>
  );
}

export const router = createBrowserRouter([
  // Public
  // The public surface is one page. It is eagerly loaded rather than lazy:
  // it is the first thing anyone sees, and a chunk boundary in front of it
  // buys a blank frame instead of a paint.
  { path: routePatterns.home, element: <HomePage /> },
  { path: routePatterns.login, element: <LoginPage /> },
  { path: routePatterns.register, element: <RegisterPage /> },

  // Product — everything behind /app is authenticated.
  {
    element: <RequireAuth />,
    children: [
      {
        path: routePatterns.workspace,
        element: <Workspace />,
        children: [
          { index: true, element: <ConversationPage /> },
          { path: routePatterns.conversation, element: <ConversationPage /> },
        ],
      },
    ],
  },

  { path: routePatterns.notFound, element: <NotFoundPage /> },
]);
