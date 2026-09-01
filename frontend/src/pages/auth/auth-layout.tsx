import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Logo, Wordmark } from '@/components/ui/logo';
import { routes } from '@/lib/routes';

/**
 * The frame both auth pages share.
 *
 * A single bordered card on the calm canvas field, not a marketing page wrapped
 * around a form: someone arriving here has already decided, and the page's only
 * job is to be unambiguous. Same tokens, same two type registers and the same
 * radius ceiling as the workspace, so signing in does not feel like leaving the
 * product and coming back.
 *
 * The wordmark sits above the card rather than inside it — it is the anchor
 * that says which product this is, and it doubles as the way back out. Field
 * labels stay left-aligned inside a centred card, because centred form labels
 * are harder to scan and gain nothing.
 */
export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4 py-12">
      <div className="w-full max-w-[400px]">
        <div className="flex justify-center">
          <Link
            to={routes.home}
            aria-label="NexusAI home"
            className="inline-flex items-center gap-2 rounded-control"
          >
            <Logo size={18} className="text-ink-2" />
            <Wordmark />
          </Link>
        </div>

        <div className="mt-7 rounded-overlay border border-line bg-raised p-7">
          <h1 className="text-section font-[550] text-ink">{title}</h1>
          <p className="mt-1.5 text-ui text-ink-2">{description}</p>

          <div className="mt-7">{children}</div>
        </div>

        <p className="mt-5 text-center text-ui text-ink-2">{footer}</p>
      </div>
    </main>
  );
}
