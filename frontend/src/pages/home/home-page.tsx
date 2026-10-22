import type { ReactNode } from 'react';
import clsx from 'clsx';
import { Link, Navigate } from 'react-router';
import { ArrowRight, GitBranch, Gauge, ListChecks, ShieldCheck } from 'lucide-react';
import { CtaLink } from '@/components/marketing/cta-link';
import { FailoverDiagram } from '@/components/marketing/failover-diagram';
import { HeroComposer } from '@/components/marketing/hero-composer';
import { MarketingLayout } from '@/components/marketing/marketing-layout';
import { ModelArenaPreview } from '@/components/marketing/model-arena-preview';
import { ModelRoster, ROSTER, ROSTER_IDS } from '@/components/marketing/model-roster';
import { OrchestrationGraph } from '@/components/marketing/orchestration-graph';
import { PerformanceTransparency } from '@/components/marketing/performance-transparency';
import { RailLegend } from '@/components/marketing/rail-legend';
import { ResponseModes } from '@/components/marketing/response-modes';
import { MarketingContainer, Section } from '@/components/marketing/section';
import { StanceLegend } from '@/components/marketing/stance-legend';
import { StepList } from '@/components/marketing/step-list';
import { SynthesisDiagram } from '@/components/marketing/synthesis-diagram';
import { UsedModels } from '@/components/marketing/used-models';
import { FeatureBento } from '@/components/marketing/feature-bento';
import { HUES, modelHue, type Hue } from '@/components/marketing/spectrum';
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
        {/* A static aurora in the spectrum, under a faint measured grid —
            colour and depth without motion, in either theme. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-aurora" />
          <div className="absolute inset-0 opacity-[0.5] [background-image:linear-gradient(var(--border-subtle)_1px,transparent_1px),linear-gradient(90deg,var(--border-subtle)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_75%_70%_at_60%_40%,black,transparent_78%)]" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-canvas" />
        </div>
        <MarketingContainer>
          <div className="relative pb-14 pt-12 md:pb-20 md:pt-16">
            <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14">
              <div>
                <p className="mb-7 inline-flex items-center gap-2 rounded-full border border-line bg-raised/70 py-1 pl-1 pr-3 text-[13px] text-ink-2 shadow-float">
                  <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-white">
                    Pre-launch
                  </span>
                  Multi-model AI workspace
                </p>

                <h1 className="max-w-[15ch] text-hero font-semibold text-ink [text-wrap:balance]">
                  One question. The right model{' '}
                  <span className="text-spectrum">— or several.</span>
                </h1>

                <p className="mt-6 max-w-[46ch] text-[17px] leading-7 text-ink-2">
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

                <p className="mt-10 flex max-w-[46ch] items-start gap-2 text-[13px] leading-5 text-ink-3">
                  <span aria-hidden="true" className="mt-1.5 inline-block size-2 shrink-0 rounded-full bg-warn shadow-[0_0_0_3px_color-mix(in_oklab,var(--status-warning)_20%,transparent)]" />
                  Pre-launch · Real model execution verified · Not publicly deployed
                </p>
              </div>

              {/* A one-pixel spectrum frame and a coloured shadow lift the
                  instrument off the aurora. */}
              <div className="rounded-[17px] bg-spectrum p-px shadow-[0_30px_80px_-28px_rgb(139_92_246/0.55)]">
                <HeroComposer />
              </div>
            </div>
          </div>
        </MarketingContainer>

        {/* The roster: each model in its own hue, as it appears in every
            illustration below. */}
        <div className="relative">
          <MarketingContainer>
            <div className="flex flex-col items-center gap-4 pb-14">
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-3">
                Six models · six providers · one workspace
              </p>
              <ul className="flex flex-wrap justify-center gap-2.5">
                {ROSTER.map((entry, index) => {
                  const hue = modelHue(ROSTER_IDS[index] ?? '');
                  return (
                    <li
                      key={entry.model}
                      className="inline-flex items-center gap-2 rounded-full border border-line bg-raised/80 py-1.5 pl-2 pr-3.5 text-ui font-medium text-ink shadow-float backdrop-blur"
                    >
                      <span
                        aria-hidden="true"
                        className="size-2.5 rounded-full"
                        style={{ backgroundImage: hue.gradient, boxShadow: `0 0 12px rgb(${hue.rgb} / 0.7)` }}
                      />
                      {entry.model}
                      <span className="text-[12px] font-normal text-ink-3">{entry.provider}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </MarketingContainer>
        </div>
      </section>

      {/* --- What it does: the bento --------------------------------------- */}
      <Section
        id="features"
        glow="99 102 241"
        label="WHAT YOU GET"
        title="Every model, one place — and nothing hidden."
        lede="Six capabilities that change how you ask: routed, compared, combined, streamed, measured and resilient."
      >
        <FeatureBento />
      </Section>

      {/* --- The choice --------------------------------------------------- */}
      <Section
        id="modes"
        surface="raised"
        glow="217 70 239"
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
        glow="6 182 212"
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
        glow="139 92 246"
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

        {/* The caveat, set as large as the claim it qualifies. */}
        <figure className="mt-12 rounded-overlay bg-spectrum p-px shadow-[0_24px_60px_-28px_rgb(217_70_239/0.5)]">
          <div className="rounded-[15px] bg-raised p-7 md:p-8">
            <blockquote className="max-w-[24ch] text-[26px] font-semibold leading-[1.15] tracking-[-0.03em] text-ink md:text-[32px]">
              Reconciled is not the same as correct.
            </blockquote>
            <figcaption className="mt-4 max-w-[60ch] text-ui leading-6 text-ink-2">
              Synthesis reconciles the responses it was given; it does not check them against a
              source of truth, and several models agreeing is not proof that they are right. What
              you get is one answer plus the record of how it was assembled, so you can see when
              the models split and go and read the response that disagreed.
            </figcaption>
          </div>
        </figure>
      </Section>
      </div>

      {/* --- Provenance & telemetry: a spec sheet, not a stack ------------ */}
      <Section
        id="provenance"
        surface="raised"
        glow="16 185 129"
        label="PROVENANCE & TELEMETRY"
        title="Every answer records what produced it and what it cost."
        lede="Which models were asked, which answered, which disagreed, measured time to first token and total latency, provider-reported token counts, and an estimated cost. It belongs to the turn, so an answer read months later reports what was recorded when it ran."
      >
        <div className="grid gap-px overflow-hidden rounded-overlay border border-line bg-line lg:grid-cols-2">
          <SpecCell
            hue={HUES.emerald}
            icon={<Gauge size={16} aria-hidden="true" />}
            title="Measured, or marked missing."
            body="Cost is estimated only when a provider reported token usage and a dated list price is on file. Anything absent says Not available or Unknown — never a zero."
            wide
          >
            <PerformanceTransparency />
          </SpecCell>
          <SpecCell
            hue={HUES.indigo}
            icon={<ListChecks size={16} aria-hidden="true" />}
            title="Which models ran, in order."
            body="Provenance is a record of what happened, including the models that failed."
          >
            <UsedModels />
          </SpecCell>
          <SpecCell
            hue={HUES.violet}
            icon={<GitBranch size={16} aria-hidden="true" />}
            title="The same record, beside the answer."
            body="A two-pixel rail, one segment per model in plan order. A break means it diverged; a hollow segment means it never answered."
          >
            <RailLegend />
          </SpecCell>
          <SpecCell
            hue={HUES.amber}
            icon={<ShieldCheck size={16} aria-hidden="true" />}
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
        glow="245 158 11"
        label="THE MODELS"
        title="Six models across six providers."
        lede="Any one of them can answer on its own, be compared side by side in the Model Arena, or contribute to synthesis. The selector lists every model the deployment knows about, available or not."
      >
        <ModelRoster />
      </Section>

      {/* --- CTA: the one vivid panel on the page ---------------------------- */}
      <section className="bg-canvas">
        <MarketingContainer>
          <div className="py-16 md:py-24">
            <div className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(120deg,#4f46e5,#7c3aed_45%,#c026d3_80%,#db2777)] px-7 py-14 text-center shadow-[0_40px_100px_-40px_rgb(124_58_237/0.8)] md:px-14 md:py-20">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(40%_60%_at_15%_10%,rgb(255_255_255/0.35),transparent_70%),radial-gradient(35%_55%_at_90%_90%,rgb(6_182_212/0.6),transparent_70%)]"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgb(255_255_255)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
              />
              <div className="relative">
                <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/80">
                  Get started
                </p>
                <h2 className="mx-auto mt-4 max-w-[18ch] text-[32px] font-semibold leading-[1.08] tracking-[-0.035em] text-white md:text-[52px]">
                  Ask one question. Choose who answers it.
                </h2>
                <p className="mx-auto mt-5 max-w-[48ch] text-[17px] leading-7 text-white/85">
                  Route it, compare it, or combine it — and see exactly what each answer cost.
                </p>
                <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                  <Link
                    to={routes.register}
                    className="inline-flex h-(--control-lg) items-center gap-2 rounded-control bg-white px-6 text-ui font-semibold text-[#4f46e5] shadow-[0_10px_30px_-10px_rgb(0_0_0/0.4)] transition-transform duration-(--duration-instant) hover:-translate-y-px"
                  >
                    Try NexusAI
                    <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                  <Link
                    to={routes.login}
                    className="inline-flex h-(--control-lg) items-center rounded-control border border-white/35 bg-white/10 px-6 text-ui font-medium text-white backdrop-blur transition-colors duration-(--duration-instant) hover:bg-white/20"
                  >
                    Sign in
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </MarketingContainer>
      </section>
    </MarketingLayout>
  );
}

/** One cell of the telemetry spec sheet: a claim, then its illustration. */
function SpecCell({
  hue,
  icon,
  title,
  body,
  wide = false,
  children,
}: {
  hue: Hue;
  icon: ReactNode;
  title: string;
  body: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={clsx('flex flex-col gap-5 bg-workspace p-5 md:p-7', wide && 'lg:col-span-2')}>
      <div>
        <span
          className="mb-4 grid size-9 place-items-center rounded-[10px] text-white"
          style={{ backgroundImage: hue.gradient, boxShadow: `0 8px 20px -8px rgb(${hue.rgb} / 0.8)` }}
        >
          {icon}
        </span>
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
