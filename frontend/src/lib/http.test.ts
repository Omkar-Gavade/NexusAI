import { afterEach, describe, expect, it, vi } from 'vitest';
import { request } from './http';

/**
 * The client half of the session lifecycle: an expired access token is
 * refreshed once — shared by every request that hit it — and a request is
 * retried at most once, so a dead session ends in a sign-out rather than a
 * refresh loop.
 */
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const expired = () =>
  jsonResponse(401, {
    error: { code: 'TOKEN_EXPIRED', message: 'Your session needs refreshing.', requestId: 'r' },
  });
const unauthenticated = () =>
  jsonResponse(401, {
    error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.', requestId: 'r' },
  });

afterEach(() => vi.unstubAllGlobals());

describe('request — token refresh', () => {
  it('shares one refresh between concurrent requests that hit an expired token, then retries each once', async () => {
    let refreshed = false;
    let refreshCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/auth/refresh')) {
        refreshCalls += 1;
        await new Promise((r) => setTimeout(r, 20));
        refreshed = true;
        return new Response(null, { status: 204 });
      }
      return refreshed ? jsonResponse(200, { ok: url }) : expired();
    });
    vi.stubGlobal('fetch', fetchMock);

    const responses = await Promise.all([
      request('/conversations'),
      request('/models'),
      request('/auth/me'),
    ]);

    expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(refreshCalls).toBe(1);
    // Three originals, one refresh, three retries — nothing more.
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });

  it('does not loop when the refresh itself fails: the 401 is returned once', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith('/auth/refresh') ? unauthenticated() : expired(),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await request('/conversations');

    expect(response.status).toBe(401);
    // The original request and one refresh attempt. No retry, no second refresh.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries at most once even if the retried request is still rejected', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith('/auth/refresh') ? new Response(null, { status: 204 }) : expired(),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await request('/conversations');

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not refresh for a plain UNAUTHENTICATED (no session at all)', async () => {
    const fetchMock = vi.fn(async () => unauthenticated());
    vi.stubGlobal('fetch', fetchMock);

    const response = await request('/auth/me');

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends the CSRF header and same-origin credentials on every request', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);

    await request('/conversations', { method: 'POST', body: { a: 1 } });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.credentials).toBe('same-origin');
    expect((init.headers as Record<string, string>)['X-Nexus-Client']).toBe('web');
  });
});

describe('request — when the server cannot be reached', () => {
  it('blames the server, not the connection, while the browser is online', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(request('/auth/login', { method: 'POST', body: {} })).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      message: expect.stringMatching(/couldn't reach the nexusai server/i),
    });
  });

  it('says offline only when the browser reports it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    vi.stubGlobal('navigator', { ...navigator, onLine: false });
    await expect(request('/auth/login', { method: 'POST', body: {} })).rejects.toMatchObject({
      message: expect.stringMatching(/offline/i),
    });
  });

  it('reports a gateway error (a sleeping or restarting server) as retryable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 502 })));
    const { json } = await import('./http');
    await expect(json('/auth/me', { parse: (v: unknown) => v })).rejects.toMatchObject({
      code: 'SERVER_SHUTDOWN',
    });
  });
});
