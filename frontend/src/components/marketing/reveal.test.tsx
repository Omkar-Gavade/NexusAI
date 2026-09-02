import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@/test/render';
import { Reveal } from './reveal';

/**
 * The one thing this component must never do is hide content.
 *
 * It reveals on intersection, which means the visible state depends on a
 * callback arriving. Every path where that callback does not arrive has to end
 * with the content shown.
 */
describe('Reveal', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('renders its children into the DOM regardless', () => {
    render(
      <Reveal>
        <p>the argument</p>
      </Reveal>,
    );
    expect(screen.getByText('the argument')).toBeInTheDocument();
  });

  // jsdom has no IntersectionObserver, so this is also the no-JS/crawler path.
  it('shows immediately when IntersectionObserver does not exist', async () => {
    const { container } = render(
      <Reveal>
        <p>the argument</p>
      </Reveal>,
    );
    await waitFor(() =>
      expect(container.querySelector('.nx-reveal')).toHaveAttribute('data-shown', 'true'),
    );
  });

  /*
   * The failure this exists for: an observer that is constructed, accepts the
   * observation, and never calls back. An embedded viewport that is never
   * composited behaves exactly like this — it delivers no notification even for
   * an element filling the screen — and the page rendered blank below the fold.
   */
  it('shows anyway when the observer never fires', async () => {
    vi.useFakeTimers();
    const disconnect = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe = vi.fn();
        disconnect = disconnect;
        unobserve = vi.fn();
        takeRecords = vi.fn(() => []);
        root = null;
        rootMargin = '';
        thresholds = [];
      },
    );

    const { container } = render(
      <Reveal>
        <p>the argument</p>
      </Reveal>,
    );

    expect(container.querySelector('.nx-reveal')).not.toHaveAttribute('data-shown');

    // Inside `act`, so the state update the timer schedules is flushed.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(container.querySelector('.nx-reveal')).toHaveAttribute('data-shown', 'true');
    expect(disconnect).toHaveBeenCalled();
  });
})
