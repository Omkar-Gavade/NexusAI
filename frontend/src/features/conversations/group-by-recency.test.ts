import { describe, expect, it } from 'vitest';
import type { Conversation } from '@nexusai/contracts';
import { groupByRecency } from './group-by-recency';

const NOW = new Date('2026-08-19T14:30:00Z');

function conversation(id: string, updatedAt: string): Conversation {
  return {
    id,
    title: `Conversation ${id}`,
    projectId: null,
    messageCount: 2,
    createdAt: updatedAt,
    updatedAt,
  };
}

/** Local midnight for the reference date, so cases are timezone independent. */
const midnight = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate()).getTime();
const at = (offsetMs: number) => new Date(midnight + offsetMs).toISOString();
const DAY = 86_400_000;

describe('groupByRecency', () => {
  it('returns nothing for an empty list rather than empty headings', () => {
    expect(groupByRecency([], NOW)).toEqual([]);
  });

  it('omits groups that have no conversations', () => {
    const groups = groupByRecency([conversation('a', at(3600_000))], NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe('TODAY');
  });

  it('separates today from yesterday across local midnight', () => {
    // 23:50 "yesterday" must not read as TODAY just because it is 40 minutes ago.
    const groups = groupByRecency(
      [conversation('today', at(60_000)), conversation('yesterday', at(-10 * 60_000))],
      NOW,
    );
    expect(groups.map((g) => g.label)).toEqual(['TODAY', 'YESTERDAY']);
    expect(groups[1]?.conversations[0]?.id).toBe('yesterday');
  });

  it.each([
    ['TODAY', 0],
    ['YESTERDAY', -DAY],
    ['PREVIOUS 7 DAYS', -3 * DAY],
    ['PREVIOUS 30 DAYS', -14 * DAY],
    ['OLDER', -400 * DAY],
  ])('places a %s conversation correctly', (label, offset) => {
    const groups = groupByRecency([conversation('x', at(offset))], NOW);
    expect(groups[0]?.label).toBe(label);
  });

  it('puts an exact 7-day boundary in the 7-day bucket, not the 30-day one', () => {
    const groups = groupByRecency([conversation('x', at(-7 * DAY))], NOW);
    expect(groups[0]?.label).toBe('PREVIOUS 7 DAYS');
  });

  it('sorts newest first inside a group', () => {
    const groups = groupByRecency(
      [
        conversation('older', at(3600_000)),
        conversation('newest', at(7200_000)),
        conversation('middle', at(5400_000)),
      ],
      NOW,
    );
    expect(groups[0]?.conversations.map((c) => c.id)).toEqual(['newest', 'middle', 'older']);
  });

  it('does not mutate the input array', () => {
    const input = [conversation('a', at(0)), conversation('b', at(-DAY))];
    const snapshot = [...input];
    groupByRecency(input, NOW);
    expect(input).toEqual(snapshot);
  });

  it('handles a future timestamp without dropping the row', () => {
    // Clock skew between client and server should never make a row vanish.
    const groups = groupByRecency([conversation('future', at(DAY))], NOW);
    expect(groups.flatMap((g) => g.conversations)).toHaveLength(1);
  });
});
