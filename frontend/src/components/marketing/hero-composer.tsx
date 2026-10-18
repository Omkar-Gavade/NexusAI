import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import clsx from 'clsx';
import { ArrowRight, Columns2, Sparkles } from 'lucide-react';
import {
  previewSmartRoute,
  type RoutableCandidate,
} from '@nexusai/contracts';
import { HOMEPAGE_DRAFT_STORAGE_KEY, routes } from '@/lib/routes';
import { ROSTER } from './model-roster';

const SAMPLE_PROMPTS = [
  {
    label: 'General',
    prompt: 'What is the capital of Japan, and why is its legal status unusual?',
  },
  {
    label: 'Coding',
    prompt: 'Debug a TypeScript async race condition when aborting concurrent fetch streams.',
  },
  {
    label: 'Reasoning',
    prompt: 'Compare the trade-offs between Raft and Paxos consensus under network partitions.',
  },
  {
    label: 'Research',
    prompt: 'Compare the evidence and methodology behind retrieval-augmented generation vs long-context prompting.',
  },
] as const;

const ILLUSTRATIVE_IDS = [
  'gpt-4o',
  'claude-sonnet',
  'gemini-flash',
  'mistral-large',
  'deepseek-chat',
  'llama-groq',
] as const;

const ILLUSTRATIVE_CANDIDATES: readonly RoutableCandidate[] = ROSTER.map((entry, idx) => ({
  id: ILLUSTRATIVE_IDS[idx] ?? `model-${idx}`,
  displayName: entry.model,
  providerId: entry.provider.toLowerCase(),
  availability: idx === 2 || idx === 5 ? 'AVAILABLE' : 'UNKNOWN',
  contextWindow: idx === 2 ? 1_000_000 : 128_000,
  capabilities: {
    reasoning: true,
    vision: idx < 4,
    audio: idx === 2,
    video: idx === 2,
    documents: idx < 3,
    toolCalling: true,
  },
}));

/**
 * Interactive prompt composer and Standard / Compare mode selector in the hero.
 *
 * Uses the shared deterministic task classifier (`previewSmartRoute`) so a
 * visitor can test how Smart Routing classifies prompts and picks models, or
 * switch to Compare mode (Model Arena) and carry their draft into the
 * workspace flow.
 */
export function HeroComposer() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'standard' | 'compare'>('standard');
  const [prompt, setPrompt] = useState<string>(SAMPLE_PROMPTS[0].prompt);
  const [arenaModels, setArenaModels] = useState<string[]>([
    'gemini-flash',
    'llama-groq',
    'gpt-4o',
  ]);

  const routingPreview = useMemo(
    () => previewSmartRoute(prompt, 'single', ILLUSTRATIVE_CANDIDATES),
    [prompt],
  );

  const toggleArenaModel = (id: string) => {
    setArenaModels((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 2) return prev;
        return prev.filter((item) => item !== id);
      }
      return [...prev, id];
    });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      sessionStorage.setItem(
        HOMEPAGE_DRAFT_STORAGE_KEY,
        JSON.stringify({
          prompt: prompt.trim(),
          mode,
        }),
      );
    } catch {
      // Ignore storage quota errors in restricted browsers.
    }
    void navigate(routes.register);
  };

  return (
    <div
      data-testid="homepage-composer"
      className="border border-line bg-canvas p-4 shadow-float md:p-5"
    >
      {/* Mode switcher header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-subtle pb-3">
        <div
          role="group"
          aria-label="Interaction mode preview"
          className="inline-flex h-(--control-sm) items-center rounded-control border border-line-control bg-workspace p-0.5"
        >
          <button
            type="button"
            aria-pressed={mode === 'standard'}
            onClick={() => setMode('standard')}
            className={clsx(
              'inline-flex h-full items-center gap-1.5 rounded-[calc(var(--radius-control)-2px)] px-2.5 text-meta font-medium transition-colors duration-(--duration-instant)',
              mode === 'standard'
                ? 'bg-raised text-ink'
                : 'text-ink-3 hover:text-ink-2',
            )}
          >
            <Sparkles size={12} aria-hidden="true" className={mode === 'standard' ? 'text-accent' : 'text-ink-3'} />
            <span>Standard · Smart Router</span>
          </button>
          <button
            type="button"
            aria-pressed={mode === 'compare'}
            onClick={() => setMode('compare')}
            className={clsx(
              'inline-flex h-full items-center gap-1.5 rounded-[calc(var(--radius-control)-2px)] px-2.5 text-meta font-medium transition-colors duration-(--duration-instant)',
              mode === 'compare'
                ? 'bg-raised text-ink'
                : 'text-ink-3 hover:text-ink-2',
            )}
          >
            <Columns2 size={12} aria-hidden="true" className={mode === 'compare' ? 'text-accent' : 'text-ink-3'} />
            <span>Compare · Model Arena</span>
          </button>
        </div>

        <span data-register="machine" className="text-note uppercase text-ink-3">
          {mode === 'standard'
            ? `TASK: ${routingPreview.taskLabel.toUpperCase()}`
            : `ARENA: ${arenaModels.length} MODELS SELECTED`}
        </span>
      </div>

      {/* Prompt input form */}
      <form onSubmit={handleSubmit} className="mt-3">
        <label htmlFor="hero-prompt-input" className="sr-only">
          Enter a prompt to preview routing or compare models
        </label>
        <textarea
          id="hero-prompt-input"
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Type a question to see how Smart Routing classifies and routes it…"
          className="w-full resize-none rounded-control border border-line-subtle bg-workspace px-3 py-2 text-ui text-ink placeholder:text-ink-3 focus-visible:border-accent focus-visible:outline-none"
        />

        {/* Sample task pills */}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span data-register="machine" className="mr-1 text-note uppercase text-ink-3">
            Try task:
          </span>
          {SAMPLE_PROMPTS.map((sample) => (
            <button
              key={sample.label}
              type="button"
              onClick={() => setPrompt(sample.prompt)}
              className={clsx(
                'rounded-control border px-2 py-0.5 text-meta transition-colors duration-(--duration-instant)',
                prompt === sample.prompt
                  ? 'border-accent bg-selected text-ink'
                  : 'border-line-subtle bg-raised text-ink-2 hover:border-line-control hover:text-ink',
              )}
            >
              {sample.label}
            </button>
          ))}
        </div>

        {/* Live Smart Router or Model Arena configuration readout */}
        {mode === 'standard' ? (
          <div
            data-testid="homepage-routing-preview"
            className="mt-3.5 border-l-2 border-l-accent bg-raised px-3 py-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span data-register="machine" className="text-note uppercase text-accent">
                SMART ROUTER DECISION
              </span>
              <span data-register="machine" className="text-note uppercase text-ink-3">
                MANUAL OVERRIDE SUPPORTED
              </span>
            </div>
            <p className="mt-1 text-ui font-medium text-ink">
              {routingPreview.reason}
            </p>
            <p className="mt-1 text-meta text-ink-3">
              Classified deterministically without an extra model call. Route adapts to configured provider credentials and live health at request time.
            </p>
          </div>
        ) : (
          <div
            data-testid="homepage-arena-preview"
            className="mt-3.5 border border-line-subtle bg-raised p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span data-register="machine" className="text-note uppercase text-ink-2">
                SELECT 2+ MODELS FOR SIDE-BY-SIDE ARENA COMPARISON
              </span>
              <span data-register="machine" className="text-note uppercase text-ink-3">
                CONCURRENT FAN-OUT
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {ILLUSTRATIVE_CANDIDATES.map((candidate) => {
                const selected = arenaModels.includes(candidate.id);
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleArenaModel(candidate.id)}
                    className={clsx(
                      'inline-flex h-(--control-sm) items-center gap-1.5 rounded-control border px-2 text-meta transition-colors duration-(--duration-instant)',
                      selected
                        ? 'border-accent bg-selected text-ink'
                        : 'border-line-subtle bg-canvas text-ink-2 hover:border-line-control hover:text-ink',
                    )}
                  >
                    <span>{candidate.displayName}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-meta text-ink-3">
              Sends the same prompt to each selected model in parallel. Compare responses side by side, choose a preferred answer for follow-ups, or combine them on demand.
            </p>
          </div>
        )}

        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle pt-3">
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
