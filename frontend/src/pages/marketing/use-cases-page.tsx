import { Link } from 'react-router';
import { MarketingLayout, PageHero } from '@/components/marketing/marketing-layout';
import { PerspectivePanel } from '@/components/marketing/perspective-panel';
import { Section } from '@/components/marketing/section';
import { routes } from '@/lib/routes';
import { usePageMetadata } from '@/lib/use-page-metadata';

/**
 * Where multi-model comparison earns its cost.
 *
 * Each case is framed the same way — the problem, what several models add, and
 * what you end up with — because the product's value is the same mechanism
 * every time. No customers, no case studies, no industries this project has
 * never been used in.
 */
export function UseCasesPage() {
  usePageMetadata({
    title: 'Use cases — NexusAI',
    description:
      'Where comparing several models and reconciling them is worth more than a single answer: research, technical work, decision support and learning.',
  });

  return (
    <MarketingLayout>
      <PageHero
        label="USE CASES"
        title="Built for questions where a confident answer is not enough."
        lede="Multi-model costs more than asking one model, in latency and in tokens. It is worth that where being quietly wrong is expensive, or where the disagreement between models is itself the thing you needed to see."
      >
        <PerspectivePanel />
      </PageHero>

      <Section id="cases" surface="raised" label="WHERE IT HELPS" title="Six kinds of question.">
        <ul className="grid gap-px border border-line bg-line md:grid-cols-2">
          {CASES.map((item) => (
            <li key={item.title} className="flex flex-col gap-4 bg-canvas p-6">
              <div>
                <h3 className="text-title font-[550] text-ink">{item.title}</h3>
                <p className="mt-1.5 text-ui text-ink-2">{item.body}</p>
              </div>

              {/* The same four beats each time: what you bring, what several
                  models add, what the synthesis does, what you leave with. */}
              <ol className="mt-auto flex flex-col gap-1.5 border-t border-line-subtle pt-4">
                {['Problem', 'Several perspectives', 'Synthesis', item.outcome].map(
                  (step, index) => (
                    <li key={step} className="flex items-baseline gap-2.5">
                      <span
                        data-register="machine"
                        aria-hidden="true"
                        className="text-note text-ink-3"
                      >
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span
                        className={
                          index === 3 ? 'text-ui text-ink' : 'text-ui text-ink-2'
                        }
                      >
                        {step}
                      </span>
                    </li>
                  ),
                )}
              </ol>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="not" label="WHERE IT DOES NOT" title="When one model is the right tool.">
        <p className="max-w-[62ch] text-body text-ink-2">
          Asking several models is slower and costs more. For a quick reformat, a short draft, or
          anything where you would not check the answer anyway, the extra models buy you nothing
          you were going to use. The workspace lets you pin a single model for exactly that
          reason.
        </p>
        <p className="mt-8 text-ui">
          <Link to={routes.register} className="text-accent hover:underline">
            Try NexusAI →
          </Link>
        </p>
      </Section>
    </MarketingLayout>
  );
}

const CASES = [
  {
    title: 'Research and analysis',
    body: 'Questions where one plausible-sounding answer is the failure mode, and knowing that three independent models reached the same conclusion changes what you do next.',
    outcome: 'A conclusion you can trace',
  },
  {
    title: 'Technical investigation',
    body: 'Architecture and debugging questions where models routinely propose different approaches, and the disagreement is the useful part rather than noise.',
    outcome: 'The approaches, and where they split',
  },
  {
    title: 'Comparing approaches',
    body: 'Where the question has more than one defensible answer and you want the options laid out rather than one of them picked for you.',
    outcome: 'Options, not a verdict',
  },
  {
    title: 'Complex questions',
    body: 'Multi-part questions where one model tends to answer the part it understood best. Several make the missed part visible.',
    outcome: 'The parts nobody answered',
  },
  {
    title: 'Decision support',
    body: 'Where you need the reasoning behind a recommendation, not just the recommendation, and a split between models is a reason to look closer.',
    outcome: 'Reasoning you can audit',
  },
  {
    title: 'Learning something new',
    body: 'Where one explanation can be confident and wrong, and a second reading of the same question is what tells you to check.',
    outcome: 'A second reading',
  },
] as const;
