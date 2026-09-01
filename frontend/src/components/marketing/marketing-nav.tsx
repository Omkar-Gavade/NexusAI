import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Menu, X } from 'lucide-react';
import { Link } from 'react-router';
import { IconButton } from '@/components/ui/icon-button';
import { Logo, Wordmark } from '@/components/ui/logo';
import { routes } from '@/lib/routes';
import { CtaLink } from './cta-link';
import { MarketingContainer } from './section';

/**
 * Four, deliberately. Every entry is an anchor that exists on the page, and the
 * set traces the argument in order: what it does, what it produces, how you
 * check it, and who it is for.
 */
const LINKS = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#synthesis', label: 'Synthesis' },
  { href: '#provenance', label: 'Provenance' },
  { href: '#use-cases', label: 'Use cases' },
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
        'sticky top-0 z-(--z-sticky) bg-canvas transition-colors duration-(--duration-instant)',
        scrolled && 'border-b border-line-subtle',
      )}
    >
      <MarketingContainer>
        <nav aria-label="Main" className="flex h-14 items-center gap-6">
          <Link to={routes.home} aria-label="NexusAI home" className="flex items-center gap-2 rounded-control">
            <Logo size={19} className="text-ink-2" />
            <Wordmark />
          </Link>

          <ul className="flex flex-1 items-center gap-1 max-md:hidden">
            {LINKS.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="rounded-control px-2.5 py-1.5 text-ui text-ink-2 transition-colors duration-(--duration-instant) hover:bg-hover hover:text-ink"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2 max-md:hidden">
            <Link
              to={routes.login}
              className="rounded-control px-2.5 py-1.5 text-ui text-ink-2 transition-colors duration-(--duration-instant) hover:bg-hover hover:text-ink"
            >
              Sign in
            </Link>
            <CtaLink to={routes.register} size="md">
              Get started
            </CtaLink>
          </div>

          <span className="flex-1 md:hidden" />
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
