import type { Conversation } from '@nexusai/contracts';

export interface ConversationGroup {
  label: string;
  conversations: Conversation[];
}

const DAY = 86_400_000;

/**
 * Groups by local calendar day, not by elapsed milliseconds: something sent at
 * 23:50 yesterday is "Yesterday" at 00:10 today, not "20 minutes ago".
 * Empty groups are omitted entirely rather than rendered as bare headings.
 */
export function groupByRecency(
  conversations: readonly Conversation[],
  now = new Date(),
): ConversationGroup[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const buckets: Array<{ label: string; min: number; conversations: Conversation[] }> = [
    { label: 'TODAY', min: startOfToday, conversations: [] },
    { label: 'YESTERDAY', min: startOfToday - DAY, conversations: [] },
    { label: 'PREVIOUS 7 DAYS', min: startOfToday - 7 * DAY, conversations: [] },
    { label: 'PREVIOUS 30 DAYS', min: startOfToday - 30 * DAY, conversations: [] },
    { label: 'OLDER', min: Number.NEGATIVE_INFINITY, conversations: [] },
  ];

  const sorted = [...conversations].sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );

  for (const conversation of sorted) {
    const at = Date.parse(conversation.updatedAt);
    const bucket = buckets.find((b) => at >= b.min);
    bucket?.conversations.push(conversation);
  }

  return buckets
    .filter((b) => b.conversations.length > 0)
    .map(({ label, conversations: items }) => ({ label, conversations: items }));
}
