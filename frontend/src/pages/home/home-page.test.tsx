import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { createTestQueryClient, render, screen, within } from '@/test/render';
import { sessionKey } from '@/features/auth/use-session';
import { ROSTER } from '@/components/marketing/model-roster';
import { routes } from '@/lib/routes';
import { HomePage } from './home-page';

function setup({ signedIn = false } = {}) {
  const client = createTestQueryClient();
  if (signedIn) {
    client.setQueryData(sessionKey, {
      user: {
        id: 'u1',
        email: 'a@b.test',
        displayName: 'A',
        preferences: { theme: 'system', defaultRouting: 'balanced' },
        createdAt: new Date().toISOString(),
      },
    });
  }
  return render(<HomePage />, { client });
}

describe('HomePage — structure', () => {
  /*
   * One public page. The detail lived on `/how-it-works`, `/synthesis` and
   * `/use-cases` for a while, which meant the argument only landed for a
   * reader who clicked, and left two generations of nav anchors pointing at
   * sections that had moved. The ceiling is what stops the consolidation from
   * turning back into the twelve-section document it started as.
   */
  it('holds the whole argument, without becoming a document', () => {
    const { container } = setup();
    const sections = container.querySelectorAll('main section');

    expect(sections.length).toBeGreaterThanOrEqual(6);
    expect(sections.length).toBeLessThanOrEqual(9);
  });

  it('keeps a single h1 and no skipped heading levels', () => {
    const { container } = setup();
    expect(container.querySelectorAll('h1')).toHaveLength(1);

    const levels = [...container.querySelectorAll('h1,h2,h3')].map((h) => Number(h.tagName[1]));
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i]! - levels[i - 1]!).toBeLessThanOrEqual(1);
    }
  });

  it('leads with the choice, not a slogan', () => {
    setup();
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toMatch(/one question/i);
    expect(heading.textContent).toMatch(/model/i);
  });

  // Generic AI landing-page copy, named so it cannot drift back in.
  it('makes no generic AI claim', () => {
    const { container } = setup();
    const text = container.textContent ?? '';

    for (const phrase of [
      /ai[- ]powered/i,
      /unlock the power/i,
      /the future of ai/i,
      /your intelligent assistant/i,
      /revolutionary/i,
      /cutting[- ]edge/i,
      /seamless(ly)? integrat/i,
    ]) {
      expect(text).not.toMatch(phrase);
    }
  });

  it('points both calls to action at real destinations', () => {
    setup();
    expect(screen.getAllByRole('link', { name: /try nexusai/i })[0]).toHaveAttribute(
      'href',
      routes.register,
    );
    expect(screen.getByRole('link', { name: /see both modes/i })).toHaveAttribute(
      'href',
      '#modes',
    );
  });

  it('sends an already-signed-in visitor to the workspace', () => {
    const { container } = setup({ signedIn: true });
    expect(container.querySelector('main')).toBeNull();
  });
});

describe('HomePage — models', () => {
  // Scoped to the models section rather than the page: the orchestration
  // diagram labels its lanes with real model names too, so an unscoped
  // getByText matches twice and fails on a page that is in fact correct.
  it('lists the catalog’s models', () => {
    const { container } = setup();
    const section = container.querySelector('#models');
    expect(section).not.toBeNull();

    for (const entry of ROSTER) {
      expect(within(section as HTMLElement).getByText(entry.model)).toBeInTheDocument();
    }
  });

  // Availability depends on a deployment's configuration and on the provider.
  // A static page cannot know it.
  it('does not claim any provider is available', () => {
    const { container } = setup();
    const text = container.textContent ?? '';

    expect(text).not.toMatch(/all (models|providers) available|always available/i);
    expect(text).toMatch(/reports itself as unavailable|depends on|unconfigured/i);
  });
});

/*
 * The one section that has to land. Everything after it on the page is
 * mechanism; a visitor who leaves understanding only this understands the
 * product. The page described synthesis alone for two releases while the
 * composer offered both, so each half is asserted separately.
 */
describe('HomePage — direct and synthesis', () => {
  it('presents both modes side by side', () => {
    const { container } = setup();
    const modes = container.querySelector('#modes');
    expect(modes).not.toBeNull();

    const text = modes?.textContent ?? '';
    expect(text).toMatch(/direct/i);
    expect(text).toMatch(/synthesis/i);
  });

  it('says a chosen model answers alone, with nothing reconciling it', () => {
    const { container } = setup();
    const text = container.querySelector('#modes')?.textContent ?? '';

    expect(text).toMatch(/pick a model/i);
    expect(text).toMatch(/unedited/i);
    expect(text).toMatch(/ANSWERED DIRECTLY/);
  });

  /*
   * The illustrated turn asks three models and gets two back. A tidy
   * three-of-three would misrepresent the ordinary case and hide the thing
   * provenance exists to show.
   */
  it('shows a failed model in the synthesis illustration, and counts only what ran', () => {
    const { container } = setup();
    const text = container.querySelector('#modes')?.textContent ?? '';

    expect(text).toMatch(/no response/i);
    expect(text).toMatch(/TWO OF THREE RESPONDED/);
    expect(text).toMatch(/SYNTHESISED/);
  });

  // Concatenating four responses is the thing this product is not.
  it('describes synthesis as a pass that writes one answer', () => {
    const { container } = setup();
    const text = container.querySelector('#synthesis')?.textContent ?? '';

    expect(text).toMatch(/reconcil/i);
    expect(text).toMatch(/four columns/i);
    expect(text).toMatch(/reconciled is not the same as correct/i);
  });
});

/*
 * Anchors have broken twice here: once when the homepage detail moved onto
 * sub-pages and left the nav pointing at ids that no longer existed, and again
 * when the footer kept those ids after the routes replaced them. Resolving
 * every public href against the ids this page actually renders is the check
 * that would have caught both.
 */
describe('HomePage — link integrity', () => {
  function hrefsIn(container: HTMLElement): string[] {
    return [...container.querySelectorAll('a[href]')].map((a) => a.getAttribute('href') ?? '');
  }

  it('resolves every in-page anchor to a section that exists', () => {
    const { container } = setup();
    const anchors = hrefsIn(container).filter((href) => href.startsWith('#'));

    expect(anchors.length).toBeGreaterThan(0);
    for (const href of anchors) {
      expect(container.querySelector(href)).not.toBeNull();
    }
  });

  it('points every other link at a route that exists', () => {
    const { container } = setup();
    // `routes` mixes literals with builders (`conversation` takes an id), and
    // only the literals are linkable destinations.
    const known = new Set(Object.values(routes).filter((r) => typeof r === 'string'));

    for (const href of hrefsIn(container).filter((h) => !h.startsWith('#'))) {
      expect(known).toContain(href);
    }
  });

  it('links to no removed marketing route', () => {
    const { container } = setup();
    for (const href of hrefsIn(container)) {
      expect(href).not.toMatch(/^\/(pricing|how-it-works|synthesis|use-cases)$/);
    }
  });
});

/**
 * A landing page is exactly where a product invents credibility. These fail the
 * build rather than relying on review.
 */
describe('HomePage — honesty', () => {
  it('claims no statistic, customer count, or compliance badge', () => {
    const { container } = setup();
    const text = container.textContent ?? '';

    expect(text).not.toMatch(
      /\d+(\.\d+)?\s*%\s*(faster|more|better|accurate|accuracy|improvement|uptime|fewer|less)/i,
    );
    expect(text).not.toMatch(/\b99(\.\d+)?\s*%/);
    expect(text).not.toMatch(/\b\d[\d,.]*\+?\s*(users|customers|teams|companies|requests)\b/i);
    expect(text).not.toMatch(/uptime|SOC\s?2|ISO\s?27001|HIPAA|GDPR-certified/i);
  });

  it('borrows no credibility it has not earned', () => {
    const { container } = setup();
    const text = container.textContent ?? '';

    expect(text).not.toMatch(/\btrusted by\b|\bused by\b|\bloved by\b|\bjoin \d/i);
    expect(text).not.toMatch(/\bthe (world's|industry's) (best|leading)\b|\b#1\b/i);
    expect(text).not.toMatch(/\bguarantee(d|s)?\b|\b100%\s*(reliable|accurate)\b/i);
    expect(text).not.toMatch(/\b\d+x\s+(faster|better|more)\b|\benterprise-grade\b/i);
    // The claim a multi-model product is most tempted to make.
    expect(text).not.toMatch(/\bmore accurate\b|\bmost accurate\b|\bhighest accuracy\b/i);
  });

  /**
   * The capability-matrix guard.
   *
   * Two failure directions, and both have actually happened in this project:
   * the page once said "model execution is not yet running" long after real
   * providers had executed, and an earlier version risked describing planned
   * work in the present tense. Understating is as wrong as overstating.
   */
  it('states the pre-launch position accurately in both directions', () => {
    const { container } = setup();
    const text = container.textContent ?? '';

    // Not overstated: nothing is deployed, so nothing is available now.
    expect(text).not.toMatch(/\bavailable now\b|\blive now\b|\bgenerally available\b/i);
    expect(text).toMatch(/not publicly deployed/i);

    // Not understated: the orchestration genuinely runs against real providers.
    expect(text).toMatch(/real model execution verified/i);
    expect(text).not.toMatch(/not (yet )?(running|implemented)|mock[- ]only/i);
  });

  it('describes nothing the matrix marks as planned', () => {
    const { container } = setup();
    const text = container.textContent ?? '';

    // Sources, projects, knowledge and attachments are Planned. They may be
    // named as future work elsewhere, but the homepage must not present them.
    for (const planned of [/\bcitations?\b/i, /\bknowledge base\b/i, /\battachments?\b/i]) {
      expect(text).not.toMatch(planned);
    }
  });
});

/*
 * The footer shipped four in-page anchors that survived the homepage
 * restructure by two releases: every one of them pointed at an id that had
 * moved onto a sub-page, so they clicked to nothing, on every marketing page.
 * Resolving each href against the route table is what would have caught it.
 */
describe('MarketingFooter', () => {
  it('exposes the footer navigation as a labelled landmark', () => {
    setup();
    expect(screen.getByRole('navigation', { name: /footer/i })).toBeInTheDocument();
  });

  it('resolves every footer destination against this page', () => {
    const { container } = setup();
    const nav = screen.getByRole('navigation', { name: /footer/i });
    const hrefs = within(nav)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href') ?? '');

    expect(hrefs.length).toBeGreaterThan(0);
    const known = new Set(Object.values(routes).filter((r) => typeof r === 'string'));

    for (const href of hrefs) {
      if (href.startsWith('#')) expect(container.querySelector(href)).not.toBeNull();
      else expect(known).toContain(href);
    }
  });
});

describe('MarketingNav', () => {
  it('exposes the primary navigation as a labelled landmark', () => {
    setup();
    expect(screen.getByRole('navigation', { name: /main/i })).toBeInTheDocument();
  });

  it('opens and closes the mobile menu, reporting expanded state', async () => {
    const user = userEvent.setup();
    setup();
    const trigger = screen.getByRole('button', { name: /open menu/i });

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    expect(screen.getByRole('button', { name: /close menu/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('offers a theme control that names where it is going', () => {
    setup();
    const toggles = screen.getAllByRole('button', { name: /switch to (light|dark) theme/i });
    expect(toggles.length).toBeGreaterThan(0);
  });

  it('resolves every nav destination against this page', () => {
    const { container } = setup();
    const nav = screen.getByRole('navigation', { name: /main/i });
    const known = new Set(Object.values(routes).filter((v) => typeof v === 'string'));

    for (const link of within(nav).getAllByRole('link')) {
      const href = link.getAttribute('href') ?? '';
      if (href.startsWith('#')) expect(container.querySelector(href)).not.toBeNull();
      else expect(known).toContain(href);
    }
  });

  /*
   * A hash-only `to` on a React Router `Link` pushes the location and does not
   * scroll — visually identical to a dead link. Native anchors are what make
   * these work, and nothing about the rendered output says which was used, so
   * the check is that the nav's in-page links exist and resolve at all.
   */
  it('offers the product sections as in-page anchors, not routes', () => {
    const { container } = setup();
    const nav = screen.getByRole('navigation', { name: /main/i });
    const anchors = within(nav)
      .getAllByRole('link')
      .map((l) => l.getAttribute('href') ?? '')
      .filter((h) => h.startsWith('#'));

    expect(anchors.length).toBeGreaterThanOrEqual(3);
    for (const href of anchors) expect(container.querySelector(href)).not.toBeNull();
  });
});
