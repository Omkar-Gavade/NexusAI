import { Link } from 'react-router';
import { FailoverDiagram } from '@/components/marketing/failover-diagram';
import { FanOutDiagram } from '@/components/marketing/fan-out-diagram';
import { MarketingLayout, PageHero } from '@/components/marketing/marketing-layout';
import { OrchestrationGraph } from '@/components/marketing/orchestration-graph';
import { RailLegend } from '@/components/marketing/rail-legend';
import { Section } from '@/components/marketing/section';
import { StepList } from '@/components/marketing/step-list';
import { routes } from '@/lib/routes';
import { usePageMetadata } from '@/lib/use-page-metadata';

/**
 * The mechanism, in order, for a reader who wants it.
 *
 * This is where the homepage's detail went. It can be denser and more
 * technical than the homepage because everyone here arrived by choosing to.
 */
export function HowItWorksPage() {
  usePageMetadata({
    title: 'How it works — NexusAI',
    description:
      'How NexusAI turns one question into a multi-model answer: fan-out, independent responses, synthesis, streaming and provenance.',
  });

  return (
    <MarketingLayout>
      <PageHero
        label="HOW IT WORKS"
        title="How NexusAI turns one question into a multi-model answer."
        lede="One prompt goes to several models at once. Their responses come back at different times, and some do not come back at all. A synthesis pass reconciles what arrived, streams a single answer, and records what actually happened."
      >
        <OrchestrationGraph />
      </PageHero>

      <Section
        id="stages"
        surface="raised"
        layout="split"
        label="THE STAGES"
        title="Six stages, in the order they happen."
      >
        <StepList steps={STEPS} />
      </Section>

      <Section
        id="fan-out"
        label="FAN-OUT AND RETURN"
        title="Models run in parallel, and finish when they finish."
        lede="The fan-out is bounded by a worker pool, so one request cannot become an unbounded burst of provider calls. Each model's result is reported the moment it lands rather than held until the slowest finishes — the rail fills in as the responses arrive."
      >
        <FanOutDiagram />
      </Section>

      <Section
        id="provenance"
        surface="raised"
        layout="split"
        label="PROVENANCE"
        title="Every answer records what produced it."
        lede="A two-pixel rail runs down the left margin of each answer, one segment per model in the order they were planned. Position identifies the model, a break means that model diverged from the synthesis, and a hollow segment means it never answered."
      >
        <RailLegend />
      </Section>

      <Section
        id="failure"
        label="WHEN A PROVIDER FAILS"
        title="Failure is recorded, not absorbed."
        lede="Providers go down, rate-limit and time out. A model that does not answer keeps its place in the rail and the answer says how many actually responded. If the model writing the answer fails before any text has streamed, the orchestrator moves to the next eligible model — and once text has started, it deliberately does not switch."
      >
        <FailoverDiagram />
      </Section>

      <Section id="next" surface="raised" label="NEXT" title="Synthesis is where the work happens.">
        <p className="max-w-[62ch] text-body text-ink-2">
          Fan-out is the easy half. Reconciling several responses into one answer without
          flattening the disagreement is the part that decides whether any of this is useful.
        </p>
        <p className="mt-6 text-ui">
          <Link to={routes.synthesis} className="text-accent hover:underline">
            How synthesis works →
          </Link>
        </p>
      </Section>
    </MarketingLayout>
  );
}

const STEPS = [
  {
    title: 'Question',
    body: 'One prompt enters the orchestration layer. There is no model to choose unless you want to choose one.',
  },
  {
    title: 'Fan-out',
    body: 'The request goes to the models the routing mode selected, in parallel, bounded by a worker pool rather than issued all at once.',
  },
  {
    title: 'Responses',
    body: 'Each model returns independently. Per-model text is not streamed — a model reports once, whole, so its response can be compared rather than watched.',
  },
  {
    title: 'Synthesis',
    body: 'A synthesis model receives the question and the responses that returned, and writes one answer reconciling them.',
  },
  {
    title: 'Streaming',
    body: 'The synthesis streams token by token as it is written. Only the synthesis streams; the models do not.',
  },
  {
    title: 'Provenance',
    body: 'Model identity, latency, outcome and stance are persisted with the answer, and rendered beside it when you come back to it later.',
  },
] as const;
