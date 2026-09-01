# Product Routes & Information Architecture

Status: **current** · Updated 2026-08-19

## Route map

| Path | Access | Component | Notes |
|---|---|---|---|
| `/` | public | `pages/home/home-page.tsx` | Landing. Redirects to `/app` if a session exists |
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

| Section | Anchor | Claim it makes |
|---|---|---|
| Hero | — | The proposition, both CTAs, a representative interface illustration |
| Why several models | `#why` | The value is reconciliation, not model count |
| How it works | `#how-it-works` | Five steps: ask, route, compare, synthesise, trace |
| Synthesis | `#synthesis` | You read the conclusion, evidence sits underneath |
| Provenance | `#provenance` | Rail semantics: position, density, divergence, failures |
| Where it helps | `#use-cases` | Research, technical, writing, decision support |
| Capabilities | `#capabilities` | Built vs Planned, stated with equal weight |
| What is measured | `#measured` | Nothing is estimated; no confidence percentages |

### What the landing page may never contain

Enforced by assertions in `pages/home/home-page.test.tsx`:

- No performance percentage claims, no `99.x%` figures
- No user, customer, team, or request counts
- No compliance badges (SOC 2, ISO 27001, HIPAA)
- No model vendor names
- No unlabelled interface illustration — the preview is captioned
  "Static illustration — not live model output"
- No capability marked `Built` unless it is built
