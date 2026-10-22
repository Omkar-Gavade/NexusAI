import type { CSSProperties, ReactNode } from 'react';
import clsx from 'clsx';
import { Activity, Columns2, Gauge, Layers, RefreshCw, Sparkles } from 'lucide-react';
import { ROSTER } from './model-roster';
import { HUES, modelHue, type Hue } from './spectrum';

/**
 * What NexusAI does, as a bento grid: six capabilities, each in its own hue,
 * each with a small drawing of the thing itself rather than a stock icon
 * alone. The drawings are illustrative (labelled as such on the page) and
 * depict real behaviour: the routing scale, Arena columns, synthesis, the
 * stream, telemetry, and failover.
 */
export function FeatureBento() {
  return (
    <div className="grid gap-4 md:grid-cols-6">
      <Card
        hue={HUES.indigo}
        icon={<Sparkles size={18} aria-hidden="true" />}
        title="Smart routing"
        body="Every question is classified — coding, reasoning, research, quick — and sent to the model best suited to it. One click overrides it."
        className="md:col-span-4"
      >
        <RouteVisual />
      </Card>
      <Card
        hue={HUES.fuchsia}
        icon={<Columns2 size={18} aria-hidden="true" />}
        title="Model Arena"
        body="Two to four models answer side by side. Keep the one you trust."
        className="md:col-span-2"
      >
        <ArenaVisual />
      </Card>
      <Card
        hue={HUES.violet}
        icon={<Layers size={18} aria-hidden="true" />}
        title="Synthesis"
        body="Several answers reconciled into one — with agreement and disagreement named, not hidden."
        className="md:col-span-2"
      >
        <SynthesisVisual />
      </Card>
      <Card
        hue={HUES.cyan}
        icon={<Activity size={18} aria-hidden="true" />}
        title="Live streaming"
        body="Text arrives as it is written. Stop any time — the providers stop too."
        className="md:col-span-2"
      >
        <StreamVisual />
      </Card>
      <Card
        hue={HUES.emerald}
        icon={<Gauge size={18} aria-hidden="true" />}
        title="Cost & speed, shown"
        body="Time to first token, latency, tokens and an estimated cost on every answer. Unknown says unknown."
        className="md:col-span-2"
      >
        <TelemetryVisual />
      </Card>
      <Card
        hue={HUES.amber}
        icon={<RefreshCw size={18} aria-hidden="true" />}
        title="Survives a bad provider"
        body="A rate-limited or failing model drops out without taking the answer with it; retry just that one."
        className="md:col-span-6 lg:col-span-6"
        wide
      >
        <FailoverVisual />
      </Card>
    </div>
  );
}

function Card({
  hue,
  icon,
  title,
  body,
  className,
  wide = false,
  children,
}: {
  hue: Hue;
  icon: ReactNode;
  title: string;
  body: string;
  className?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  const style = { '--card-rgb': hue.rgb } as CSSProperties;
  return (
    <article
      style={style}
      className={clsx(
        'group relative overflow-hidden rounded-overlay border border-line bg-raised p-6 shadow-float',
        'transition-[transform,box-shadow,border-color] duration-(--duration-normal) ease-out',
        'hover:-translate-y-0.5 hover:border-[rgb(var(--card-rgb)/0.45)] hover:shadow-[0_18px_48px_-18px_rgb(var(--card-rgb)/0.55)]',
        wide && 'md:grid md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:items-center md:gap-8',
        className,
      )}
    >
      {/* The card's own colour, as a soft field in its top corner. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-[radial-gradient(closest-side,rgb(var(--card-rgb)/0.28),transparent)] opacity-70 transition-opacity duration-(--duration-normal) group-hover:opacity-100"
      />
      <div className="relative">
        <span
          className="grid size-11 place-items-center rounded-[12px] text-white shadow-[0_8px_20px_-8px_rgb(var(--card-rgb)/0.8)]"
          style={{ backgroundImage: hue.gradient }}
        >
          {icon}
        </span>
        <h3 className="mt-5 text-[19px] font-semibold tracking-[-0.02em] text-ink">{title}</h3>
        <p className="mt-2 max-w-[46ch] text-ui leading-6 text-ink-2">{body}</p>
      </div>
      <div aria-hidden="true" className={clsx('relative', wide ? 'mt-6 md:mt-0' : 'mt-6')}>
        {children}
      </div>
    </article>
  );
}

const TASKS = ['Quick', 'Coding', 'Reasoning', 'Research'] as const;

function RouteVisual() {
  const routed = [
    { id: 'claude-sonnet', name: ROSTER[1].model, score: 0.96 },
    { id: 'gpt-4o', name: ROSTER[0].model, score: 0.88 },
    { id: 'llama-groq', name: ROSTER[5].model, score: 0.8 },
  ];
  return (
    <div className="rounded-card border border-line-subtle bg-canvas/70 p-4">
      <div className="flex flex-wrap gap-1.5">
        {TASKS.map((task) => (
          <span
            key={task}
            className={clsx(
              'rounded-full px-2.5 py-1 text-[12px] font-medium',
              task === 'Coding'
                ? 'bg-[rgb(99_102_241/0.16)] text-ink shadow-[inset_0_0_0_1px_rgb(99_102_241/0.45)]'
                : 'bg-hover text-ink-3',
            )}
          >
            {task}
          </span>
        ))}
      </div>
      <ul className="mt-4 flex flex-col gap-2.5">
        {routed.map((model, index) => (
          <li key={model.id} className="grid grid-cols-[8.5rem_1fr_auto] items-center gap-3">
            <span className={clsx('truncate text-[13px]', index === 0 ? 'font-semibold text-ink' : 'text-ink-2')}>
              {model.name}
            </span>
            <span className="h-2 overflow-hidden rounded-full bg-hover">
              <span
                className="block h-full rounded-full"
                style={{ width: `${model.score * 100}%`, backgroundImage: modelHue(model.id).gradient }}
              />
            </span>
            <span className={clsx('text-[12px] font-medium', index === 0 ? 'text-accent' : 'text-transparent')}>
              {index === 0 ? 'routed →' : '·'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ArenaVisual() {
  const ids = ['gemini-flash', 'llama-groq', 'gpt-4o'] as const;
  return (
    <div className="grid grid-cols-3 gap-2">
      {ids.map((id, index) => (
        <div
          key={id}
          className={clsx(
            'rounded-card border bg-canvas/70 p-2.5',
            index === 1 ? 'border-[rgb(217_70_239/0.6)] shadow-[0_0_0_3px_rgb(217_70_239/0.15)]' : 'border-line-subtle',
          )}
        >
          <span className="block h-1.5 w-8 rounded-full" style={{ backgroundImage: modelHue(id).gradient }} />
          <span className="mt-3 block h-1 w-full rounded-full bg-line" />
          <span className="mt-1.5 block h-1 w-4/5 rounded-full bg-line" />
          <span className="mt-1.5 block h-1 w-3/5 rounded-full bg-line" />
        </div>
      ))}
    </div>
  );
}

function SynthesisVisual() {
  const ids = ['gpt-4o', 'claude-sonnet', 'gemini-flash'] as const;
  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-col gap-2">
        {ids.map((id) => (
          <span key={id} className="h-2 w-14 rounded-full" style={{ backgroundImage: modelHue(id).gradient }} />
        ))}
      </div>
      <svg width="40" height="56" viewBox="0 0 40 56" className="shrink-0 text-line-strong">
        <path d="M0 6 C 22 6, 18 28, 40 28 M0 28 H40 M0 50 C 22 50, 18 28, 40 28" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <span className="h-10 flex-1 rounded-card bg-spectrum opacity-90 shadow-[0_8px_24px_-8px_rgb(139_92_246/0.6)]" />
    </div>
  );
}

function StreamVisual() {
  const widths = ['92%', '78%', '86%', '44%'];
  return (
    <div className="rounded-card border border-line-subtle bg-canvas/70 p-3">
      {widths.map((width, index) => (
        <span
          key={width + index}
          className="mb-2 block h-1.5 rounded-full last:mb-0"
          style={{
            width,
            backgroundImage:
              index === widths.length - 1
                ? 'linear-gradient(90deg, rgb(6 182 212 / 0.9), rgb(6 182 212 / 0))'
                : 'linear-gradient(90deg, rgb(6 182 212 / 0.55), rgb(59 130 246 / 0.55))',
          }}
        />
      ))}
    </div>
  );
}

function TelemetryVisual() {
  const stats = [
    { label: 'First token', value: '310 ms' },
    { label: 'Total', value: '1.1 s' },
    { label: 'Tokens', value: '184 / 320' },
    { label: 'Est. cost', value: '~$0.0009' },
  ];
  return (
    <dl className="grid grid-cols-2 gap-2">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-card border border-line-subtle bg-canvas/70 px-3 py-2">
          <dt className="text-[11px] font-medium text-ink-3">{stat.label}</dt>
          <dd data-register="machine" className="mt-0.5 text-[13px] text-ink">
            {stat.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function FailoverVisual() {
  const rows = [
    { id: 'gemini-flash', name: ROSTER[2].model, state: 'Answered', ok: true },
    { id: 'mistral-large', name: ROSTER[3].model, state: 'Rate limited · retry', ok: false },
    { id: 'gpt-4o', name: ROSTER[0].model, state: 'Answered', ok: true },
  ];
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li
          key={row.id}
          className="flex items-center gap-3 rounded-card border border-line-subtle bg-canvas/70 px-3.5 py-2.5"
        >
          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundImage: modelHue(row.id).gradient }} />
          <span className="flex-1 truncate text-[13px] font-medium text-ink">{row.name}</span>
          <span
            className={clsx(
              'rounded-full px-2 py-0.5 text-[12px] font-medium',
              row.ok
                ? 'bg-[rgb(16_185_129/0.14)] text-ok'
                : 'bg-[rgb(245_158_11/0.16)] text-warn',
            )}
          >
            {row.state}
          </span>
        </li>
      ))}
    </ul>
  );
}
