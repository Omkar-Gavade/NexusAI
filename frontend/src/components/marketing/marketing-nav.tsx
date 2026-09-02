import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Menu, X } from 'lucide-react';
import { Link } from 'react-router';
import { IconButton } from '@/components/ui/icon-button';
import { Logo, Wordmark } from '@/components/ui/logo';
import { routes } from '@/lib/routes';
import { CtaLink } from './cta-link';
import { HomeLink } from './home-link';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { MarketingContainer } from './section';

/**
 * Three anchors on the one public page, in the order the argument is made:
 * what you choose, how it runs, what you are told about the result.
 *
 * They are native anchors, not router links. A React Router `Link` with a
 * hash-only target pushes the location without scrolling to the element, which
 * looks exactly like a broken link. Every href here is asserted against the
 * page's own section ids by `home-page.test.tsx`, because the last set of nav
 * anchors outlived the sections they named.
 */
const LINKS = [
  { href: '#modes', label: 'Product' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#provenance', label: 'Provenance' },
] as const;

export function MarketingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // The border appears only once content has passed beneath it. A permanent
  // rule under a bar with nothing above it is noise.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  return (
    <header
      className={clsx(
        'sticky top-0 z-(--z-sticky) transition-[background-color,border-color,backdrop-filter]',
        'duration-(--duration-normal)',
        // Opaque in both states. The bar used to become glass once the page
        // scrolled under it — a translucent fill with a saturating blur — and
        // §11.1 of the design language lists backdrop blur and glassmorphism as
        // things to remove on sight. What the scrolled state actually needs is
        // an edge, so that is all it gets.
        'bg-canvas',
        scrolled ? 'border-b border-line-subtle' : 'border-b border-transparent',
      )}
    >
      <MarketingContainer>
        <nav aria-label="Main" className="flex h-14 items-center gap-6">
          <HomeLink
            aria-label="NexusAI home"
            className="flex items-center gap-2 rounded-control max-lg:min-h-11"
          >
            <Logo size={19} className="text-ink-2" />
            <Wordmark />
          </HomeLink>

          <ul className="flex flex-1 items-center gap-1 max-md:hidden">
            {LINKS.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  // The desktop bar appears at `md` (768px) but the 44px touch
                  // minimum applies below `lg`, so these are 28px tall on
                  // exactly the widths where a finger is the pointer.
                  className="inline-flex items-center rounded-control px-2.5 py-1.5 text-ui text-ink-2 transition-colors duration-(--duration-instant) hover:bg-hover hover:text-ink max-lg:min-h-11"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-1.5 max-md:hidden">
            <ThemeToggle />
            <Link
              to={routes.login}
              className="inline-flex items-center rounded-control px-2.5 py-1.5 text-ui text-ink-2 transition-colors duration-(--duration-instant) hover:bg-hover hover:text-ink max-lg:min-h-11"
            >
              Sign in
            </Link>
            <CtaLink to={routes.register} size="md">
              Get started
            </CtaLink>
          </div>

          <span className="flex-1 md:hidden" />
          <div className="md:hidden">
            <ThemeToggle />
          </div>
          <IconButton
            className="md:hidden"
            label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="marketing-menu"
            icon={menuOpen ? <X size={17} aria-hidden="true" /> : <Menu size={17} aria-hidden="true" />}
            onClick={() => setMenuOpen((open) => !open)}
          />
        </nav>
      </MarketingContainer>

      {menuOpen && (
        <div id="marketing-menu" className="border-t border-line-subtle bg-canvas md:hidden">
          <MarketingContainer>
            <ul className="flex flex-col py-2">
              {LINKS.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className="flex min-h-11 items-center rounded-control px-2 text-ui text-ink-2 hover:bg-hover hover:text-ink"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
              <li className="mt-2 flex gap-2 border-t border-line-subtle pt-3 pb-2">
                <Link
                  to={routes.login}
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-control border border-line-control text-ui text-ink"
                >
                  Sign in
                </Link>
                <Link
                  to={routes.register}
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-control bg-ink text-ui font-[550] text-ink-inv"
                >
                  Get started
                </Link>
              </li>
            </ul>
          </MarketingContainer>
        </div>
      )}
    </header>
  );
}
