import { Navigate } from 'react-router';
import type { Capability } from '@/components/marketing/capability-table';
import { CapabilityTable } from '@/components/marketing/capability-table';
import { CtaLink } from '@/components/marketing/cta-link';
import { FailurePanel } from '@/components/marketing/failure-panel';
import { MarketingFooter } from '@/components/marketing/marketing-footer';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { FanOutDiagram } from '@/components/marketing/fan-out-diagram';
import { PerspectivePanel } from '@/components/marketing/perspective-panel';
import { RailLegend } from '@/components/marketing/rail-legend';
import { MarketingContainer, Section } from '@/components/marketing/section';
import { StanceLegend } from '@/components/marketing/stance-legend';
import { StepList } from '@/components/marketing/step-list';
import { SynthesisDiagram } from '@/components/marketing/synthesis-diagram';
import { Rule } from '@/components/ui/rule';
import { useSession } from '@/features/auth/use-session';
import { routes } from '@/lib/routes';
import { usePageMetadata } from '@/lib/use-page-metadata';

/**
 * The public entry point.
 *
 * Read top to bottom it is one argument: a single model gives you one reading
 * of a question; several give you a comparison; the comparison is only useful
 * if disagreement survives it; and the answer is only trustworthy if you can
 * see what produced it. Each section carries one step of that, and each is
 * drawn in the product's own notation rather than described in adjectives —
 * the page teaches the interface before the reader reaches it.
 *
 * What it does not contain: a gradient, a glass panel, a glowing orb, a
 * customer logo wall, a testimonial, a usage statistic, an uptime figure, or a
 * compliance badge. None of those are things this project can currently claim,
 * and inventing credibility is the same failure mode as inventing a model
 * response.
 */
export function HomePage() {
  const { data: user } = useSession();

  usePageMetadata({
    title: 'NexusAI — several models, one answer you can check',
    description:
      'NexusAI asks several models the same question, reconciles their responses into one answer, and shows you which models agreed and which did not.',
  });

  // Someone with a session has no use for a landing page. Rendered rather than
  // route-guarded so the page still paints instantly for everyone else.
  if (user) return <Navigate to={routes.workspace} replace />;

  return (
    <div className="min-h-dvh bg-canvas">
      <MarketingNav />

      <main id="main">
        <section className="bg-canvas">
          <MarketingContainer>
            {/* --- 01 · Hero ----------------------------------------------- */}
            <div className="pb-20 pt-14 md:pb-28 md:pt-20">
              <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
                <div>
                  <Rule label="MULTI-MODEL REASONING" className="mb-8" />

                  <h1 className="max-w-[14ch] text-hero font-[550] text-ink">
                    One question. Several models. One answer you can check.
                  </h1>

                  <p className="mt-7 max-w-[48ch] text-body text-ink-2">
                    Asking one model gives you one reading of your question, stated with the
                    same confidence whether it is right or not. NexusAI puts the question to
                    several, reconciles what comes back into a single answer, and shows you
                    where they disagreed.
                  </p>

                  <div className="mt-10 flex flex-wrap items-center gap-3">
                    <CtaLink to={routes.register}>Get started</CtaLink>
                    <CtaLink to="#how-it-works" variant="secondary">
                      See how it works
                    </CtaLink>
                  </div>

                  <p
                    data-register="machine"
                    className="mt-10 border-t border-line-subtle pt-5 text-note uppercase text-ink-3"
                  >
                    Pre-launch · Interface and orchestration built
                  </p>
                </div>

                <FanOutDiagram />
              </div>
            </div>
          </MarketingContainer>
        </section>

          {/* --- 02 · The problem ------------------------------------------ */}
          <Section
            id="why"
            surface="raised"
            label="THE PROBLEM"
            title="One model gives you one reading of the question."
            lede="A single answer arrives with no indication of how much of it to trust. You cannot see whether the model was confident because the question was easy, or confident because confidence is what these systems produce. Asking several does not upgrade any single response — it makes the shape of the question visible."
          >
            <div className="grid gap-x-10 gap-y-8 md:grid-cols-2">
              {DIFFERENCES.map((item) => (
                <div key={item.title}>
                  <h3 className="text-title font-[550] text-ink">{item.title}</h3>
                  <p className="mt-1.5 max-w-[46ch] text-ui text-ink-2">{item.body}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* --- 03 · Several models --------------------------------------- */}
          <Section
            id="models"
            label="SEVERAL MODELS"
            title="The same question, read three different ways."
            lede="Models do not fail identically. Two will often take a question one way while a third takes it another, and that split is a fact about the question, not noise to be averaged away. NexusAI keeps the responses distinct so the split is something you can see."
          >
            <PerspectivePanel />
          </Section>

          {/* --- 04 · How it works ----------------------------------------- */}
          <Section
            id="how-it-works"
            layout="split"
            surface="raised"
            label="HOW IT WORKS"
            title="One prompt in. One reconciled answer out."
          >
            <StepList steps={STEPS} />
          </Section>

          {/* --- 05 · Synthesis -------------------------------------------- */}
          <Section
            id="synthesis"
            label="SYNTHESIS"
            title="You read the conclusion, not the transcript."
            lede="The synthesis stage reads the responses that returned and writes one answer: stating agreement once, naming genuine disagreement rather than choosing a side quietly, and leaving out what it cannot corroborate. It is a second model doing real work, not a summary stitched from the others."
          >
            <SynthesisDiagram />
          </Section>

          {/* --- 06 · Disagreement ----------------------------------------- */}
          <Section
            id="disagreement"
            layout="split"
            surface="raised"
            label="DISAGREEMENT"
            title="Agreement is counted. Disagreement is kept."
            lede="Every contributing model is classified against the answer that was written — by the synthesis stage that wrote it, not by comparing strings. A model that was never classified stays unknown, and unknown is never rounded up to agreement."
          >
            <StanceLegend />
          </Section>

          {/* --- 07 · Provenance ------------------------------------------- */}
          <Section
            id="provenance"
            label="PROVENANCE"
            title="Every answer shows its working."
            lede="A two-pixel rail runs down the left margin of each answer, one segment per model that contributed. Position identifies the model, and a break in a segment means that model diverged from the synthesis. Open any segment to read what it actually said."
          >
            <RailLegend />

            <div className="mt-12 grid gap-x-10 gap-y-8 md:grid-cols-2">
              {PROVENANCE_POINTS.map((item) => (
                <div key={item.title}>
                  <h3 className="text-title font-[550] text-ink">{item.title}</h3>
                  <p className="mt-1.5 max-w-[46ch] text-ui text-ink-2">{item.body}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* --- 08 · Failure honesty -------------------------------------- */}
          <Section
            id="failure"
            surface="raised"
            label="WHEN A MODEL FAILS"
            title="A model that did not answer is not quietly replaced."
            lede="Providers go down, rate-limit, and time out. The tempting behaviour is to proceed with what returned and present the result as though everything had answered. Instead the failed model keeps its place in the rail, the count says how many actually responded, and the answer is built from the rest."
          >
            <FailurePanel />
          </Section>

          {/* --- 09 · Use cases -------------------------------------------- */}
          <Section
            id="use-cases"
            layout="split"
            label="WHERE IT HELPS"
            title="Built for work where being wrong is expensive."
          >
            <div className="grid gap-x-10 gap-y-9 sm:grid-cols-2">
              {USE_CASES.map((item) => (
                <div key={item.title}>
                  <h3 className="text-title font-[550] text-ink">{item.title}</h3>
                  <p className="mt-1.5 text-ui text-ink-2">{item.body}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* --- 10 · Capabilities ----------------------------------------- */}
          <Section
            id="capabilities"
            surface="raised"
            label="CAPABILITIES"
            title="What is built, and what is not."
            lede="NexusAI is pre-launch. The interface and the streaming protocol below are built; model execution is not yet running, so nothing here describes a live service. Both states are listed on the same page with the same weight."
          >
            <CapabilityTable capabilities={CAPABILITIES} />
          </Section>

          {/* --- 11 · What is measured ------------------------------------- */}
          <Section id="measured" label="WHAT IS MEASURED">
            <p className="max-w-[62ch] text-body text-ink-2">
              Model names, response times and agreement counts are measured, never estimated. If
              a model fails to answer, the interface says so and tells you the synthesis was
              built without it. There are no confidence percentages anywhere in the product,
              because nothing computes one.
            </p>
          </Section>

        {/* --- 12 · Final CTA ---------------------------------------------- */}
        <section className="border-t border-line-subtle bg-canvas">
          <MarketingContainer>
            <div className="py-20 md:py-28">
              <Rule label="GET STARTED" className="mb-8" />
              <h2 className="max-w-[18ch] text-section font-[550] text-ink md:text-hero">
                Ask once. Check the working.
              </h2>
              <p className="mt-5 max-w-[52ch] text-body text-ink-2">
                Create an account to explore the workspace, the comparison view and the
                provenance rail.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <CtaLink to={routes.register}>Create an account</CtaLink>
                <CtaLink to={routes.login} variant="secondary">
                  Sign in
                </CtaLink>
              </div>
            </div>
          </MarketingContainer>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}

const DIFFERENCES = [
  {
    title: 'Models fail differently',
    body: 'Two models rarely make the same mistake on the same question. Where they diverge is a signal about the question, and it is the part worth your attention.',
  },
  {
    title: 'Agreement is information',
    body: 'When several independent models reach the same conclusion, that is worth more than one confident answer. NexusAI counts it and tells you.',
  },
  {
    title: 'Comparison is work',
    body: 'Reading four responses and reconciling them yourself is the task most multi-model tools hand back to the user. Here it happens before you read anything.',
  },
  {
    title: 'No model to choose',
    body: 'You do not need to know which model is best at what. Routing is the product’s job, and you can still pin a specific model when you want one.',
  },
] as const;

const STEPS = [
  {
    title: 'Ask once',
    body: 'One prompt, one composer. There is no model to pick unless you want to pick one.',
  },
  {
    title: 'Models run',
    body: 'The request goes to models suited to the task and they run in parallel, not one after another.',
  },
  {
    title: 'Responses are compared',
    body: 'Each response is kept whole and distinct, so agreement and divergence can be established against the answer rather than guessed from the text.',
  },
  {
    title: 'One answer is written',
    body: 'A synthesis model reconciles the responses that returned, and that is what appears in the reading column.',
  },
  {
    title: 'The trail stays',
    body: 'Provenance records which models contributed, how long each took, and which diverged. Open any of them to read the original response.',
  },
] as const;

const PROVENANCE_POINTS = [
  {
    title: 'No vendor colours',
    body: 'Models are distinguished by position and density, never by their company’s brand colour. The interface is not an aggregator of other people’s logos.',
  },
  {
    title: 'Readable without colour',
    body: 'Divergence is a physical break in the rail, so it survives greyscale, high-contrast mode and 200% zoom. Colour is never the only signal.',
  },
  {
    title: 'Every segment is a control',
    body: 'The rail is not a picture of something you click elsewhere. Each segment is a real, keyboard-reachable button that opens that model’s response.',
  },
  {
    title: 'Failures are visible',
    body: 'If a model does not answer, its segment renders hollow and the answer says how many models actually responded.',
  },
] as const;

const USE_CASES = [
  {
    title: 'Research and analysis',
    body: 'Questions where a single plausible-sounding answer is the failure mode, and knowing that three sources agree changes what you do next.',
  },
  {
    title: 'Technical problem solving',
    body: 'Architecture and debugging questions where models often propose different approaches and the disagreement is the useful part.',
  },
  {
    title: 'Writing and editing',
    body: 'Drafting where several attempts reconciled into one is stronger than the first response you happened to get.',
  },
  {
    title: 'Decision support',
    body: 'Comparing options where you need to see the reasoning behind a recommendation, not just the recommendation.',
  },
  {
    title: 'Learning something new',
    body: 'Where one explanation may be confident and wrong, and seeing a second reading of the same question is what tells you to look closer.',
  },
  {
    title: 'Reviewing an argument',
    body: 'Questions with more than one defensible reading, where the split between models is more informative than any single verdict.',
  },
] as const;

const CAPABILITIES: readonly Capability[] = [
  {
    name: 'Multi-model routing',
    description: 'One prompt fanned out across several models in parallel, or pinned to one you choose.',
    status: 'interface',
  },
  {
    name: 'Synthesis',
    description: 'Responses reconciled into a single answer, streamed as it is written.',
    status: 'interface',
  },
  {
    name: 'Provenance rail',
    description: 'Per-model contribution and divergence, inspectable beside every answer.',
    status: 'interface',
  },
  {
    name: 'Model comparison',
    description: 'Read any individual model’s response on its own, in full.',
    status: 'interface',
  },
  {
    name: 'Model availability',
    description: 'Every model reports whether it is configured and reachable, rather than failing at send time.',
    status: 'interface',
  },
  {
    name: 'Conversation history',
    description: 'Conversations persist, with search, rename and delete.',
    status: 'interface',
  },
  {
    name: 'Light and dark themes',
    description: 'Two independently designed themes, not one inverted into the other.',
    status: 'interface',
  },
  {
    name: 'Sources',
    description: 'Cited evidence listed under an answer. Requires retrieval the product does not yet do.',
    status: 'planned',
  },
  {
    name: 'Attachments',
    description: 'Send documents alongside a prompt. The interface exists; upload is not wired.',
    status: 'planned',
  },
  {
    name: 'Projects',
    description: 'Group related conversations under a shared context.',
    status: 'planned',
  },
  {
    name: 'Knowledge',
    description: 'Persistent reference material available across conversations.',
    status: 'planned',
  },
] as const;
