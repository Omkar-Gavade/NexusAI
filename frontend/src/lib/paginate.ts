/**
 * Follows an API cursor until it runs out, within a ceiling.
 *
 * The list endpoints page at 50 by default and every caller read only the
 * first page, so the 51st conversation never appeared in the sidebar and the
 * opening turns of a long conversation silently vanished from its history.
 * The ceiling keeps a pathological account from turning one view into an
 * unbounded download; reaching it is reported through `truncated`.
 */
export async function collectPages<T>(
  fetchPage: (cursor: string | null) => Promise<{ items: T[]; nextCursor: string | null }>,
  options: { maxPages: number; order: 'append' | 'prepend' },
): Promise<{ items: T[]; nextCursor: string | null; truncated: boolean }> {
  let items: T[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < options.maxPages; page += 1) {
    const result = await fetchPage(cursor);
    items = options.order === 'append' ? [...items, ...result.items] : [...result.items, ...items];
    cursor = result.nextCursor;
    if (!cursor) return { items, nextCursor: null, truncated: false };
  }

  return { items, nextCursor: cursor, truncated: true };
}
