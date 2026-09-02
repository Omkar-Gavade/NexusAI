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
  // The homepage carried every explanation the product has, which made it long
  // and slow to reach a point. Detail now lives on its own routes.
  it('stays concise: the detail belongs on the sub-pages', () => {
    const { container } = setup();
    const sections = container.querySelectorAll('main section');

    expect(sections.length).toBeGreaterThanOrEqual(5);
    expect(sections.length).toBeLessThanOrEqual(8);
  });

  it('keeps a single h1 and no skipped heading levels', () => {
    const { container } = setup();
    expect(container.querySelectorAll('h1')).toHaveLength(1);

    const levels = [...container.querySelectorAll('h1,h2,h3')].map((h) => Number(h.tagName[1]));
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i]! - levels[i - 1]!).toBeLessThanOrEqual(1);
    }
  });

  it('leads with the mechanism, not a slogan', () => {
    setup();
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toMatch(/multiple models/i);
  });

  it('points both calls to action at real destinations', () => {
    setup();
    expect(screen.getAllByRole('link', { name: /try nexusai/i })[0]).toHaveAttribute(
      'href',
      routes.register,
    );
    expect(screen.getByRole('link', { name: /see how it works/i })).toHaveAttribute(
      'href',
      routes.howItWorks,
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

  /*
   * The product supports two response modes and the page described only one of
   * them. A visitor who reads "several models, one synthesis" and then finds a
   * model picker in the composer has been told half of what the product does.
   */
  it('says a single chosen model answers directly, without synthesis', () => {
    const { container } = setup();
    const section = container.querySelector('#models');
    const text = section?.textContent ?? '';

    expect(text).toMatch(/pick one model/i);
    expect(text).toMatch(/no synthesis pass/i);
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

  it('links every footer destination to a real route', () => {
    setup();
    const nav = screen.getByRole('navigation', { name: /footer/i });
    const hrefs = within(nav)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href') ?? '');

    expect(hrefs.length).toBeGreaterThan(0);
    // `routes` mixes literals with builders (`conversation` takes an id), and
    // only the literals are linkable destinations.
    const known = new Set(Object.values(routes).filter((r) => typeof r === 'string'));
    for (const href of hrefs) expect(known).toContain(href);
  });

  it('points at no in-page anchor, which a route change silently breaks', () => {
    setup();
    const nav = screen.getByRole('navigation', { name: /footer/i });
    for (const link of within(nav).getAllByRole('link')) {
      expect(link.getAttribute('href') ?? '').not.toMatch(/^#/);
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

  it('links every nav destination to a real route', () => {
    setup();
    const nav = screen.getByRole('navigation', { name: /main/i });
    const known = new Set<string>(Object.values(routes).filter((v) => typeof v === 'string'));

    for (const link of within(nav).getAllByRole('link')) {
      const href = link.getAttribute('href') ?? '';
      if (href.startsWith('/')) expect(known.has(href)).toBe(true);
    }
  });
});
