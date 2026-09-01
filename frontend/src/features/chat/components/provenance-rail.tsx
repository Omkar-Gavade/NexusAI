import clsx from 'clsx';
import type { Stance } from '@nexusai/contracts';
import { latency } from '@/lib/format';
import type { ModelSlot } from '../stream-reducer';

/**
 * The Provenance Rail.
 *
 * A 2px column in the left gutter, one segment per contributing model. It
 * encodes three facts without a single vendor colour:
 *
 *   position → which model      (fixed plan order, learned once)
 *   density  → identity within the group (four-step neutral ramp)
 *   notch    → that model diverged from the synthesis
 *
 * Density rather than hue is what keeps it legible in greyscale, at 200% zoom,
 * and under forced-colors — and what stops the product looking like an
 * aggregator of other companies' brands.
 *
 * It is the control, not a picture of one: each segment is a real button that
 * opens comparison scrolled to that model.
 */

/** Four steps. Beyond four models the ramp repeats — position still separates them. */
const DENSITY = [1, 0.75, 0.5, 0.25] as const;

interface ProvenanceRailProps {
  slots: ModelSlot[];
  live: boolean;
  onSelect: (modelId: string) => void;
}

/**
 * Orientation is responsive in CSS rather than via a prop, so there is one rail
 * in the accessibility tree at every viewport. Below 1024px it lies horizontal
 * above the metadata line: a left-gutter rail costs 22px of a 343px measure,
 * which is not affordable.
 */
export function ProvenanceRail({ slots, live, onSelect }: ProvenanceRailProps) {
  if (slots.length === 0) return null;

  return (
    <ul
      aria-label="Model provenance"
      className={clsx(
        'flex select-none gap-px',
        'h-0.5 w-full flex-row',
        'lg:h-full lg:min-h-8 lg:w-0.5 lg:flex-col',
      )}
    >
      {live && (
        <li aria-hidden="true" className="w-1.5 shrink-0 lg:h-1.5 lg:w-auto">
          {/* A square, not a dot. Steps between two opacities rather than
              pulsing, so it reads as "working" and not as an alarm. */}
          <span className="block size-full bg-accent motion-safe:animate-[live-step_1.6s_step-end_infinite]" />
        </li>
      )}

      {slots.map((slot, index) => (
        <RailSegment
          key={slot.model.modelId}
          slot={slot}
          density={DENSITY[index % DENSITY.length] ?? 1}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}

function RailSegment({
  slot,
  density,
  onSelect,
}: {
  slot: ModelSlot;
  density: number;
  onSelect: (modelId: string) => void;
}) {
  const inFlight = slot.phase === 'queued' || slot.phase === 'running';
  const failed = slot.phase === 'failed';
  const diverges = slot.stance === 'diverges';

  return (
    <li className="h-full min-h-0 min-w-0 flex-1 lg:w-full">
      <button
        type="button"
        onClick={() => onSelect(slot.model.modelId)}
        aria-label={describe(slot)}
        title={tooltip(slot)}
        className={clsx(
          'block size-full cursor-pointer rounded-none p-0',
          // Hover widens the whole rail rather than the segment, so the column
          // stays a straight line instead of growing a bump.
          'transition-[background-color,opacity] duration-(--duration-instant) ease-out',
          'focus-visible:relative focus-visible:z-10',
        )}
      >
        <span
          className={clsx(
            'block size-full',
            failed
              ? // Hollow: the model contributed nothing, and the rail says so.
                'bg-transparent shadow-[inset_0_0_0_1px_var(--border-strong)]'
              : 'bg-line-strong',
            // Divergence is an interruption; concurrence is the unbroken state.
            // A real gap, so it survives greyscale and forced-colors.
            diverges &&
              !failed && [
                '[mask-image:linear-gradient(to_right,#000_0_calc(50%-1px),transparent_calc(50%-1px)_calc(50%+1px),#000_calc(50%+1px)_100%)]',
                'lg:[mask-image:linear-gradient(to_bottom,#000_0_calc(50%-1px),transparent_calc(50%-1px)_calc(50%+1px),#000_calc(50%+1px)_100%)]',
              ],
          )}
          style={{ opacity: inFlight ? 0.25 : failed ? 1 : density }}
        />
      </button>
    </li>
  );
}

function stanceWord(stance: Stance): string {
  return stance === 'concurs' ? 'concurs' : stance === 'diverges' ? 'diverges' : 'unclassified';
}

/** The full sentence, so the rail is never the only route to the information. */
function describe(slot: ModelSlot): string {
  const name = slot.model.displayName;
  if (slot.phase === 'failed') return `${name} failed to respond. Open comparison.`;
  if (slot.phase !== 'complete') return `${name} is responding. Open comparison.`;
  const time = slot.latencyMs === null ? '' : `, ${latency(slot.latencyMs)}`;
  return `${name} ${stanceWord(slot.stance)}${time}. Open comparison.`;
}

function tooltip(slot: ModelSlot): string {
  const parts = [slot.model.modelId, stanceWord(slot.stance)];
  if (slot.latencyMs !== null) parts.push(latency(slot.latencyMs));
  return parts.join(' · ');
}
