import { lazy, Suspense, type ReactNode } from 'react';
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
const HowItWorksPage = lazy(async () => ({
  default: (await import('@/pages/marketing/how-it-works-page')).HowItWorksPage,
}));
const SynthesisPage = lazy(async () => ({
  default: (await import('@/pages/marketing/synthesis-page')).SynthesisPage,
}));
const UseCasesPage = lazy(async () => ({
  default: (await import('@/pages/marketing/use-cases-page')).UseCasesPage,
}));
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

/**
 * Marketing pages load behind a blank canvas rather than a spinner: they are
 * small chunks on the same origin, and a spinner that flashes for 40ms reads as
 * jank rather than as progress.
 */
function MarketingRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div className="min-h-dvh bg-canvas" />}>{children}</Suspense>;
}

export const router = createBrowserRouter([
  // Public
  { path: routePatterns.home, element: <HomePage /> },
  // Marketing pages are lazy: the homepage should not pay for the
  // page's currency list, and none of them should pull in the workspace.
  {
    path: routePatterns.howItWorks,
    element: (
      <MarketingRoute>
        <HowItWorksPage />
      </MarketingRoute>
    ),
  },
  {
    path: routePatterns.synthesis,
    element: (
      <MarketingRoute>
        <SynthesisPage />
      </MarketingRoute>
    ),
  },
  {
    path: routePatterns.useCases,
    element: (
      <MarketingRoute>
        <UseCasesPage />
      </MarketingRoute>
    ),
  },

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
