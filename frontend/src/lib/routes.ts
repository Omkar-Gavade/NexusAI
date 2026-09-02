/**
 * Every route path in one place.
 *
 * Paths were previously written as string literals at each call site, which is
 * how `/c/:id` ended up in eight files and had to be rewritten in eight files
 * when the product gained an `/app` prefix.
 */
export const routes = {
  home: '/',

  login: '/login',
  register: '/register',

  /** The workspace root is a new conversation. */
  workspace: '/app',
  conversation: (id: string) => `/app/chat/${id}`,

  /** Sign-in destination that returns the user to where they were headed. */
  loginWithNext: (next: string) => `/login?next=${encodeURIComponent(next)}`,
} as const;

/**
 * Path patterns for the router's own table. Separate from `routes` because a
 * router declares patterns while callers navigate to concrete paths — and the
 * nested one is a relative segment, not an absolute path.
 */
export const routePatterns = {
  home: '/',
  login: '/login',
  register: '/register',
  workspace: '/app',
  conversation: 'chat/:conversationId',
  notFound: '*',
} as const;

/**
 * Narrows a `?next=` value to somewhere inside this application, or `null` when
 * there is nothing usable to go back to.
 *
 * The parameter is attacker-controlled: anyone can send someone a sign-in link
 * carrying any destination. React Router happens to coerce an absolute URL into
 * a nonsense in-app path rather than leaving the origin, so this is not
 * currently an open redirect — but that is a property of the router's path
 * parsing, not a decision this code made. It would become a real one the moment
 * the value reached `window.location`, and in the meantime a crafted link still
 * lands a freshly signed-in user on a route that does not exist.
 *
 * Accepted: a single leading slash, then a path. Rejected: absolute URLs,
 * scheme-relative `//host` and its backslash variant (browsers treat both as
 * absolute), and anything not starting with a slash.
 */
function intendedDestination(next: string | null | undefined): string | null {
  if (!next) return null;

  // Browsers strip control characters and whitespace while resolving a URL, so
  // a value like "\n//evil.example.com" reaches a different origin even though
  // it does not start with a slash. Removing them first means the checks below
  // see what the browser would see. Filtered by code point rather than with a
  // regex, because a regex literal containing control characters is
  // indistinguishable from a typo at a glance.
  const value = [...next]
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code > 0x20 && code !== 0x7f;
    })
    .join('');

  if (!value.startsWith('/')) return null;
  if (value.startsWith('//')) return null;
  if (value.startsWith('/\\')) return null;

  return value;
}

/** Where to send someone after they sign in. Falls back to the workspace. */
export function safeNext(next: string | null | undefined): string {
  return intendedDestination(next) ?? routes.workspace;
}

/**
 * Carries a pending destination across the sign-in / registration switch.
 *
 * Keyed on whether a destination is *usable*, not on whether it happens to
 * equal the default: `/app` is a real destination that a visitor was sent from,
 * and dropping it here would be indistinguishable from dropping a hostile one.
 */
export function withNext(path: string, next: string | null | undefined): string {
  const destination = intendedDestination(next);
  return destination ? `${path}?next=${encodeURIComponent(destination)}` : path;
}
