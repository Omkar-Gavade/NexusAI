import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { ErrorBoundary } from './app/error-boundary';
import { Providers } from './app/providers';
import { router } from './app/router';
// Self-hosted Inter (variable weight); each subset loads only when used.
import '@fontsource-variable/inter';
import './styles/tokens.css';
import './styles/base.css';
import './styles/markdown.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root');

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    </ErrorBoundary>
  </StrictMode>,
);
