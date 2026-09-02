# Product Routes & Information Architecture

Status: **current** · Updated 2026-09-02

## Route map

| Path | Access | Component | Notes |
|---|---|---|---|
| `/` | public | `pages/home/home-page.tsx` | The entire public surface. Redirects to `/app` if a session exists |
| `/login` | public | `pages/auth/login-page.tsx` | Honours `?next=` |
| `/register` | public | `pages/auth/register-page.tsx` | Honours `?next=` |
| `/app` | private | `pages/app/conversation-page.tsx` | Workspace root **is** a new conversation |
| `/app/chat/:conversationId` | private | same component | History loads for the id |
| `*` | any | `pages/not-found-page.tsx` | |

Paths are defined once in `frontend/src/lib/routes.ts`. No route string is
written as a literal at a call site.

## Flow

```text
/                      public landing
  │  Get started ─────────────► /register ──┐
  │  Sign in ─────────────────► /login   ───┤
  │                                          ├──► /app
  └─ already signed in ────────────────────────►

/app/chat/:id  ◄── first send replaces the URL (history.replace)
```

**`/app` creates nothing.** A conversation record exists only after a message is
actually sent; on first send the URL is replaced (not pushed) with
`/app/chat/:id`, so Back does not return to a stale empty workspace and no
graveyard of empty conversations accumulates.

### The `?next=` destination

`?next=` is attacker-controlled — anyone can send someone a sign-in link
carrying any destination — so it is narrowed by `safeNext` in `lib/routes.ts`
before it is ever navigated to. Accepted: a single leading slash then a path.
Rejected and replaced with the workspace: absolute URLs, scheme-relative
`//host` and its backslash variant, and anything not starting with a slash.
Control characters and whitespace are stripped first, because a browser ignores
them when resolving and would otherwise reach a different origin.

React Router happens to coerce an absolute URL into a nonsense in-app path
rather than leaving the origin, so this was not an open redirect before the
check existed — but that is the router's path parsing, not a decision this code
made, and it would become one the moment the value reached `window.location`.

Both auth pages honour it, and the links between them carry it, so a visitor
sent to sign-in from a protected route still lands there after choosing to
register instead.

**Unauthenticated access to `/app/*`** redirects to `/login?next=<path>` and
returns the user there after sign-in.

## Surfaces that are dialogs, not routes

Search (`⌘K`) and Settings (`⌘,`) are modal dialogs over the workspace rather
than routes. They are transient, they must not discard the conversation behind
them, and neither is a destination anyone links to. See
[ADR-010](../decisions/ADR-010-public-product-surface.md).

## Home page information architecture

There is **one** public page. `/pricing`, `/how-it-works`, `/synthesis` and
`/use-cases` were real routes for a while; their content is now sections of `/`
and the routes are gone. Nothing redirects — the SPA fallback serves the shell
and the router answers not-found, which is the correct outcome for a page that
no longer exists.

| Section | Anchor | Claim it makes |
|---|---|---|
| Hero | — | One question, one model or several. Both CTAs |
| Two ways to ask | `#modes` | Direct answers alone; synthesis reconciles. **The one section that must land** |
| The models | `#models` | Six models, six providers, availability per deployment |
| How it works | `#how-it-works` | Parallel fan-out, then the six stages in order |
| Synthesis | `#synthesis` | Reconciliation, judged stance, and what it does not do |
| Provenance | `#provenance` | Used models, rail semantics, failover honesty |
| The workspace | `#product` | A static reconstruction of the real answer surface |
| Get started | — | One CTA |

Nav and footer link to these anchors with **native `<a href="#…">`**, not router
`Link`s. A hash-only `to` on a React Router `Link` pushes the location without
scrolling to the element, which is visually indistinguishable from a dead link.
`home-page.test.tsx` resolves every public href against the ids the page
actually renders — anchors have broken twice here, once in each direction of
this split.

### What the landing page may never contain

Enforced by assertions in `pages/home/home-page.test.tsx`:

- No performance percentage claims, no `99.x%` figures
- No user, customer, team, or request counts
- No compliance badges (SOC 2, ISO 27001, HIPAA)
- No price, and no pricing surface of any kind
- No generic AI copy: "AI-powered", "unlock the power of", "the future of AI",
  "your intelligent assistant", "revolutionary", "cutting-edge"
- No unlabelled interface illustration — the preview is captioned
  "Static illustration — not live model output"
- No capability marked `Built` unless it is built
