import { useState } from 'react';
import { Link } from 'react-router';
import { MarketingLayout, PageHero } from '@/components/marketing/marketing-layout';
import { Section } from '@/components/marketing/section';
import { routes } from '@/lib/routes';
import { usePageMetadata } from '@/lib/use-page-metadata';

/**
 * Pricing, before pricing exists.
 *
 * No plan prices are set anywhere in this repository, so none are shown. The
 * currency selector is real and works; what it does not do is invent an
 * amount to convert. A page that displayed "$19/month" because the layout
 * looked unfinished without it would be the same failure as inventing a model
 * response — a number a reader would reasonably act on, that nobody decided.
 *
 * What the page can honestly do is set out the plan shape, say exactly what
 * each tier is for, and be specific about what is and is not built.
 */

const CURRENCIES = [
  { code: 'USD', symbol: '$', label: 'US dollar' },
  { code: 'INR', symbol: '₹', label: 'Indian rupee' },
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'GBP', symbol: '£', label: 'Pound sterling' },
  { code: 'CAD', symbol: 'CA$', label: 'Canadian dollar' },
  { code: 'AUD', symbol: 'A$', label: 'Australian dollar' },
  { code: 'JPY', symbol: '¥', label: 'Japanese yen' },
  { code: 'SGD', symbol: 'S$', label: 'Singapore dollar' },
  { code: 'AED', symbol: 'AED', label: 'UAE dirham' },
] as const;

export function PricingPage() {
  const [currency, setCurrency] = useState<string>('USD');
  // Indexed rather than asserted: the fallback is the first entry, which is
  // always present because the list is a non-empty literal.
  const [fallback] = CURRENCIES;
  const selected = CURRENCIES.find((c) => c.code === currency) ?? fallback;

  usePageMetadata({
    title: 'Pricing — NexusAI',
    description:
      'NexusAI plan structure. Pricing is not set yet: the product is pre-launch and not publicly deployed.',
  });

  return (
    <MarketingLayout>
      <PageHero
        label="PRICING"
        title="Pricing is not set yet."
        lede="NexusAI is pre-launch and not publicly deployed, so there is nothing to buy and no amount to quote. The plan shape below is what is intended; the numbers are genuinely undecided, and inventing them here would be the one thing this product is built not to do."
      >
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="currency" className="text-ui text-ink-2">
            Show amounts in
          </label>
          <select
            id="currency"
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            className="rounded-control border border-line-control bg-raised px-3 py-2 text-ui text-ink"
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.label}
              </option>
            ))}
          </select>
          <span data-register="machine" className="text-note uppercase text-ink-3">
            {selected.symbol} · no amounts published
          </span>
        </div>
      </PageHero>

      <Section id="plans" surface="raised" label="PLANS" title="Three tiers, one shape.">
        <ul className="grid gap-px border border-line bg-line lg:grid-cols-3">
          {PLANS.map((plan) => (
            <li key={plan.name} className="flex flex-col gap-5 bg-canvas p-6">
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-title font-[550] text-ink">{plan.name}</h3>
                  <span data-register="machine" className="text-note uppercase text-ink-3">
                    Coming soon
                  </span>
                </div>
                <p className="mt-2 text-ui text-ink-2">{plan.who}</p>
              </div>

              <div className="border-y border-line-subtle py-4">
                <span data-register="machine" className="text-meta text-ink-3">
                  {selected.symbol} —
                </span>
                <p className="mt-1 text-micro text-ink-3">Not yet priced</p>
              </div>

              <ul className="flex flex-col gap-2">
                {plan.includes.map((line) => (
                  <li key={line} className="flex gap-2.5 text-ui text-ink-2">
                    <span aria-hidden="true" className="mt-2 block size-1 shrink-0 bg-line-strong" />
                    {line}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>

        <p className="mt-6 max-w-[62ch] text-ui text-ink-2">
          No exchange rates are applied. The selector changes which currency amounts would be
          shown in once they exist — it is not converting a published price, because there is
          not one.
        </p>
      </Section>

      <Section id="models" label="MODEL ACCESS" title="What a plan would actually govern.">
        <div className="grid gap-x-10 gap-y-8 md:grid-cols-2">
          {ACCESS.map((item) => (
            <div key={item.title}>
              <h3 className="text-title font-[550] text-ink">{item.title}</h3>
              <p className="mt-1.5 max-w-[46ch] text-ui text-ink-2">{item.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="faq" surface="raised" layout="split" label="QUESTIONS" title="Honest answers.">
        <dl className="flex flex-col gap-7">
          {FAQ.map((item) => (
            <div key={item.q}>
              <dt className="text-title font-[550] text-ink">{item.q}</dt>
              <dd className="mt-1.5 max-w-[54ch] text-ui text-ink-2">{item.a}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="cta" label="MEANWHILE" title="The product is real, even if the price is not.">
        <p className="max-w-[62ch] text-body text-ink-2">
          The orchestration, synthesis, provenance and streaming are built and have run against
          real model providers. What does not exist is a hosted service to sell.
        </p>
        <p className="mt-8 text-ui">
          <Link to={routes.howItWorks} className="text-accent hover:underline">
            See how it works →
          </Link>
        </p>
      </Section>
    </MarketingLayout>
  );
}

const PLANS = [
  {
    name: 'Free',
    who: 'For trying the idea on real questions.',
    includes: [
      'Multi-model orchestration',
      'Synthesis and provenance',
      'Conversation history',
      'A capped number of turns',
    ],
  },
  {
    name: 'Pro',
    who: 'For people who reach for it daily.',
    includes: [
      'Everything in Free',
      'Higher turn limits',
      'Wider model selection',
      'Longer conversation retention',
    ],
  },
  {
    name: 'Team',
    who: 'For a group sharing the same questions.',
    includes: [
      'Everything in Pro',
      'Shared workspace',
      'Pooled usage',
      'Administrative controls',
    ],
  },
] as const;

const ACCESS = [
  {
    title: 'Models are configured, not purchased',
    body: 'A deployment enables a model by holding that provider’s credential. A plan would govern how many models a turn may fan out to and how often you can ask — not which vendors exist.',
  },
  {
    title: 'A turn is the unit',
    body: 'One question fans out to several models plus a synthesis pass, so a turn costs several model calls. Any usage limit is naturally expressed in turns rather than tokens.',
  },
  {
    title: 'Limits are enforced by the server',
    body: 'Maximum models per request, concurrent streams per user, prompt size and request rate are all enforced backend-side today, independently of any plan.',
  },
  {
    title: 'Nothing is metered yet',
    body: 'There is no billing system, no usage metering and no payment integration in the product. Those would be built alongside pricing, not retrofitted to this page.',
  },
] as const;

const FAQ = [
  {
    q: 'Why is there no price?',
    a: 'Because none has been decided. The product is not deployed, so there is nothing to charge for, and a number invented to fill the layout is a number someone would plan around.',
  },
  {
    q: 'Does the currency selector convert anything?',
    a: 'No. There are no amounts to convert and no exchange-rate source in the product. It selects the currency amounts would appear in.',
  },
  {
    q: 'Can I use NexusAI today?',
    a: 'Not as a hosted service. The orchestration and synthesis are built and verified against real providers, but nothing is publicly deployed.',
  },
  {
    q: 'Which models will be included?',
    a: 'The catalog covers six providers. Which of them a given deployment can reach depends on its configuration, and the workspace reports that per model rather than promising availability.',
  },
] as const;
