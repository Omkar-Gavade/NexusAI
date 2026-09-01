import { Link } from 'react-router';
import { MarketingLayout, PageHero } from '@/components/marketing/marketing-layout';
import { Section } from '@/components/marketing/section';
import { StanceLegend } from '@/components/marketing/stance-legend';
import { StepList } from '@/components/marketing/step-list';
import { SynthesisDiagram } from '@/components/marketing/synthesis-diagram';
import { routes } from '@/lib/routes';
import { usePageMetadata } from '@/lib/use-page-metadata';

/**
 * Synthesis in detail — the stage that makes the fan-out worth doing.
 *
 * The claims here are deliberately bounded. The synthesis reconciles what it
 * was given; it does not verify facts, and nothing on this page should suggest
 * that reconciling several responses makes the result correct.
 */
export function SynthesisPage() {
  usePageMetadata({
    title: 'Synthesis — NexusAI',
    description:
      'How NexusAI reconciles several independent model responses into one answer, and how stance is established from an explicit verdict rather than inferred.',
  });

  return (
    <MarketingLayout>
      <PageHero
        label="SYNTHESIS"
        title="From several responses to one reasoned answer."
        lede="Reconciling is the hard half. Anything can call four APIs and show you four columns — that hands the work back to you. The synthesis pass reads the responses that returned and writes the single answer you actually read."
      >
        <SynthesisDiagram />
      </PageHero>

      <Section
        id="pass"
        surface="raised"
        layout="split"
        label="THE PASS"
        title="What the synthesis stage is given, and what it does with it."
      >
        <StepList steps={STEPS} />
      </Section>

      <Section
        id="stance"
        label="STANCE"
        title="Agreement is judged, never inferred."
        lede="The synthesiser classifies each contributing model against the answer it just wrote, in an explicit verdict block. Stance is never derived from string similarity, a majority count, or response length — and a model the synthesiser did not classify stays unknown rather than being rounded up."
      >
        <StanceLegend />
      </Section>

      <Section
        id="boundary"
        surface="raised"
        layout="split"
        label="TRUST BOUNDARY"
        title="Model output is untrusted input."
        lede="Responses arrive from other vendors' systems and are then placed next to the synthesis instructions. Each response and the question itself are wrapped in a fence carrying a random per-turn label, so no response can close its own section and issue instructions of its own. Content is passed through byte for byte — an attempt to hijack the synthesis is evidence about that model's output, not something to censor."
      >
        <ul className="flex flex-col gap-5">
          {BOUNDARY.map((item) => (
            <li key={item.title}>
              <h3 className="text-title font-[550] text-ink">{item.title}</h3>
              <p className="mt-1.5 max-w-[52ch] text-ui text-ink-2">{item.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="limits" label="WHAT IT DOES NOT DO" title="Reconciled is not the same as correct.">
        <p className="max-w-[62ch] text-body text-ink-2">
          Synthesis reconciles the responses it was given. It does not check them against a source
          of truth, and several models agreeing is not proof that they are right — models can
          share a misconception as easily as a fact. What the product gives you is a single
          answer plus the record of how it was assembled, so you can see when the models split
          and go and read the response that disagreed.
        </p>
        <p className="mt-8 text-ui">
          <Link to={routes.useCases} className="text-accent hover:underline">
            Where this helps →
          </Link>
        </p>
      </Section>
    </MarketingLayout>
  );
}

const STEPS = [
  {
    title: 'Responses are collected',
    body: 'Every model that returned usable text becomes a contribution. Models that failed or returned nothing are excluded from the input and recorded as failures.',
  },
  {
    title: 'The pass receives question and responses',
    body: 'The synthesis model is given the original question and each response, fenced and labelled by model, as data to reconcile.',
  },
  {
    title: 'The responses are reconciled',
    body: 'Agreement is stated once. Genuine disagreement is named rather than silently resolved. A claim only one response makes and the synthesiser cannot corroborate is attributed or left out.',
  },
  {
    title: 'Stance is classified',
    body: 'Before the answer, the synthesiser emits a verdict block classifying each contributing model as concurring or diverging.',
  },
  {
    title: 'Unparseable verdicts stay unknown',
    body: 'If the block is missing, malformed, or names a model that was not in the plan, those models keep the stance unknown. Nothing is guessed.',
  },
  {
    title: 'The answer streams and persists',
    body: 'The verdict block is withheld from you — it is machine notation — and the answer streams as it is written, then persists with its provenance.',
  },
] as const;

const BOUNDARY = [
  {
    title: 'A per-turn fence label',
    body: 'The label is random and regenerated if it happens to appear in the content, so a response cannot contain its own closing marker.',
  },
  {
    title: 'The question is fenced too',
    body: 'The person asking is an untrusted party here as well: without it, a prompt could forge a response block for a model that never ran.',
  },
  {
    title: 'Counts come from the backend',
    body: 'Agreement and provenance are computed from observed outcomes, never taken from anything the synthesiser was persuaded to say.',
  },
] as const;
