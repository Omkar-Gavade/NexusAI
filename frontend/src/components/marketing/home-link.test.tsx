import { describe, expect, it, vi, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/render';
import { HomeLink } from './home-link';

/**
 * The wordmark was a `Link` to `/`. On `/` that is a no-op — the router sees
 * the same location and renders nothing — so clicking the product's own name
 * halfway down the page did nothing, while every other link in the bar moved
 * the reader somewhere.
 */
describe('HomeLink', () => {
  afterEach(() => vi.restoreAllMocks());

  it('scrolls to the top when it is already home', async () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);

    render(<HomeLink aria-label="NexusAI home">NexusAI</HomeLink>, { route: '/' });
    await userEvent.click(screen.getByRole('link', { name: /nexusai home/i }));

    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
    vi.unstubAllGlobals();
  });

  /*
   * Off the homepage it must stay an ordinary navigation — taking over the
   * click everywhere would turn the logo into a control that scrolls the page
   * you are on instead of going home.
   */
  it('navigates normally from anywhere else', async () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);

    render(<HomeLink aria-label="NexusAI home">NexusAI</HomeLink>, { route: '/login' });
    await userEvent.click(screen.getByRole('link', { name: /nexusai home/i }));

    expect(scrollTo).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  // Still a real link: middle-click, cmd-click and "copy link" must work.
  it('keeps a real href so the browser can open it its own way', () => {
    render(<HomeLink aria-label="NexusAI home">NexusAI</HomeLink>, { route: '/' });
    expect(screen.getByRole('link', { name: /nexusai home/i })).toHaveAttribute('href', '/');
  });
});
