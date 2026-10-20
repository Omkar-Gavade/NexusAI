import { describe, expect, it, vi } from 'vitest';
import { collectPages } from './paginate';

function pages<T>(all: T[][]) {
  return vi.fn(async (cursor: string | null) => {
    const index = cursor === null ? 0 : Number(cursor);
    return { items: all[index]!, nextCursor: index + 1 < all.length ? String(index + 1) : null };
  });
}

describe('collectPages', () => {
  it('follows the cursor past the first page (the 51st item used to vanish)', async () => {
    const fetchPage = pages([[1, 2], [3, 4], [5]]);
    const result = await collectPages(fetchPage, { maxPages: 10, order: 'append' });
    expect(result).toEqual({ items: [1, 2, 3, 4, 5], nextCursor: null, truncated: false });
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it('prepends older pages so history stays oldest-first', async () => {
    // Newest page first, as the messages endpoint returns it.
    const result = await collectPages(pages([['c', 'd'], ['a', 'b']]), {
      maxPages: 10,
      order: 'prepend',
    });
    expect(result.items).toEqual(['a', 'b', 'c', 'd']);
  });

  it('stops at the ceiling and says so', async () => {
    const result = await collectPages(pages([[1], [2], [3]]), { maxPages: 2, order: 'append' });
    expect(result).toEqual({ items: [1, 2], nextCursor: '2', truncated: true });
  });
});
