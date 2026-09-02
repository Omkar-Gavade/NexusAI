# Vercel configuration

Two rewrites, and the order between them is load-bearing.

## `/api/:path*` → Render

The browser must see the API as **same-origin**. The refresh cookie is
`SameSite=Strict; Path=/api/auth`; if the browser talked to
`nexusai-nbv4.onrender.com` directly, that cookie would be cross-site and never
sent, so sessions would silently die at the access token's 15-minute expiry.
The rewrite is server-side, so from the browser's point of view every request
goes to the Vercel origin.

Two consequences that are easy to undo by accident:

- **`VITE_API_URL` must stay unset in the Vercel build.** `src/lib/http.ts`
  falls back to a relative `/api` when it is absent, which is what routes
  through this rewrite. Setting it to the Render URL makes the frontend call
  the backend cross-origin and breaks the refresh flow.
- **`WEB_ORIGIN` on Render must equal the Vercel origin exactly.** The CSRF
  guard rejects any mutating request whose `Origin` header does not match it.

## `/(.*)` → `/index.html`

The SPA fallback, and the fix for:

```
404: NOT_FOUND
Code: NOT_FOUND
```

on refreshing any client-side route.

The app uses `createBrowserRouter`, so `/how-it-works`, `/login`, `/app` and the
rest are real URLs handled in JavaScript. The build emits exactly one HTML file.
A direct request for `/how-it-works` therefore finds no matching file on disk,
matched no rewrite, and Vercel returned its own 404 — the app was never
reached, which is why it looked like a deployment fault rather than a routing
one. This rule hands every unmatched path to `index.html` so the router can
resolve it client-side.

**Order matters.** Rewrites are evaluated top-down, so `/api/:path*` must stay
first or the catch-all would swallow the API proxy and every request would be
answered with the HTML shell. Static assets are unaffected: Vercel serves an
existing file before applying rewrites, so hashed bundles under `/assets/`
resolve normally.
