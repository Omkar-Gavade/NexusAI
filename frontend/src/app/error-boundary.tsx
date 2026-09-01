import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  /** Rendered instead of the default full-page recovery screen. */
  fallback?: (reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render errors only. Async and network failures are handled by query
 * state and by the stream's own error events — a boundary that swallows those
 * turns a recoverable error into a blank screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Render error', error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.reset);

    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <div className="max-w-(--measure-answer) text-center">
          <h1 className="text-title font-[550]">Something went wrong.</h1>
          <p className="mt-2 text-ui text-ink-2">
            The page stopped rendering. Reloading usually clears it.
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Button onClick={this.reset}>Try again</Button>
            <Button variant="primary" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
