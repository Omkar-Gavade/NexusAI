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
 * The same set the header carries, so the two do not drift apart — and every
 * entry is an anchor that exists on the page. No Documentation, API, Careers or
 * Status: none of those exist, and a footer link to a page that was never built
 * is the smallest possible lie a marketing site can tell.
 */
const FOOTER_LINKS = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#synthesis', label: 'Synthesis' },
  { href: '#provenance', label: 'Provenance' },
  { href: '#use-cases', label: 'Use cases' },
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
              <a key={link.href} href={link.href} className="text-ui text-ink-2 hover:text-ink">
                {link.label}
              </a>
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
