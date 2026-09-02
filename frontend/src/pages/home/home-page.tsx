import { Navigate } from 'react-router';
import { CtaLink } from '@/components/marketing/cta-link';
import { FailoverDiagram } from '@/components/marketing/failover-diagram';
import { FanOutDiagram } from '@/components/marketing/fan-out-diagram';
import { MarketingLayout } from '@/components/marketing/marketing-layout';
import { ModelRoster } from '@/components/marketing/model-roster';
import { OrchestrationGraph } from '@/components/marketing/orchestration-graph';
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
 *   what do I choose  direct, or synthesis  (§modes — the only section that
 *                     must land; everything after it is mechanism)
 *   how does it work  fan-out, responses, synthesis, streaming, provenance
 *   what do I know    which models ran, and whether the answer was reconciled
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
      'NexusAI is a multi-model AI workspace. Choose a model for a direct answer, or send the question to several and get their responses reconciled into one — with a record of which models took part.',
  });

  if (user) return <Navigate to={routes.workspace} replace />;

  return (
    <MarketingLayout>
      {/* --- 01 · Hero ---------------------------------------------------- */}
      <section className="bg-canvas">
        <MarketingContainer>
          <div className="pb-16 pt-14 md:pb-20 md:pt-16">
            {/* 0.92/1.08, not 0.82/1.18. The narrower column measured 400px at
                1440, which broke the headline into four lines with "model — or"
                dangling on the third; 440px is where it settles into three. The
                frame loses 48px and is still the wider half. */}
            <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-14">
              <div>
                <Rule label="MULTI-MODEL AI WORKSPACE" className="mb-8" />

                <h1 className="max-w-[16ch] text-hero font-[550] text-ink">
                  One question. The right model — or several.
                </h1>

                <p className="mt-6 max-w-[46ch] text-body text-ink-2">
                  Choose a model and it answers you directly. Or send the question to several at
                  once and NexusAI reconciles what comes back into one answer — with a record of
                  which models took part and where they disagreed.
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

              {/* A mat around the product frame: one quiet surface, one hairline,
                  and the frame's own elevation inside it. The diagram stops
                  reading as a drawing placed on the page and starts reading as
                  an interface sitting on a surface — which is the whole
                  difference between an illustration and a product shot. */}
              <div className="border border-line-subtle bg-workspace p-3 md:p-4">
                <FanOutDiagram />
              </div>
            </div>
          </div>
        </MarketingContainer>
      </section>

      {/* --- 02 · The choice ---------------------------------------------- */}
      <Section
        id="modes"
        surface="raised"
        label="TWO WAYS TO ASK"
        title="Direct, or synthesised."
        lede="One decision, made per question rather than per account, next to the composer. A single model answers you in its own words. Several models answer independently and a synthesis pass reconciles them. Neither is the lesser mode — for work you were not going to check anyway, the extra models buy you nothing you were going to use."
      >
        <ResponseModes />
      </Section>

      {/* --- 03 · Models --------------------------------------------------- */}
      <Section
        id="models"
        label="THE MODELS"
        title="Six models across six providers."
        lede="Any one of them can answer on its own, and the synthesis modes draw from the same set. The selector lists every model the deployment knows about, available or not."
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

      {/* --- 06 · Provenance ----------------------------------------------- */}
      <Section
        id="provenance"
        surface="raised"
        label="PROVENANCE"
        title="Every answer records what produced it."
        lede="Which models were asked, which answered, which disagreed, and whether the answer was reconciled or came straight from one model. It belongs to the turn, so an answer read months later reports the models that produced it rather than whatever is selected now."
      >
        <UsedModels />

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
        title="The answer, and the working behind it."
        lede="The synthesis is what you read. The provenance rail beside it records every model that took part, and opening a segment shows what that model actually said."
      >
        <ProductPreview />
      </Section>

      {/* --- 08 · CTA ------------------------------------------------------ */}
      <section className="border-t border-line-subtle bg-canvas">
        <MarketingContainer>
          <div className="py-16 md:py-20">
            <Rule label="GET STARTED" className="mb-8" />
            <h2 className="max-w-[20ch] text-section font-[550] text-ink md:text-display">
              Ask one question. Choose who answers it.
            </h2>
            <div className="mt-8">
              <CtaLink to={routes.register}>Try NexusAI</CtaLink>
            </div>
          </div>
        </MarketingContainer>
      </section>
    </MarketingLayout>
  );
}

/**
 * The pipeline, in the order it happens. Moved here verbatim from the page it
 * used to live on — the facts are the orchestrator's, not the copywriter's.
 */
const STEPS = [
  {
    title: 'Question',
    body: 'One prompt enters the orchestration layer. There is no model to choose unless you want to choose one.',
  },
  {
    title: 'Fan-out',
    body: 'The request goes to the models the response mode selected, in parallel, bounded by a worker pool rather than issued all at once.',
  },
  {
    title: 'Responses',
    body: 'Each model returns independently. Per-model text is not streamed — a model reports once, whole, so its response can be compared rather than watched.',
  },
  {
    title: 'Synthesis',
    body: 'A synthesis model receives the question and the responses that returned, and writes one answer reconciling them. A single chosen model skips this stage entirely.',
  },
  {
    title: 'Streaming',
    body: 'The answer streams as it is written. Only the answer streams; the contributing models do not.',
  },
  {
    title: 'Provenance',
    body: 'Model identity, latency, outcome and stance are persisted with the answer, and rendered beside it when you come back to it later.',
  },
] as const;
