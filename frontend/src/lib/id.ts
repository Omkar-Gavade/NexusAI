const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function symbol(index: number): string {
  return ALPHABET[index % ALPHABET.length] ?? '0';
}

/**
 * ULID: 26 chars, lexicographically sortable by creation time. Used as the
 * client message id so the optimistic message reconciles with the server row
 * and so a double submit is suppressed server-side.
 */
export function ulid(now = Date.now()): string {
  let time = '';
  let remaining = now;
  for (let i = 0; i < 10; i += 1) {
    time = symbol(remaining % 32) + time;
    remaining = Math.floor(remaining / 32);
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let random = '';
  for (const byte of bytes) random += symbol(byte);

  return time + random;
}
