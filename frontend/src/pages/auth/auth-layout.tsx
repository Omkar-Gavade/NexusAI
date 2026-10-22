import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, Columns2, Gauge, Sparkles } from 'lucide-react';
import { Logo, Wordmark } from '@/components/ui/logo';
import { routes } from '@/lib/routes';

/*
 * What the account unlocks, said in the product's own terms. Three lines, not
 * a feature grid: someone on this page has already decided to sign in.
 */
const POINTS = [
  {
    Icon: Sparkles,
    title: 'Smart routing',
    body: 'Each question goes to the model best suited to it — or the one you pick.',
  },
  {
    Icon: Columns2,
    title: 'Model Arena',
    body: 'Ask two to four models at once and keep the answer you trust.',
  },
  {
    Icon: Gauge,
    title: 'Nothing hidden',
    body: 'Every answer shows which models ran, how long they took and what they cost.',
  },
] as const;

/**
 * The frame both auth pages share.
 *
 * Desktop: the form on the right, and on the left a quiet brand panel that
 * says what the account is for. Phones get the form alone, because a
 * marketing panel above a sign-in form is something to scroll past.
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
    <main className="grid min-h-dvh bg-canvas lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden border-r border-line-subtle bg-workspace lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 -top-32 size-[520px] rounded-full bg-[radial-gradient(circle,rgb(99_102_241/0.28),transparent_65%)]" />
          <div className="absolute -bottom-40 right-[-120px] size-[480px] rounded-full bg-[radial-gradient(circle,rgb(139_92_246/0.22),transparent_65%)]" />
          <div className="absolute inset-0 opacity-[0.5] [background-image:linear-gradient(var(--border-subtle)_1px,transparent_1px),linear-gradient(90deg,var(--border-subtle)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
        </div>

        <div aria-hidden="true" className="relative inline-flex w-fit items-center gap-2.5">
          <Logo size={28} />
          <Wordmark />
        </div>

        <div className="relative max-w-[440px]">
          <p className="text-[34px] font-semibold leading-[1.1] tracking-[-0.035em] text-ink">
            One question.{' '}
            <span className="text-brand-gradient">The right model — or several.</span>
          </p>
          <ul className="mt-10 flex flex-col gap-6">
            {POINTS.map(({ Icon, title: pointTitle, body }) => (
              <li key={pointTitle} className="flex gap-3.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-control border border-line bg-raised text-accent shadow-float">
                  <Icon size={16} aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-ui font-semibold text-ink">{pointTitle}</span>
                  <span className="mt-0.5 block text-ui text-ink-2">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[13px] text-ink-3">
          Pre-launch · Real model execution verified · Not publicly deployed
        </p>
      </aside>

      <div className="relative flex items-center justify-center px-5 py-12">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-ambient lg:hidden" />
        <div className="relative w-full max-w-[400px]">
          <Link
            to={routes.home}
            aria-label="NexusAI home"
            className="mb-10 inline-flex items-center gap-2.5 rounded-control text-[13px] font-medium text-ink-3 transition-colors duration-(--duration-instant) hover:text-ink lg:mb-12"
          >
            {/* One link at every size: the logo on a phone, where it is the
                only brand on screen, and a plain way back beside the panel. */}
            <span className="inline-flex items-center gap-2.5 lg:hidden">
              <Logo size={26} />
              <Wordmark />
            </span>
            <span className="hidden items-center gap-1.5 lg:inline-flex">
              <ArrowLeft size={14} aria-hidden="true" />
              Back to home
            </span>
          </Link>

          <h1 className="text-[28px] font-semibold leading-9 tracking-[-0.03em] text-ink">{title}</h1>
          <p className="mt-2 text-ui text-ink-2">{description}</p>

          <div className="mt-8">{children}</div>

          <p className="mt-8 text-ui text-ink-2">{footer}</p>
        </div>
      </div>
    </main>
  );
}
