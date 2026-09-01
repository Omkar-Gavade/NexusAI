import { Link } from 'react-router';
import { routes } from '@/lib/routes';

export function NotFoundPage() {
  return (
    <div className="grid min-h-dvh place-items-center p-6">
      <div className="text-center">
        <p data-register="machine" className="text-note uppercase text-ink-3">
          404
        </p>
        <h1 className="mt-2 text-title font-[550]">That page doesn&apos;t exist.</h1>
        <Link to={routes.workspace} className="mt-4 inline-block text-ui text-accent hover:underline">
          Start a new conversation
        </Link>
      </div>
    </div>
  );
}
