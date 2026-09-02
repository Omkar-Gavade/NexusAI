import { Link } from 'react-router';
import { Logo, Wordmark } from '@/components/ui/logo';
import { routes } from '@/lib/routes';
import { CtaLink } from './cta-link';
import { MarketingContainer } from './section';

/**
 * Only real destinations. No Privacy, Terms, Careers, Blog or Docs links,
 * because none of those pages exist — a footer full of dead links is the
 * cheapest way to look like a template.
 */
/**
 * The same set the header carries, so the two do not drift apart. No
 * Documentation, API, Careers or Status: none of those exist, and a footer link
 * to a page that was never built is the smallest possible lie a marketing site
 * can tell.
 *
 * These were once in-page anchors — `#how-it-works`, `#synthesis`,
 * `#provenance`, `#use-cases` — from when the homepage carried every
 * explanation inline. Moving that detail onto its own pages left four hrefs
 * pointing at ids that exist nowhere, on every marketing page, clicking to
 * nothing. They are routes now, and a test resolves each one against the route
 * table. `Provenance` is gone rather than aimed at a near-enough page: no page
 * is about it, and the concept is covered inside `/how-it-works`.
 */
const FOOTER_LINKS = [
  { to: routes.howItWorks, label: 'How it works' },
  { to: routes.synthesis, label: 'Synthesis' },
  { to: routes.useCases, label: 'Use cases' },
] as const;

export function MarketingFooter() {
  return (
    <footer className="border-t border-line-subtle py-10">
      <MarketingContainer>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
          <Link to={routes.home} aria-label="NexusAI home" className="flex items-center gap-2 rounded-control">
            <Logo size={18} className="text-ink-2" />
            <Wordmark />
          </Link>

          <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {FOOTER_LINKS.map((link) => (
              <Link key={link.to} to={link.to} className="text-ui text-ink-2 hover:text-ink">
                {link.label}
              </Link>
            ))}
          </nav>

          <span className="flex-1" />

          <div className="flex items-center gap-3">
            <Link to={routes.login} className="text-ui text-ink-2 hover:text-ink">
              Sign in
            </Link>
            <CtaLink to={routes.register} variant="secondary" size="md">
              Get started
            </CtaLink>
          </div>
        </div>

        <p data-register="machine" className="mt-8 text-meta text-ink-3">
          NEXUSAI
        </p>
      </MarketingContainer>
    </footer>
  );
}
