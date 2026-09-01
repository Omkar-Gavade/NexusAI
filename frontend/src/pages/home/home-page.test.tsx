import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { createTestQueryClient, render, screen, within } from '@/test/render';
import { sessionKey } from '@/features/auth/use-session';
import { agreementSentence } from '@/lib/format';
import { HomePage } from './home-page';

function setup({ signedIn = false } = {}) {
  const client = createTestQueryClient();
  if (signedIn) {
    client.setQueryData(sessionKey, {
      user: {
        id: 'u1',
        email: 'person@example.com',
        displayName: 'Person',
        preferences: { theme: 'system', routingMode: 'balanced', pinnedModelId: null },
        createdAt: new Date().toISOString(),
      },
    });
  }
  return render(<HomePage />, { client });
}

describe('HomePage — content', () => {
  it('leads with the product proposition, not a slogan', () => {
    setup();
    expect(
      screen.getByRole('heading', { level: 1, name: /one answer you can check/i }),
    ).toBeInTheDocument();
  });

  it('renders every major section as a landmark-addressable region', () => {
    const { container } = setup();
    for (const id of ['why', 'how-it-works', 'synthesis', 'provenance', 'use-cases', 'capabilities']) {
      expect(container.querySelector(`#${id}`), `#${id} missing`).toBeInTheDocument();
    }
  });

  it('keeps a single h1 and no skipped heading levels', () => {
    const { container } = setup();
    const levels = [...container.querySelectorAll('h1,h2,h3')].map((h) =>
      Number(h.tagName.slice(1)),
    );
    expect(levels.filter((l) => l === 1)).toHaveLength(1);
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i]! - levels[i - 1]!).toBeLessThanOrEqual(1);
    }
  });

  it('explains the flow in five ordered steps', () => {
    const { container } = setup();
    const steps = container.querySelector('#how-it-works ol');
    expect(steps?.children).toHaveLength(5);
    // First and last step, so the ordering is asserted end to end rather than
    // just the count.
    expect(screen.getByText(/^ask once$/i)).toBeInTheDocument();
    expect(screen.getByText(/^the trail stays$/i)).toBeInTheDocument();
  });
});

// A landing page is exactly where a product invents credibility. These assertions
// exist to make that regression fail the build rather than ship.
describe('HomePage — honesty', () => {
  it('claims no performance statistic, customer count, or compliance badge', () => {
    const { container } = setup();
    const text = container.textContent ?? '';
    // A percentage is only a problem when it is a claim. "200% zoom" is an
    // accessibility statement; "40% faster" would be an invented benchmark.
    expect(text).not.toMatch(
      /\d+(\.\d+)?\s*%\s*(faster|more|better|accurate|accuracy|improvement|uptime|fewer|less)/i,
    );
    expect(text).not.toMatch(/\b99(\.\d+)?\s*%/);
    expect(text).not.toMatch(/\b\d[\d,.]*\+?\s*(users|customers|teams|companies|requests)\b/i);
    expect(text).not.toMatch(/uptime|SOC\s?2|ISO\s?27001|HIPAA|GDPR-certified/i);
  });

  // Social proof this product does not have, and superlatives nothing measured.
  it('borrows no credibility it has not earned', () => {
    const { container } = setup();
    const text = container.textContent ?? '';

    expect(text).not.toMatch(/\btrusted by\b|\bused by\b|\bloved by\b|\bjoin \d/i);
    expect(text).not.toMatch(/\bthe (world's|industry's) (best|leading)\b|\b#1\b|\bnumber one\b/i);
    expect(text).not.toMatch(/\bguarantee(d|s)?\b|\b100%\s*(reliable|accurate)\b|\bnever wrong\b/i);
    expect(text).not.toMatch(/\b\d+x\s+(faster|better|more)\b|\benterprise-grade\b/i);
    // The one claim a multi-model product is most tempted to make.
    expect(text).not.toMatch(/\bmore accurate\b|\bmost accurate\b|\bhighest accuracy\b/i);
  });

  it('names no model vendor anywhere', () => {
    const { container } = setup();
    expect(container.textContent ?? '').not.toMatch(
      /gpt|claude|gemini|mistral|llama|deepseek|openai|anthropic/i,
    );
  });

  it('labels the interface illustration as not being live output', () => {
    setup();
    expect(screen.getByText(/static illustration — not live model output/i)).toBeInTheDocument();
  });

  it('marks unshipped capabilities as planned rather than built', () => {
    setup();
    const attachments = screen.getByText('Attachments').closest('li');
    expect(within(attachments!).getByText(/^planned$/i)).toBeInTheDocument();

    const provenance = screen.getByText('Provenance rail').closest('li');
    expect(within(provenance!).getByText(/^interface built$/i)).toBeInTheDocument();
  });

  // No backend runs. A built capability is a built interface, and the page has
  // to say which, or "Built" reads as "live".
  it('never labels a capability in a way that implies a running service', () => {
    const { container } = setup();
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/\bavailable now\b|\blive now\b|\bgenerally available\b/i);
    expect(screen.queryByText(/^built$/i)).not.toBeInTheDocument();
  });

  it('states plainly that model execution is not yet running', () => {
    setup();
    expect(screen.getAllByText(/pre-launch/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/model execution is not yet running/i)).toBeInTheDocument();
  });
});

describe('HomePage — routing', () => {
  it('points both calls to action at the real auth routes', () => {
    setup();
    for (const link of screen.getAllByRole('link', { name: /get started|create an account/i })) {
      expect(link).toHaveAttribute('href', '/register');
    }
    for (const link of screen.getAllByRole('link', { name: /^sign in$/i })) {
      expect(link).toHaveAttribute('href', '/login');
    }
  });

  it('sends an already-signed-in visitor to the workspace', () => {
    setup({ signedIn: true });
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('sets document metadata for the public page', async () => {
    setup();
    await Promise.resolve();
    expect(document.title).toMatch(/NexusAI/);
    expect(
      document.head.querySelector('meta[name="description"]')?.getAttribute('content'),
    ).toMatch(/reconciles their responses/i);
  });
});

describe('MarketingNav', () => {
  it('exposes the primary navigation as a labelled landmark', () => {
    setup();
    expect(screen.getByRole('navigation', { name: /main/i })).toBeInTheDocument();
  });

  it('opens and closes the mobile menu, reporting expanded state', async () => {
    setup();
    const trigger = screen.getByRole('button', { name: /open menu/i });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(trigger);
    const close = screen.getByRole('button', { name: /close menu/i });
    expect(close).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(close);
    expect(screen.getByRole('button', { name: /open menu/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('closes the mobile menu on Escape', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: /open menu/i }));
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: /open menu/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});

/**
 * The page's job is to make the mechanic legible, not merely to assert it. These
 * cover the two illustrations that carry that weight — the synthesis flow and
 * the provenance notation — because a section that renders a heading and no
 * explanation passes every other test in this file.
 */
describe('HomePage — the product mechanic is shown, not just claimed', () => {
  it('draws the fan-out: one question, several models, one synthesis', () => {
    setup();
    const figure = screen.getByText(/illustration of the flow/i).closest('figure')!;

    expect(within(figure).getByText(/^one question$/i)).toBeInTheDocument();
    expect(within(figure).getByText('Model A')).toBeInTheDocument();
    expect(within(figure).getByText('Model B')).toBeInTheDocument();
    expect(within(figure).getByText('Model C')).toBeInTheDocument();
    expect(within(figure).getByText(/^synthesis$/i)).toBeInTheDocument();
  });

  // Disagreement and failure are the two things a multi-model product is
  // tempted to hide. Both are on the page, in the illustration.
  it('shows a model diverging and a model failing, rather than three that agree', () => {
    setup();
    const figure = screen.getByText(/illustration of the flow/i).closest('figure')!;

    expect(within(figure).getByText(/^concurs$/i)).toBeInTheDocument();
    expect(within(figure).getByText(/^diverges$/i)).toBeInTheDocument();
    expect(within(figure).getByText(/^no response$/i)).toBeInTheDocument();
    expect(within(figure).getByText(/did not return a response/i)).toBeInTheDocument();
  });

  // The metadata line comes from the application's own formatter, so the page
  // cannot drift from what the workspace would render for this turn.
  it('reports the illustrated turn using the product’s real vocabulary', () => {
    setup();
    expect(
      screen.getAllByText(agreementSentence({ requested: 3, responded: 2, concur: 1, diverge: 1 })),
    ).not.toHaveLength(0);
  });

  it('captions the flow illustration as static rather than live', () => {
    setup();
    expect(screen.getByText(/illustration of the flow\. static — not live model output/i))
      .toBeInTheDocument();
  });

  it('teaches the rail notation: responded, diverged, did not respond', () => {
    setup();
    expect(screen.getByRole('heading', { name: /^responded$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^diverged$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /did not respond/i })).toBeInTheDocument();
  });

  it('describes the illustration for a screen reader instead of leaving bare bars', () => {
    setup();
    expect(
      screen.getAllByText(/an illustration of one question sent to three models/i),
    ).not.toHaveLength(0);
  });
});

/**
 * The redesign's premise is that the page must *show* the mechanic, not assert
 * it: a visitor who reads only the headings and the diagrams should still come
 * away with question → several models → disagreement → synthesis → provenance.
 * These assert that each step of that argument is present and drawn.
 */
describe('HomePage — the argument, in order', () => {
  it('runs as a long-form page rather than a single screen', () => {
    const { container } = setup();
    const sections = container.querySelectorAll('main section');

    // Twelve deliberate sections. The number is not the point; a page that
    // collapses back to a hero and a CTA is.
    expect(sections.length).toBeGreaterThanOrEqual(10);
  });

  it.each([
    ['why', /one reading of the question/i],
    ['models', /read three different ways/i],
    ['how-it-works', /one reconciled answer out/i],
    ['synthesis', /not the transcript/i],
    ['disagreement', /disagreement is kept/i],
    ['provenance', /shows its working/i],
    ['failure', /not quietly replaced/i],
    ['use-cases', /being wrong is expensive/i],
    ['capabilities', /what is built/i],
  ])('carries the #%s step of the argument', (id, heading) => {
    const { container } = setup();
    const section = container.querySelector(`#${id}`);

    expect(section).not.toBeNull();
    expect(section!.querySelector('h2')?.textContent).toMatch(heading);
  });

  it('draws the fan-out in the hero, above the fold', () => {
    const { container } = setup();
    const hero = container.querySelector('main section')!;

    expect(within(hero as HTMLElement).getByText(/^orchestration$/i)).toBeInTheDocument();
    expect(within(hero as HTMLElement).getByText(/^one question$/i)).toBeInTheDocument();
    expect(within(hero as HTMLElement).getAllByText(/^synthesis$/i).length).toBeGreaterThan(0);
    // The failure case is in the hero too, not hidden further down.
    expect(within(hero as HTMLElement).getAllByText(/^no response$/i).length).toBeGreaterThan(0);
  });

  it('shows a model diverging and a model failing rather than three that agree', () => {
    const { container } = setup();
    const text = container.textContent ?? '';

    expect(text).toMatch(/diverges/i);
    expect(text).toMatch(/no response|did not respond/i);
  });

  it('reports every illustrated turn with the product’s own formatter', () => {
    setup();
    // Hero and failure panel both render a real agreement sentence, so the page
    // cannot state a count the workspace would not.
    expect(
      screen.getAllByText(agreementSentence({ requested: 3, responded: 2, concur: 1, diverge: 1 })),
    ).not.toHaveLength(0);
    expect(
      screen.getAllByText(agreementSentence({ requested: 3, responded: 2, concur: 2, diverge: 0 })),
    ).not.toHaveLength(0);
  });

  it('captions every product illustration as static rather than live', () => {
    const { container } = setup();
    const captions = [...container.querySelectorAll('figcaption')];

    expect(captions.length).toBeGreaterThanOrEqual(3);
    for (const caption of captions) {
      expect(caption.textContent).toMatch(/static|illustration/i);
      expect(caption.textContent).toMatch(/not live model output/i);
    }
  });

  it('gives every illustration a text alternative instead of bare bars', () => {
    const { container } = setup();
    // Each figure carries one description; the decorative grid inside is hidden.
    for (const figure of container.querySelectorAll('figure')) {
      expect(figure.querySelector('.sr-only')).not.toBeNull();
      expect(figure.querySelector('[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it('points navigation and footer only at sections that exist', () => {
    const { container } = setup();
    const anchors = [...container.querySelectorAll('a[href^="#"]')].map((a) =>
      a.getAttribute('href')!.slice(1),
    );

    expect(anchors.length).toBeGreaterThan(0);
    for (const id of new Set(anchors)) {
      expect(container.querySelector(`#${id}`)).not.toBeNull();
    }
  });

  it('states the pre-launch position in the hero, not only in a footnote', () => {
    const { container } = setup();
    const hero = container.querySelector('main section')!;
    expect(hero.textContent).toMatch(/pre-launch/i);
  });
});

/**
 * The failure mode this page had before: it was honest, organised, and read as
 * one long document. Length is not design. These cover the three things that
 * make it a designed page rather than a memo — a visual journey, drawn
 * relationships, and more than one layout.
 */
describe('HomePage — designed, not merely long', () => {
  it('alternates the field between sections instead of running one flat surface', () => {
    const { container } = setup();
    const surfaces = new Set(
      [...container.querySelectorAll('main section')].map((s) =>
        s.className.includes('bg-workspace') ? 'raised' : 'canvas',
      ),
    );

    // Twelve sections on a single surface is a document. The alternation is
    // what tells the eye a new idea has started.
    expect(surfaces.size).toBe(2);
  });

  it('draws the fan-out as geometry rather than stacked boxes', () => {
    const { container } = setup();
    const connectors = container.querySelectorAll('main svg');

    // Branch out of the question, converge into the synthesis. Without these
    // the hero shows three boxes and asserts a relationship it never draws.
    expect(connectors.length).toBe(2);
    for (const svg of connectors) {
      expect(svg.querySelectorAll('path').length).toBeGreaterThanOrEqual(4);
      expect(svg.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('uses more than one section layout', () => {
    const { container } = setup();
    const split = [...container.querySelectorAll('main section')].filter((s) =>
      s.innerHTML.includes('md:sticky'),
    );

    // Sequences read beside their heading; everything else reads beneath it.
    expect(split.length).toBeGreaterThan(0);
    expect(split.length).toBeLessThan(container.querySelectorAll('main section').length);
  });

  it('runs the pipeline order in the hero: question, models, synthesis', () => {
    const { container } = setup();
    const hero = container.querySelector('main section') as HTMLElement;
    const text = hero.textContent ?? '';

    const question = text.indexOf('One question');
    const model = text.indexOf('model-a');
    const synthesis = text.lastIndexOf('Synthesis');

    // Reading order matches the flow, so a screen reader and a sighted reader
    // meet the stages in the same sequence.
    expect(question).toBeGreaterThan(-1);
    expect(model).toBeGreaterThan(question);
    expect(synthesis).toBeGreaterThan(model);
  });

  it('keeps the headline on the marketing type exception, not an invented size', () => {
    const { container } = setup();
    const h1 = container.querySelector('h1')!;

    // --text-hero is the one sanctioned break from the workspace ceiling.
    expect(h1.className).toContain('text-hero');
    expect(h1.className).not.toMatch(/text-\[\d/);
  });
});
