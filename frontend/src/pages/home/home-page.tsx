import { Navigate } from 'react-router';
import { CtaLink } from '@/components/marketing/cta-link';
import { FailoverDiagram } from '@/components/marketing/failover-diagram';
import { FanOutDiagram } from '@/components/marketing/fan-out-diagram';
import { HeroComposer } from '@/components/marketing/hero-composer';
import { MarketingLayout } from '@/components/marketing/marketing-layout';
import { ModelArenaPreview } from '@/components/marketing/model-arena-preview';
import { ModelRoster } from '@/components/marketing/model-roster';
import { OrchestrationGraph } from '@/components/marketing/orchestration-graph';
import { PerformanceTransparency } from '@/components/marketing/performance-transparency';
import { ProductPreview } from '@/components/marketing/product-preview';
import { RailLegend } from '@/components/marketing/rail-legend';
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
      {/* --- 01 · Hero ---------------------------------------------------- */}
      <section className="bg-canvas">
        <MarketingContainer>
          <div className="pb-16 pt-14 md:pb-20 md:pt-16">
            <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-14">
              <div>
                <Rule label="MULTI-MODEL AI WORKSPACE" className="mb-8" />

                <h1 className="max-w-[16ch] text-hero font-[550] text-ink">
                  One question. The right model — or several.
                </h1>

                <p className="mt-6 max-w-[46ch] text-body text-ink-2">
                  Let Smart Routing pick a model for your task, compare two or more models side by
                  side in the Model Arena, or send the question to several at once and reconcile
                  what comes back into one answer — with measured latency, token counts, and
                  provenance.
                </p>

                <div className="mt-9 flex flex-wrap items-center gap-3">
                  <CtaLink to={routes.register}>Try NexusAI</CtaLink>
                  <CtaLink to="#modes" variant="secondary">
                    See both modes
                  </CtaLink>
                </div>

                <p
                  data-register="machine"
                  className="mt-9 border-t border-line-subtle pt-5 text-note uppercase text-ink-3"
                >
                  Pre-launch · Real model execution verified · Not publicly deployed
                </p>
              </div>

              <div className="flex flex-col gap-4">
                <HeroComposer />
                <div className="border border-line-subtle bg-workspace p-3 md:p-4">
                  <FanOutDiagram />
                </div>
              </div>
            </div>
          </div>
        </MarketingContainer>
      </section>

      {/* --- 02 · The choice ---------------------------------------------- */}
      <Section
        id="modes"
        surface="raised"
        label="WAYS TO ASK"
        title="Direct, Model Arena compare, or synthesised."
        lede="One decision, made per question rather than per account, next to the composer. Let Smart Routing pick a single model that answers in its own words, compare multiple models side by side in the Model Arena and choose your preferred response, or run several models and let a synthesis pass reconcile them."
      >
        <ResponseModes />

        <div className="mt-12 grid gap-6 border-t border-line-subtle pt-10 md:grid-cols-2">
          <div>
            <h3 className="text-title font-[550] text-ink">
              Smart Routing classifies the task, not just the model list.
            </h3>
            <p className="mt-2 max-w-[54ch] text-ui text-ink-2">
              In Standard mode, a deterministic classifier inspects your prompt for coding and
              debugging, research and evidence, summarization, reasoning, or quick questions —
              selecting the best fit among models that are configured and healthy on the server,
              while keeping a manual override in reach.
            </p>
          </div>
          <div>
            <h3 className="text-title font-[550] text-ink">
              Workflow: ask, compare, choose, optionally synthesize.
            </h3>
            <p className="mt-2 max-w-[54ch] text-ui text-ink-2">
              Switch to Compare mode to send one prompt to two or more models concurrently. Inspect
              each response in its own panel, select the answer you want follow-up questions to use
              as context, or click Combine answers to run a synthesis pass over the completed
              outputs.
            </p>
          </div>
        </div>
      </Section>

      {/* --- 03 · Models --------------------------------------------------- */}
      <Section
        id="models"
        label="THE MODELS"
        title="Six models across six providers."
        lede="Any one of them can answer on its own, be compared side by side in the Model Arena, or contribute to synthesis. The selector lists every model the deployment knows about, available or not."
      >
        <ModelRoster />
      </Section>

      {/* --- 04 · How it works --------------------------------------------- */}
      <Section
        id="how-it-works"
        surface="raised"
        label="HOW IT WORKS"
        title="Models run in parallel, and finish when they finish."
        lede="The question goes to every selected model at once, bounded by a worker pool rather than issued as an unbounded burst. Each result is reported the moment it lands rather than held until the slowest finishes — and some do not land at all."
      >
        <OrchestrationGraph />
        <div className="mt-16">
          <StepList steps={STEPS} />
        </div>
      </Section>

      {/* --- 05 · Synthesis ------------------------------------------------ */}
      <Section
        id="synthesis"
        label="SYNTHESIS"
        title="From several responses to one reasoned answer."
        lede="Reconciling is the hard half. Anything can call four APIs and show you four columns — that hands the work back to you. The synthesis pass reads the responses that returned and writes the single answer you actually read, stating agreement once and naming disagreement rather than quietly choosing a side."
      >
        <SynthesisDiagram />

        <div className="mt-16">
          <h3 className="text-title font-[550] text-ink">Agreement is judged, never inferred.</h3>
          <p className="mt-2 max-w-[62ch] text-ui text-ink-2">
            The synthesiser classifies each contributing model against the answer it just wrote,
            in an explicit verdict block. Stance is never derived from string similarity, a
            majority count, or response length — and a model the synthesiser did not classify
            stays unknown rather than being rounded up.
          </p>
          <div className="mt-8">
            <StanceLegend />
          </div>
        </div>

        <p className="mt-16 max-w-[62ch] text-body text-ink-2">
          Reconciled is not the same as correct. Synthesis reconciles the responses it was
          given; it does not check them against a source of truth, and several models agreeing
          is not proof that they are right. What you get is one answer plus the record of how it
          was assembled, so you can see when the models split and go and read the response that
          disagreed.
        </p>
      </Section>

      {/* --- 06 · Provenance & Performance Transparency -------------------- */}
      <Section
        id="provenance"
        surface="raised"
        label="PROVENANCE & TELEMETRY"
        title="Every answer records what produced it and what it cost."
        lede="Which models were asked, which answered, which disagreed, measured response latency, provider-reported token counts, and estimated cost. Everything belongs to the turn, so an answer read months later reports the exact telemetry recorded when it ran."
      >
        <UsedModels />

        <div className="mt-16">
          <h3 className="text-title font-[550] text-ink">
            Transparent performance and verified cost estimation.
          </h3>
          <p className="mt-2 max-w-[62ch] text-ui text-ink-2">
            Every turn exposes time to first token, total completion latency, and actual
            provider-reported input and output token counts. Cost estimates are calculated only when
            both provider token usage and a verified USD pricing rate are present; missing telemetry
            is shown honestly as Not available or Unknown.
          </p>
          <div className="mt-8">
            <PerformanceTransparency />
          </div>
        </div>

        <div className="mt-16">
          <h3 className="text-title font-[550] text-ink">
            The same record, drawn beside the answer.
          </h3>
          <p className="mt-2 max-w-[62ch] text-ui text-ink-2">
            A two-pixel rail runs down the left margin, one segment per model in the order they
            were planned. Position identifies the model, a break means it diverged from the
            synthesis, and a hollow segment means it never answered.
          </p>
          <div className="mt-8">
            <RailLegend />
          </div>
        </div>

        <div className="mt-16">
          <h3 className="text-title font-[550] text-ink">Failure is recorded, not absorbed.</h3>
          <p className="mt-2 max-w-[62ch] text-ui text-ink-2">
            Providers go down, rate-limit and time out. If the model writing the answer fails
            before any text has streamed, the orchestrator moves to the next eligible one — and
            once text has reached you it deliberately does not switch, because rewriting an
            answer you are already reading would be worse than the failure. The eligible set is
            finite: when it is exhausted the turn fails and says so.
          </p>
          <div className="mt-8">
            <FailoverDiagram />
          </div>
        </div>
      </Section>

      {/* --- 07 · Product preview ------------------------------------------ */}
      <Section
        id="product"
        label="THE WORKSPACE"
        title="The answer, the Arena, and the working behind it."
        lede="In Model Arena mode, responses sit side by side so you can compare, choose a preferred answer for follow-up context, or combine them on demand. In Synthesis mode, the reconciled prose sits beside its provenance rail."
      >
        <div className="mb-14">
          <h3 className="mb-3 text-title font-[550] text-ink">
            Model Arena — compare independent answers, choose, or combine.
          </h3>
          <p className="mb-6 max-w-[62ch] text-ui text-ink-2">
            Select a preferred response below to see how Model Arena locks follow-up context to the
            chosen model, or click Combine answers to inspect the on-demand synthesis.
          </p>
          <ModelArenaPreview />
        </div>

        <div>
          <h3 className="mb-3 text-title font-[550] text-ink">
            Synthesised turn — reconciled prose with per-model provenance.
          </h3>
          <p className="mb-6 max-w-[62ch] text-ui text-ink-2">
            When you ask in Synthesis mode, the reconciled answer is typeset directly on the canvas
            with the two-pixel provenance rail beside it and expandable comparison panels below.
          </p>
          <ProductPreview />
        </div>
      </Section>

      {/* --- 08 · CTA ------------------------------------------------------ */}
      <section className="border-t border-line-subtle bg-canvas">
        <MarketingContainer>
          <div className="py-16 md:py-20">
            <Rule label="GET STARTED" className="mb-8" />
            <h2 className="max-w-[20ch] text-section font-[550] text-ink md:text-display">
              Ask one question. Choose who answers it.
            </h2>
            <div className="mt-8 flex flex-wrap items-center gap-3">
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
