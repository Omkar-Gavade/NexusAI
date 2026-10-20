import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import clsx from 'clsx';
import { ArrowRight, Columns2, Sparkles } from 'lucide-react';
import {
  ARENA_MAX_MODELS,
  ARENA_MIN_MODELS,
  classifyTask,
  previewSmartRoute,
  scoreCandidateForTask,
  type RoutableCandidate,
  type TaskCategory,
} from '@nexusai/contracts';
import { writeHomepageDraft } from '@/lib/homepage-draft';
import { routes } from '@/lib/routes';
import { ROSTER } from './model-roster';

/**
 * Samples whose label is what the classifier actually returns for them —
 * checked, not assumed. Two earlier samples were labelled "Research" and
 * "Reasoning" and classified as general and research respectively, so the
 * page contradicted its own instrument.
 */
const SAMPLE_PROMPTS = [
  { label: 'Quick', prompt: 'What is the capital of Australia?' },
  { label: 'General', prompt: 'Explain how vaccines train the immune system, for a curious teenager.' },
  {
    label: 'Coding',
    prompt: 'Debug a TypeScript async race condition when aborting concurrent fetch streams.',
  },
  { label: 'Reasoning', prompt: 'Prove that the square root of 2 is irrational, step by step.' },
  {
    label: 'Research',
    prompt:
      'What are the trade-offs between retrieval-augmented generation and long-context prompting? Evaluate the evidence.',
  },
] as const;

/** The classifier's categories, in order of how much thinking they ask for. */
const TASK_SCALE: ReadonlyArray<{ id: TaskCategory; label: string }> = [
  { id: 'quick', label: 'Quick' },
  { id: 'general', label: 'General' },
  { id: 'summarization', label: 'Summary' },
  { id: 'coding', label: 'Coding' },
  { id: 'reasoning', label: 'Reasoning' },
  { id: 'research', label: 'Research' },
];

/*
 * The catalog's six models, with the catalog's context windows and document
 * capability, because both feed the score. Ids match the server's so the
 * workspace can honour an Arena line-up picked here.
 */
const CATALOG_SHAPE = [
  { id: 'gpt-4o', contextWindow: 128_000, documents: true, roster: ROSTER[0] },
  { id: 'claude-sonnet', contextWindow: 200_000, documents: true, roster: ROSTER[1] },
  { id: 'gemini-flash', contextWindow: 1_048_576, documents: true, roster: ROSTER[2] },
  { id: 'mistral-large', contextWindow: 128_000, documents: false, roster: ROSTER[3] },
  { id: 'deepseek-chat', contextWindow: 64_000, documents: false, roster: ROSTER[4] },
  { id: 'llama-groq', contextWindow: 128_000, documents: false, roster: ROSTER[5] },
] as const;

/*
 * Every model at the same availability. A public page cannot know which
 * providers a deployment has configured or how healthy they are right now, so
 * it shows the router's preference with that variable held equal — and says
 * so. At request time the server scores only the models that can answer.
 */
const CANDIDATES: readonly RoutableCandidate[] = CATALOG_SHAPE.map((shape) => ({
  id: shape.id,
  displayName: shape.roster.model,
  providerId: shape.roster.provider.toLowerCase(),
  availability: 'UNKNOWN',
  contextWindow: shape.contextWindow,
  capabilities: {
    reasoning: true,
    vision: shape.documents,
    audio: false,
    video: false,
    documents: shape.documents,
    toolCalling: true,
  },
}));

/**
 * The hero's instrument: the Smart Router, explaining itself.
 *
 * The same deterministic functions the server runs — `classifyTask`,
 * `scoreCandidateForTask`, `previewSmartRoute` — run here on every keystroke,
 * so what the visitor sees is the routing logic, not a picture of it. The task
 * scale shows where the prompt landed; the board shows how each model scored
 * for that task and which one the router would send it to.
 *
 * Compare switches the same surface to an Arena line-up, and either mode
 * carries the draft — and the chosen Arena models — into the workspace.
 */
export function HeroComposer() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'standard' | 'compare'>('standard');
  const [prompt, setPrompt] = useState<string>(SAMPLE_PROMPTS[2].prompt);
  const [arenaModels, setArenaModels] = useState<string[]>([
    'claude-sonnet',
    'gemini-flash',
    'llama-groq',
  ]);

  const category = useMemo(() => classifyTask(prompt).category, [prompt]);
  const routingPreview = useMemo(
    () => previewSmartRoute(prompt, 'single', CANDIDATES),
    [prompt],
  );
  const board = useMemo(() => {
    const scored = CANDIDATES.map((candidate, index) => ({
      candidate,
      score: scoreCandidateForTask(candidate, category, index),
    }));
    const top = Math.max(...scored.map((s) => s.score));
    const floor = Math.min(...scored.map((s) => s.score)) - 12;
    return [...scored]
      .sort((a, b) => b.score - a.score)
      .map((s) => ({ ...s, share: (s.score - floor) / (top - floor) }));
  }, [category]);
  const chosen = routingPreview.selectedModelIds[0];

  const toggleArenaModel = (id: string) => {
    setArenaModels((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= ARENA_MIN_MODELS) return prev;
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= ARENA_MAX_MODELS) return prev;
      return [...prev, id];
    });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    writeHomepageDraft({
      prompt: prompt.trim(),
      mode,
      ...(mode === 'compare' ? { modelIds: arenaModels } : {}),
    });
    void navigate(routes.register);
  };

  return (
    <div
      data-testid="homepage-composer"
      className={clsx(
        'relative border border-line bg-raised shadow-modal',
        'transition-[border-color] duration-(--duration-quick) ease-out',
        // The prompt has no ring of its own; the instrument's frame takes it.
        'has-[#hero-prompt-input:focus-visible]:border-accent/60',
      )}
    >
      {/* Mode switch, as tabs of one instrument rather than two products. */}
      <div className="flex items-stretch border-b border-line-subtle">
        <div role="group" aria-label="Interaction mode preview" className="flex">
          {(
            [
              { id: 'standard', prefix: 'Standard · ', label: 'Smart Router', Icon: Sparkles },
              { id: 'compare', prefix: 'Compare · ', label: 'Model Arena', Icon: Columns2 },
            ] as const
          ).map(({ id, prefix, label, Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={mode === id}
              onClick={() => setMode(id)}
              className={clsx(
                'relative inline-flex h-10 items-center gap-1.5 whitespace-nowrap px-4 text-ui transition-colors duration-(--duration-instant) max-sm:px-3',
                mode === id ? 'text-ink' : 'text-ink-3 hover:text-ink-2',
              )}
            >
              <Icon size={13} aria-hidden="true" className={mode === id ? 'text-accent' : undefined} />
              {/* The mode name drops on a phone; the feature name carries it. */}
              <span className="max-sm:hidden">{prefix}</span>
              {label}
              <span
                aria-hidden="true"
                className={clsx(
                  'absolute inset-x-3 -bottom-px h-px bg-accent transition-transform duration-(--duration-quick) ease-out',
                  mode === id ? 'scale-x-100' : 'scale-x-0',
                )}
              />
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="px-4 pt-4 md:px-5">
          <label htmlFor="hero-prompt-input" className="sr-only">
            Enter a prompt to preview routing or compare models
          </label>
          <textarea
            id="hero-prompt-input"
            rows={2}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Type a question to see how Smart Routing classifies and routes it…"
            className="w-full resize-none bg-transparent text-[17px] leading-7 text-ink placeholder:text-ink-3 focus-visible:shadow-none focus-visible:outline-none max-md:text-[16px]"
          />

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span data-register="machine" className="mr-1 text-note uppercase text-ink-3">
              Try
            </span>
            {SAMPLE_PROMPTS.map((sample) => (
              <button
                key={sample.label}
                type="button"
                aria-pressed={prompt === sample.prompt}
                onClick={() => setPrompt(sample.prompt)}
                className={clsx(
                  'h-6 rounded-control border px-2 text-meta transition-colors duration-(--duration-instant)',
                  prompt === sample.prompt
                    ? 'border-accent/50 bg-selected text-ink'
                    : 'border-line text-ink-2 hover:border-line-strong hover:text-ink',
                )}
              >
                {sample.label}
              </button>
            ))}
          </div>
        </div>

        {mode === 'standard' ? (
          <div className="mt-4 border-t border-line-subtle px-4 pb-1 pt-4 md:px-5">
            {/* Where the prompt landed on the classifier's scale. */}
            <div className="flex items-baseline justify-between gap-3">
              <span data-register="machine" className="text-note uppercase text-ink-3">
                Task
              </span>
              <span data-register="machine" className="text-note uppercase text-ink-3">
                No model call to classify
              </span>
            </div>
            <ol
              aria-label="Task categories"
              className="mt-2 grid grid-cols-3 gap-px border border-line-subtle bg-line-subtle sm:grid-cols-6"
            >
              {TASK_SCALE.map((task) => {
                const active = task.id === category;
                return (
                  <li
                    key={task.id}
                    aria-current={active ? 'true' : undefined}
                    data-register="machine"
                    className={clsx(
                      'relative truncate px-1 py-1.5 text-center text-[10.5px] uppercase tracking-[0.06em]',
                      'transition-colors duration-(--duration-quick) ease-out',
                      active ? 'bg-selected text-accent' : 'bg-raised text-ink-3',
                    )}
                  >
                    {task.label}
                    {active && <span aria-hidden="true" className="absolute inset-x-0 -bottom-px h-0.5 bg-accent" />}
                  </li>
                );
              })}
            </ol>

            {/* How each model scores for that task. */}
            <ul aria-label="Model scores for this task" className="mt-4 flex flex-col gap-1.5">
              {board.map(({ candidate, share }) => {
                const routed = candidate.id === chosen;
                return (
                  <li key={candidate.id} className="grid grid-cols-[minmax(0,8.5rem)_1fr_auto] items-center gap-3">
                    <span
                      className={clsx(
                        'truncate text-meta transition-colors duration-(--duration-quick)',
                        routed ? 'font-[550] text-ink' : 'text-ink-2',
                      )}
                    >
                      {candidate.displayName}
                    </span>
                    <span aria-hidden="true" className="h-1.5 overflow-hidden bg-workspace">
                      <span
                        className={clsx(
                          'block h-full origin-left transition-transform duration-(--duration-slow) ease-out',
                          routed ? 'bg-accent' : 'bg-line-strong',
                        )}
                        style={{ transform: `scaleX(${share.toFixed(3)})` }}
                      />
                    </span>
                    <span
                      data-register="machine"
                      className={clsx('w-[4.75rem] whitespace-nowrap text-right text-note uppercase', routed ? 'text-accent' : 'text-transparent')}
                    >
                      {routed ? '→ routed' : '·'}
                    </span>
                  </li>
                );
              })}
            </ul>

            <p
              data-testid="homepage-routing-preview"
              aria-live="polite"
              className="mt-4 border-l-2 border-l-accent pl-3 text-ui text-ink"
            >
              {routingPreview.reason}
            </p>
            <p className="mt-1.5 pl-3.5 text-micro text-ink-3">
              Scored with every model equally available. At request time the router only considers
              models this deployment has configured and that are currently healthy, and a manual
              pick always overrides it.
            </p>
          </div>
        ) : (
          <div
            data-testid="homepage-arena-preview"
            className="mt-4 border-t border-line-subtle px-4 pb-1 pt-4 md:px-5"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span data-register="machine" className="text-note uppercase text-ink-3">
                Arena line-up
              </span>
              <span data-register="machine" className="text-note uppercase text-ink-3">
                {arenaModels.length} of {ARENA_MIN_MODELS}–{ARENA_MAX_MODELS}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {CANDIDATES.map((candidate) => {
                const position = arenaModels.indexOf(candidate.id);
                const selected = position !== -1;
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleArenaModel(candidate.id)}
                    className={clsx(
                      'inline-flex h-(--control-sm) items-center gap-1.5 rounded-control border px-2 text-meta transition-colors duration-(--duration-instant)',
                      selected
                        ? 'border-accent/50 bg-selected text-ink'
                        : 'border-line text-ink-2 hover:border-line-strong hover:text-ink',
                    )}
                  >
                    {selected && (
                      <span
                        data-register="machine"
                        aria-hidden="true"
                        className="grid size-3.5 place-items-center rounded-mark bg-accent text-[10px] leading-none text-ink-inv"
                      >
                        {position + 1}
                      </span>
                    )}
                    <span>{candidate.displayName}</span>
                  </button>
                );
              })}
            </div>

            {/* The columns the workspace will open with, in this order. */}
            <div
              aria-hidden="true"
              className="mt-4 grid gap-2"
              style={{ gridTemplateColumns: `repeat(${arenaModels.length}, minmax(0, 1fr))` }}
            >
              {arenaModels.map((id, index) => (
                <div key={id} className="border border-line-subtle bg-workspace p-2">
                  <div className="flex items-center gap-1.5">
                    <span data-register="machine" className="text-[10px] text-ink-3">
                      {index + 1}
                    </span>
                    <span className="truncate text-micro text-ink-2">
                      {CANDIDATES.find((c) => c.id === id)?.displayName}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-col gap-1">
                    <span className="h-1 w-full bg-line" />
                    <span className="h-1 w-4/5 bg-line" />
                    <span className="h-1 w-3/5 bg-line" />
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-3 text-micro text-ink-3">
              One prompt, sent to each model in parallel. Each column streams on its own; pick the
              answer follow-ups should build on, or combine them when you want one.
            </p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle px-4 py-3 md:px-5">
          <span className="text-micro text-ink-3">
            Illustrative preview · Actual availability depends on configured server credentials
          </span>
          <button
            type="submit"
            className="inline-flex h-(--control-md) items-center gap-1.5 rounded-control bg-ink px-3.5 text-ui font-[550] text-ink-inv transition-opacity duration-(--duration-instant) hover:opacity-90"
          >
            <span>{mode === 'compare' ? 'Compare in workspace' : 'Run in workspace'}</span>
            <ArrowRight size={14} aria-hidden="true" />
          </button>
        </div>
      </form>
    </div>
  );
}
