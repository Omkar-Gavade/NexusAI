import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { routePatterns } from '@/lib/routes';

/**
 * The Vercel rewrites are two rules whose *order* is the contract.
 *
 * Refreshing any client-side route returned `404: NOT_FOUND`. The app uses
 * `createBrowserRouter`, the build emits one HTML file, and `vercel.json`
 * declared only the `/api` proxy — so a direct request for `/how-it-works`
 * matched no file and no rewrite, and Vercel answered before the app existed.
 *
 * The catch-all fixes that, but it must never precede the API proxy: reversed,
 * every `/api/*` call would be answered with the HTML shell, which would break
 * authentication in a way that looks like a backend outage.
 */
const config = JSON.parse(
  readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'),
) as { rewrites: Array<{ source: string; destination: string }> };

describe('vercel rewrites', () => {
  it('proxies /api before anything else', () => {
    const first = config.rewrites[0];
    expect(first?.source).toMatch(/^\/api\//);
    expect(first?.destination).toMatch(/^https:\/\/[^/]+\/api\//);
  });

  it('falls back to the SPA shell for every other path', () => {
    const last = config.rewrites.at(-1);
    expect(last?.source).toBe('/(.*)');
    expect(last?.destination).toBe('/index.html');
  });

  it('keeps the API proxy ahead of the catch-all', () => {
    const api = config.rewrites.findIndex((r) => r.source.startsWith('/api'));
    const spa = config.rewrites.findIndex((r) => r.source === '/(.*)');
    expect(api).toBeGreaterThanOrEqual(0);
    expect(spa).toBeGreaterThan(api);
  });

  it('covers every client-side route the router serves', () => {
    // Each of these is a real URL a user can refresh on. The catch-all is what
    // makes them survive a direct load.
    const spa = config.rewrites.at(-1);
    const paths = Object.values(routePatterns)
      .map((pattern) => String(pattern))
      .filter((pattern) => pattern.startsWith('/') && !pattern.includes('*'));

    expect(paths.length).toBeGreaterThan(5);
    for (const path of paths) {
      expect(path.startsWith('/api/'), `${path} would be captured by the API proxy`).toBe(false);
    }
    expect(spa?.destination).toBe('/index.html');
  });

  it('sends the API to an absolute origin, keeping the browser same-origin', () => {
    // The frontend must call a relative `/api`; the cross-origin hop happens
    // server-side. That is what keeps the SameSite=Strict refresh cookie
    // working. If this ever became a relative destination the proxy would loop.
    expect(config.rewrites[0]?.destination).toMatch(/^https:\/\//);
  });
});

/**
 * Routing intent, not string presence.
 *
 * Vercel applies rewrites top-down, and serves an existing static file before
 * any of them. This models that so the test fails for the reason production
 * would fail: a path resolving to the wrong destination.
 */
function destinationFor(path: string): string {
  for (const rule of config.rewrites) {
    const pattern = new RegExp(
      `^${rule.source
        .replace(/\/:path\*/g, '(?:/.*)?')
        .replace(/\/\(\.\*\)/g, '(?:/.*)?')
        .replace(/\(\.\*\)/g, '.*')}$`,
    );
    if (pattern.test(path)) return rule.destination;
  }
  return '<unmatched — Vercel 404>';
}

describe('production routing behaviour', () => {
  it('sends every client-side route to the SPA shell', () => {
    // These are real URLs a user can refresh on. Before the fallback existed
    // each of them matched no rule and Vercel answered 404 before the app
    // was ever loaded.
    for (const path of [
      '/',
      '/how-it-works',
      '/synthesis',
      '/use-cases',
      '/login',
      '/register',
      '/app',
      '/app/chat/6a97afa8107bdcfe706edac2',
    ]) {
      expect(destinationFor(path), `${path} must boot the SPA`).toBe('/index.html');
    }
  });

  it('never swallows an API request into the SPA shell', () => {
    // The failure that would look like a total backend outage.
    for (const path of ['/api/auth/me', '/api/auth/login', '/api/chat/stream', '/api/models']) {
      const destination = destinationFor(path);
      expect(destination, `${path} must reach the backend`).toMatch(/^https:\/\//);
      expect(destination).not.toBe('/index.html');
    }
  });

  it('keeps a deep chat link resolvable rather than collapsing it to /app', () => {
    // Deep-link semantics: the router needs the real path to restore the
    // conversation, so the fallback must serve the shell at that URL rather
    // than redirect away from it.
    expect(destinationFor('/app/chat/abc123')).toBe('/index.html');
    expect(config.rewrites.some((r) => r.destination === '/app')).toBe(false);
  });
});

/**
 * Pricing was removed from the public product.
 *
 * A route left behind would not 404 — the SPA fallback answers every path — so
 * a stale link would quietly render the application's own not-found page
 * instead of failing loudly. These assert the removal at the places that would
 * otherwise keep it alive.
 */
describe('no pricing surface', () => {
  it('has no pricing route pattern', () => {
    expect(Object.keys(routePatterns)).not.toContain('pricing');
    expect(Object.values(routePatterns).map(String)).not.toContain('/pricing');
  });

  it('resolves /pricing to the SPA shell, where the router answers not-found', () => {
    // Still handled by the fallback like any unknown path; it simply is not a
    // page any more.
    expect(destinationFor('/pricing')).toBe('/index.html');
  });
});
