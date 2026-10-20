import type { ReactNode } from 'react';
import clsx from 'clsx';
import { Navigate } from 'react-router';
import { CtaLink } from '@/components/marketing/cta-link';
import { FailoverDiagram } from '@/components/marketing/failover-diagram';
import { HeroComposer } from '@/components/marketing/hero-composer';
import { MarketingLayout } from '@/components/marketing/marketing-layout';
import { ModelArenaPreview } from '@/components/marketing/model-arena-preview';
import { ModelRoster, ROSTER } from '@/components/marketing/model-roster';
import { OrchestrationGraph } from '@/components/marketing/orchestration-graph';
import { PerformanceTransparency } from '@/components/marketing/performance-transparency';
import { RailLegend } from '@/components/marketing/rail-legend';
import { Reveal } from '@/components/marketing/reveal';
import { ResponseModes } from '@/components/marketing/response-modes';
import { MarketingContainer, Section } from '@/components/marketing/section';
import { StanceLegend } from '@/components/marketing/stance-legend';
import { StepList } from '@/components/marketing/step-list';
import { SynthesisDiagram } from '@/components/marketing/synthesis-diagram';
import { UsedModels } from '@/components/marketing/used-models';
import { Rule } from '@/components/ui/rule';
import { useSession } from '@/features/auth/use-session';
import { routes } from '@/lib/routes';
import { usePageMetadata } from '@/lib/use-page-metadata';

/**
 * The public surface. One page.
 *
 * It was one page, then four — `/how-it-works`, `/synthesis` and `/use-cases`
 * carried the detail while the homepage carried a summary. Splitting it meant
 * the argument only landed for a reader who clicked, the nav and footer had to
 * be kept in sync with four routes, and the anchors left behind by the split
 * pointed at ids that no longer existed. The detail is back here, in the order
 * a visitor needs it, and the nav points at sections of this page.
 *
 * The page answers four questions and stops:
 *
 *   what is it        one question, one model or several
 *   what do I choose  direct (Smart Router), Model Arena compare, or synthesis
 *   how does it work  fan-out, responses, synthesis, streaming, provenance
 *   what do I know    which models ran, measured latency, token usage, and cost
 *
 * What it does not contain: a gradient, a glowing orb, a customer logo wall, a
 * testimonial, a usage statistic, an uptime figure, a compliance badge, or a
 * price. None of those are things this project can currently claim, and
 * inventing credibility is the same failure as inventing a model response.
 */
export function HomePage() {
  const { data: user } = useSession();

  usePageMetadata({
    title: 'NexusAI — one question, one model or several',
    description:
      'NexusAI is a multi-model AI workspace with Smart Routing, Model Arena comparison, multi-model synthesis, and transparent per-response performance and cost telemetry.',
  });

  if (user) return <Navigate to={routes.workspace} replace />;

  return (
    <MarketingLayout>
      {/* --- Hero: the claim, and the router demonstrating it ------------- */}
      <section className="relative overflow-hidden bg-canvas">
        {/* A measured grid behind the instrument — the one textured surface
            on the page, and the only place it appears. Masked so it fades
            before it reaches the copy. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(var(--border-subtle)_1px,transparent_1px),linear-gradient(90deg,var(--border-subtle)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_70%_80%_at_78%_45%,black,transparent_75%)]"
        />
        <MarketingContainer>
          <div className="relative pb-14 pt-12 md:pb-20 md:pt-16">
            <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14">
              <div>
                <Rule label="MULTI-MODEL AI WORKSPACE" className="mb-8" />

                <h1 className="max-w-[15ch] text-hero font-[550] text-ink [text-wrap:balance]">
                  One question. The right model{' '}
                  <span className="text-ink-3">— or several.</span>
                </h1>

                <p className="mt-6 max-w-[44ch] text-body text-ink-2">
                  Smart Routing picks a model for the task. The Model Arena puts the same question
                  to two to four models side by side. Synthesis reconciles several answers into
                  one. Every answer records which models ran, how long they took, and what they
                  cost.
                </p>

                <div className="mt-9 flex flex-wrap items-center gap-3">
                  <CtaLink to={routes.register}>Try NexusAI</CtaLink>
                  <CtaLink to="#modes" variant="secondary">
                    See both modes
                  </CtaLink>
                </div>

                <p
                  data-register="machine"
                  className="mt-10 max-w-[44ch] text-note uppercase leading-5 text-ink-3"
                >
                  <span aria-hidden="true" className="mr-2 inline-block size-1.5 bg-warn align-middle" />
                  Pre-launch · Real model execution verified · Not publicly deployed
                </p>
              </div>

              <div>
                <HeroComposer />
              </div>
            </div>
          </div>
        </MarketingContainer>

        {/* The roster, as a line rather than a pitch. */}
        <div className="relative border-t border-line-subtle bg-canvas">
          <MarketingContainer>
            <p
              data-register="machine"
              className="flex flex-wrap items-center gap-x-5 gap-y-2 py-4 text-meta text-ink-3"
            >
              <span className="text-note uppercase text-ink-2">Six models · six providers</span>
              {ROSTER.map((entry) => (
                <span key={entry.model} className="whitespace-nowrap">
                  {entry.model}
                </span>
              ))}
            </p>
          </MarketingContainer>
        </div>
      </section>

      {/* --- The choice --------------------------------------------------- */}
      <Section
        id="modes"
        surface="raised"
        layout="columns"
        label="WAYS TO ASK"
        title="Direct, Model Arena compare, or synthesised."
        lede="One decision, made per question rather than per account, next to the composer. Let Smart Routing pick a single model that answers in its own words, compare models side by side in the Model Arena and keep the answer you prefer, or run several and let a synthesis pass reconcile them."
      >
        <ResponseModes />
      </Section>

      {/* --- The Arena ---------------------------------------------------- */}
      <Section
        id="product"
        label="MODEL ARENA"
        title="Two to four answers, side by side, as they arrive."
        lede="Each column streams on its own and reports its own time to first token. Pick the answer you trust and follow-up questions build on it alone; combine them only when you ask to. A model that fails is retried in its column without touching the others."
      >
        <ModelArenaPreview />
      </Section>

      {/* --- How a turn runs ---------------------------------------------- */}
      <Section
        id="how-it-works"
        surface="raised"
        label="HOW IT WORKS"
        title="Models run in parallel, and finish when they finish."
        lede="The question goes to every selected model at once, bounded by a worker pool rather than issued as an unbounded burst. Each result is reported the moment it lands rather than held until the slowest finishes — and some do not land at all."
      >
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-start">
          <OrchestrationGraph />
          <StepList steps={STEPS} />
        </div>
      </Section>

      {/* --- Synthesis ---------------------------------------------------- */}
      {/* One anchor over the section and its caveat: the caveat is part of
          the synthesis argument, set apart only typographically. */}
      <div id="synthesis">
      <Section
        layout="split"
        label="SYNTHESIS"
        title="From several responses to one reasoned answer."
        lede="Reconciling is the hard half. Anything can call four APIs and show you four columns — that hands the work back to you. The synthesis pass reads the responses that returned and writes the single answer you actually read, stating agreement once and naming disagreement rather than quietly choosing a side."
      >
        <SynthesisDiagram />

        <div className="mt-12">
          <h3 className="text-title font-[550] text-ink">Agreement is judged, never inferred.</h3>
          <p className="mt-2 max-w-[56ch] text-ui text-ink-2">
            The synthesiser classifies each contributing model against the answer it just wrote,
            in an explicit verdict block. Stance is never derived from string similarity, a
            majority count, or response length — and a model the synthesiser did not classify
            stays unknown rather than being rounded up.
          </p>
          <div className="mt-6">
            <StanceLegend />
          </div>
        </div>
      </Section>

      {/* The one typographic moment on the page: the caveat, set as large as
          the claim it qualifies. */}
      <section aria-label="What synthesis does not do" className="border-t border-line-subtle bg-canvas">
        <MarketingContainer>
          <Reveal>
            <figure className="py-16 md:py-24">
              <blockquote className="max-w-[26ch] text-section font-[550] text-ink md:text-[clamp(28px,1.2rem+1.6vw,40px)] md:leading-[1.15] md:tracking-[-0.02em]">
                Reconciled is not the same as correct.
              </blockquote>
              <figcaption className="mt-5 max-w-[62ch] text-body text-ink-2">
                Synthesis reconciles the responses it was given; it does not check them against a
                source of truth, and several models agreeing is not proof that they are right.
                What you get is one answer plus the record of how it was assembled, so you can see
                when the models split and go and read the response that disagreed.
              </figcaption>
            </figure>
          </Reveal>
        </MarketingContainer>
      </section>
      </div>

      {/* --- Provenance & telemetry: a spec sheet, not a stack ------------ */}
      <Section
        id="provenance"
        surface="raised"
        label="PROVENANCE & TELEMETRY"
        title="Every answer records what produced it and what it cost."
        lede="Which models were asked, which answered, which disagreed, measured time to first token and total latency, provider-reported token counts, and an estimated cost. It belongs to the turn, so an answer read months later reports what was recorded when it ran."
      >
        <div className="grid gap-px border border-line bg-line lg:grid-cols-2">
          <SpecCell
            title="Measured, or marked missing."
            body="Cost is estimated only when a provider reported token usage and a dated list price is on file. Anything absent says Not available or Unknown — never a zero."
            wide
          >
            <PerformanceTransparency />
          </SpecCell>
          <SpecCell
            title="Which models ran, in order."
            body="Provenance is a record of what happened, including the models that failed."
          >
            <UsedModels />
          </SpecCell>
          <SpecCell
            title="The same record, beside the answer."
            body="A two-pixel rail, one segment per model in plan order. A break means it diverged; a hollow segment means it never answered."
          >
            <RailLegend />
          </SpecCell>
          <SpecCell
            title="Failure is recorded, not absorbed."
            body="If the model writing the answer fails before any text has streamed, the next eligible one takes over. Once text has reached you it does not switch — rewriting an answer you are reading would be worse than the failure."
            wide
          >
            <FailoverDiagram />
          </SpecCell>
        </div>
      </Section>

      {/* --- Models ------------------------------------------------------- */}
      <Section
        id="models"
        layout="split"
        label="THE MODELS"
        title="Six models across six providers."
        lede="Any one of them can answer on its own, be compared side by side in the Model Arena, or contribute to synthesis. The selector lists every model the deployment knows about, available or not."
      >
        <ModelRoster />
      </Section>

      {/* --- CTA ---------------------------------------------------------- */}
      <section className="border-t border-line-subtle bg-canvas">
        <MarketingContainer>
          <div className="grid gap-8 py-16 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:py-24">
            <div>
              <Rule label="GET STARTED" className="mb-8" />
              <h2 className="max-w-[20ch] text-section font-[550] text-ink md:text-display">
                Ask one question. Choose who answers it.
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <CtaLink to={routes.register}>Try NexusAI</CtaLink>
              <CtaLink to={routes.login} variant="secondary">
                Sign in
              </CtaLink>
            </div>
          </div>
        </MarketingContainer>
      </section>
    </MarketingLayout>
  );
}

/** One cell of the telemetry spec sheet: a claim, then its illustration. */
function SpecCell({
  title,
  body,
  wide = false,
  children,
}: {
  title: string;
  body: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={clsx('flex flex-col gap-5 bg-workspace p-5 md:p-7', wide && 'lg:col-span-2')}>
      <div>
        <h3 className="text-title font-[550] text-ink">{title}</h3>
        <p className="mt-1.5 max-w-[60ch] text-ui text-ink-2">{body}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * The pipeline, in the order it happens.
 */
const STEPS = [
  {
    title: 'Question & Smart Route',
    body: 'One prompt enters the orchestration layer. Smart Routing classifies the task deterministically, or you pick a specific model or Arena comparison set.',
  },
  {
    title: 'Fan-out',
    body: 'The request goes to the selected models in parallel, bounded by a worker pool and per-provider circuit breakers rather than issued as an unbounded burst.',
  },
  {
    title: 'Independent Responses',
    body: 'Each model streams and settles independently. In Model Arena mode, responses appear side by side so you can compare and select your preferred answer.',
  },
  {
    title: 'Synthesis (Auto or On-Demand)',
    body: 'In Synthesis mode—or when you click Combine answers in the Arena—a synthesis model reconciles the completed responses into one answer.',
  },
  {
    title: 'Streaming',
    body: 'Tokens stream live as they arrive, recording measured time-to-first-token and total completion latency per model.',
  },
  {
    title: 'Provenance & Cost',
    body: 'Model identity, routing reason, selected answer, latency, token counts, and estimated USD cost are persisted with the turn.',
  },
] as const;
