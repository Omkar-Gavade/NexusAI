import { Link, Navigate } from 'react-router';
import { CtaLink } from '@/components/marketing/cta-link';
import { FanOutDiagram } from '@/components/marketing/fan-out-diagram';
import { MarketingLayout } from '@/components/marketing/marketing-layout';
import { ModelRoster } from '@/components/marketing/model-roster';
import { OrchestrationGraph } from '@/components/marketing/orchestration-graph';
import { ProductPreview } from '@/components/marketing/product-preview';
import { MarketingContainer, Section } from '@/components/marketing/section';
import { Rule } from '@/components/ui/rule';
import { useSession } from '@/features/auth/use-session';
import { routes } from '@/lib/routes';
import { usePageMetadata } from '@/lib/use-page-metadata';

/**
 * The public entry point.
 *
 * Six sections, deliberately. This page used to carry every explanation the
 * product has, which made it long, even in weight, and slow to reach a point.
 * The detail now lives on `/how-it-works`, `/synthesis` and `/use-cases`, and
 * the homepage does one job: say what NexusAI is, show it running, and let a
 * reader who wants the mechanism go and get it.
 *
 * What it does not contain: a gradient, a glowing orb, a customer logo wall, a
 * testimonial, a usage statistic, an uptime figure, or a compliance badge.
 * None of those are things this project can currently claim, and inventing
 * credibility is the same failure as inventing a model response.
 */
export function HomePage() {
  const { data: user } = useSession();

  usePageMetadata({
    title: 'NexusAI — one question, multiple models, one answer you can check',
    description:
      'NexusAI runs one question across multiple AI models in parallel, then reconciles their responses into a single answer with transparent provenance.',
  });

  if (user) return <Navigate to={routes.workspace} replace />;

  return (
    <MarketingLayout>
      {/* --- 01 · Hero ---------------------------------------------------- */}
      <section className="bg-canvas">
        <MarketingContainer>
          <div className="pb-16 pt-14 md:pb-20 md:pt-16">
            <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:gap-14">
              <div>
                <Rule label="MULTI-MODEL ORCHESTRATION" className="mb-8" />

                <h1 className="max-w-[13ch] text-hero font-[550] text-ink">
                  One question. Multiple models. One better answer.
                </h1>

                <p className="mt-6 max-w-[46ch] text-body text-ink-2">
                  NexusAI runs your question across multiple AI models in parallel, then
                  reconciles what comes back into a single answer — with a record of which
                  models responded and where they disagreed.
                </p>

                <div className="mt-9 flex flex-wrap items-center gap-3">
                  <CtaLink to={routes.register}>Try NexusAI</CtaLink>
                  <CtaLink to={routes.howItWorks} variant="secondary">
                    See how it works
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

      {/* --- 02 · Why multiple models -------------------------------------- */}
      <Section
        id="difference"
        surface="raised"
        label="MULTI-MODEL ORCHESTRATION"
        title="One question, several models, one synthesis."
        lede="The question goes to every selected model at once. They run independently and finish at different times, a synthesis pass reconciles what came back, and the answer records which models took part. A single response arrives with the same confidence whether it is right or not — running several is what shows you where they part company."
      >
        <OrchestrationGraph />
      </Section>

      {/* --- 03 · Models --------------------------------------------------- */}
      <Section
        id="models"
        label="CHOOSE YOUR MODEL"
        title="Six models across six providers. You decide how many answer."
        lede="Pick one model and it answers you directly, with no synthesis pass — the response is that model's, unedited. Or send the question to three or five at once and get the reconciled answer instead. The choice sits next to the composer and changes per question, not per account."
      >
        <ModelRoster />
        <FailoverNote />
      </Section>

      {/* --- 04 · Product preview ------------------------------------------ */}
      <Section
        id="product"
        surface="raised"
        label="THE WORKSPACE"
        title="The answer, and the working behind it."
        lede="The synthesis is what you read. The provenance rail beside it records every model that took part, and opening a segment shows what that model actually said."
      >
        <ProductPreview />
      </Section>

      {/* --- 05 · Value ---------------------------------------------------- */}
      <Section id="value" label="WHAT YOU GET" title="Four things a single model cannot give you.">
        <div className="grid gap-x-10 gap-y-9 sm:grid-cols-2">
          {VALUE.map((item) => (
            <div key={item.title}>
              <h3 className="text-title font-[550] text-ink">{item.title}</h3>
              <p className="mt-1.5 max-w-[46ch] text-ui text-ink-2">{item.body}</p>
            </div>
          ))}
        </div>

        <p className="mt-10 text-ui">
          <Link to={routes.howItWorks} className="text-accent hover:underline">
            Explore how it works →
          </Link>
        </p>
      </Section>

      {/* --- 06 · CTA ------------------------------------------------------ */}
      <section className="border-t border-line-subtle bg-canvas">
        <MarketingContainer>
          <div className="py-16 md:py-20">
            <Rule label="GET STARTED" className="mb-8" />
            <h2 className="max-w-[20ch] text-section font-[550] text-ink md:text-display">
              Ask one question. See what multiple models find.
            </h2>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <CtaLink to={routes.register}>Try NexusAI</CtaLink>
              <CtaLink to={routes.synthesis} variant="secondary">
                Explore the architecture
              </CtaLink>
            </div>
          </div>
        </MarketingContainer>
      </section>
    </MarketingLayout>
  );
}

/**
 * Failover, as a strip rather than a section.
 *
 * This describes exactly what `orchestrator.ts` does and nothing more. The
 * synthesis model is chosen from the eligible set; if it fails **before any
 * text has streamed**, the orchestrator tries the next eligible one. After text
 * has reached the reader it deliberately does not fail over, because rewriting
 * an answer someone is already reading would be worse than the failure.
 *
 * What it must never imply: unlimited retries, or that a model is always
 * reachable. The eligible set is finite, and when it is exhausted the turn
 * fails and says so.
 */
function FailoverNote() {
  const STEPS = ['Synthesis model fails', 'Next eligible model', 'Answer continues'] as const;

  return (
    <div className="mt-4 border border-line bg-canvas px-4 py-3.5">
      <ol className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        {STEPS.map((step, index) => (
          <li key={step} className="flex items-center gap-2.5">
            {index > 0 && (
              <span aria-hidden="true" className="text-note text-ink-3">
                →
              </span>
            )}
            <span
              data-register="machine"
              className={index === 0 ? 'text-note uppercase text-ink-3' : 'text-note uppercase text-ink-2'}
            >
              {step}
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-2.5 max-w-[68ch] text-ui text-ink-2">
        Failover applies only before any text has streamed. Once the answer has started
        arriving it is never silently rewritten, and a model that dropped out is reported in
        the provenance rather than hidden. The eligible set is finite — if it is exhausted the
        turn fails and says so.
      </p>
    </div>
  );
}

const VALUE = [
  {
    title: 'Multiple perspectives',
    body: 'Compare what several models make of the same question instead of depending on whichever one you happened to ask.',
  },
  {
    title: 'Synthesis',
    body: 'A dedicated pass reconciles the responses into one answer, stating agreement once and naming disagreement rather than quietly choosing a side.',
  },
  {
    title: 'Provenance',
    body: 'Every answer records which models took part, how long each took, and how each was classified against the answer that was written.',
  },
  {
    title: 'Resilience',
    body: 'Provider failures and rate limits are recorded and shown. If the model writing the answer fails before streaming, another eligible model writes it.',
  },
] as const;
