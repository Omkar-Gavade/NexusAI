import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@/test/render';
import { routes } from '@/lib/routes';
import { HowItWorksPage } from './how-it-works-page';
import { SynthesisPage } from './synthesis-page';
import { UseCasesPage } from './use-cases-page';
import { PricingPage } from './pricing-page';

const PAGES = [
  ['how-it-works', HowItWorksPage, /one question into a multi-model answer/i],
  ['synthesis', SynthesisPage, /one reasoned answer/i],
  ['use-cases', UseCasesPage, /confident answer is not enough/i],
  ['pricing', PricingPage, /pricing is not set yet/i],
] as const;

describe('marketing pages', () => {
  it.each(PAGES)('%s renders with one h1 and shared chrome', (_name, Page, heading) => {
    const { container } = render(<Page />);

    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(heading);
    // Every public page carries the same nav and footer.
    expect(screen.getByRole('navigation', { name: /main/i })).toBeInTheDocument();
    expect(container.querySelector('footer')).not.toBeNull();
  });

  it.each(PAGES)('%s makes no unsupported claim', (_name, Page) => {
    const { container } = render(<Page />);
    const text = container.textContent ?? '';

    expect(text).not.toMatch(/\bavailable now\b|\blive now\b|\bgenerally available\b/i);
    expect(text).not.toMatch(/\btrusted by\b|\bused by\b|\b#1\b|\bguarantee(d|s)?\b/i);
    expect(text).not.toMatch(/\bmore accurate\b|\bmost accurate\b/i);
    expect(text).not.toMatch(/\b\d[\d,.]*\+?\s*(users|customers|teams|companies)\b/i);
  });
});

describe('synthesis page', () => {
  // The page exists to explain a differentiator; it must not turn that into a
  // correctness claim. Reconciling several responses is not verification.
  it('does not claim synthesis makes answers correct', () => {
    const { container } = render(<SynthesisPage />);
    const text = container.textContent ?? '';

    expect(text).not.toMatch(/verif(ies|ied) facts|fact[- ]check|ensures accuracy|correct answer/i);
    expect(text).toMatch(/reconciled is not the same as correct/i);
  });

  it('states that unparseable verdicts stay unknown', () => {
    render(<SynthesisPage />);
    expect(screen.getByText(/unparseable verdicts stay unknown/i)).toBeInTheDocument();
  });
});

describe('pricing page', () => {
  /**
   * No pricing is defined anywhere in the repository. A page that printed an
   * amount because the layout looked unfinished without one would be inventing
   * a number a reader would plan around.
   */
  it('publishes no amount', () => {
    const { container } = render(<PricingPage />);
    const text = container.textContent ?? '';

    // No figure attached to a currency symbol or a billing period.
    expect(text).not.toMatch(/[$€£¥₹]\s?\d/);
    expect(text).not.toMatch(/\d+\s*(\/|per\s)(month|user|seat|year)/i);
    expect(text).toMatch(/not yet priced/i);
  });

  it('offers every required currency', () => {
    render(<PricingPage />);
    const select = screen.getByLabelText(/show amounts in/i);

    for (const code of ['USD', 'INR', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'SGD', 'AED']) {
      expect(within(select).getByRole('option', { name: new RegExp(code) })).toBeInTheDocument();
    }
  });

  it('does not imply live currency conversion', () => {
    const { container } = render(<PricingPage />);
    const text = container.textContent ?? '';

    expect(text).toMatch(/no exchange rates are applied/i);
    expect(text).not.toMatch(/live rate|converted at|today's rate/i);
  });

  it('marks every plan as coming soon rather than purchasable', () => {
    render(<PricingPage />);
    expect(screen.getAllByText(/coming soon/i).length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByRole('button', { name: /buy|subscribe|checkout/i })).toBeNull();
  });
});

describe('use cases page', () => {
  // A page that only lists strengths is marketing; naming the case against is
  // what makes the rest credible.
  it('says where multi-model is the wrong tool', () => {
    render(<UseCasesPage />);
    expect(screen.getByText(/when one model is the right tool/i)).toBeInTheDocument();
  });

  it('invents no customers or case studies', () => {
    const { container } = render(<UseCasesPage />);
    expect(container.textContent ?? '').not.toMatch(/case study|our customers|enterprises use/i);
  });
});

describe('cross-page navigation', () => {
  it('links onward to other real routes', () => {
    render(<HowItWorksPage />);
    expect(screen.getByRole('link', { name: /how synthesis works/i })).toHaveAttribute(
      'href',
      routes.synthesis,
    );
  });
});
