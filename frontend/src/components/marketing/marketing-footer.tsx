import { Link } from 'react-router';
import { Logo, Wordmark } from '@/components/ui/logo';
import { routes } from '@/lib/routes';
import { CtaLink } from './cta-link';
import { HomeLink } from './home-link';
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
 * These have been anchors, then routes, then anchors again as the public
 * surface split into four pages and came back to one. Both times the set was
 * left pointing at destinations that no longer existed. `home-page.test.tsx`
 * now resolves every href here against the ids the page actually renders, so
 * the next structural change fails a test instead of shipping dead links.
 */
const FOOTER_LINKS = [
  { href: '#modes', label: 'Product' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#synthesis', label: 'Synthesis' },
  { href: '#provenance', label: 'Provenance' },
] as const;

export function MarketingFooter() {
  return (
    <footer className="border-t border-line-subtle py-10">
      <MarketingContainer>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
          <HomeLink
            aria-label="NexusAI home"
            className="flex items-center gap-2 rounded-control max-lg:min-h-11"
          >
            <Logo size={18} className="text-ink-2" />
            <Wordmark />
          </HomeLink>

          <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {FOOTER_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                // 44px of hit area below `lg`, per the release checklist. These
                // were 20px tall — the height of the text — at every width.
                className="inline-flex items-center rounded-control text-ui text-ink-2 hover:text-ink max-lg:min-h-11"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <span className="flex-1" />

          <div className="flex items-center gap-3">
            <Link
              to={routes.login}
              className="inline-flex items-center rounded-control px-2 text-ui text-ink-2 hover:text-ink max-lg:min-h-11"
            >
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
