# 18–20 · Frontend Architecture

Status: **CURRENT** — §19 generated from the tree · Updated 2026-08-19

## 18. Frontend Architecture

### 18.1 Dependency ledger

Every dependency must justify its existence. Where a justification is weak, the dependency is
rejected and the alternative is stated.

| Package | ~Size (gz) | Why it is required | What we would do without it |
|---|---|---|---|
| `react` + `react-dom` | 45KB | UI runtime | — |
| `typescript` | dev | Contract enforcement across the app boundary | — |
| `vite` | dev | Dev server with instant HMR; Rollup production build. Chosen over Next.js because NexusAI is an authenticated SPA with no SEO surface and no server rendering requirement — adding a Node rendering tier would add deployment surface for zero benefit | Webpack, slower |
| `tailwindcss` v4 | ~8KB used | CSS-first `@theme` maps our token layer directly to utilities; produces only the classes used. Kept because it enforces the spacing/color scale at the call site — an arbitrary `padding: 17px` is not expressible | Hand-written CSS modules; more drift risk |
| `react-router` v7 | 14KB | Real URLs per conversation, deep linking, Back semantics | A hand-rolled router — 200 lines that gets history wrong |
| `@tanstack/react-query` v5 | 13KB | Server-state caching, revalidation, optimistic mutation with rollback, request dedupe. This is the single largest source of avoided bug classes in the app | ~600 lines of hand-written cache and invalidation logic |
| `zustand` | 1.2KB | Two small UI stores (§20.3) | `useContext` + reducer; more re-render noise |
| `zod` | 13KB | Shared runtime validation from `@nexusai/contracts`; already a backend dependency, so the schema is written once | Duplicated hand-written type guards, guaranteed drift |
| `react-markdown` + `remark-gfm` | 28KB | GFM parsing to a React tree — **no `dangerouslySetInnerHTML` anywhere**, which removes an entire XSS class rather than mitigating it | `marked` + `DOMPurify`: smaller, but reintroduces raw HTML injection |
| `shiki` | lazy, ~40KB | Build-time-accurate syntax highlighting, dual-theme via CSS variables, loaded as an async chunk after first paint | Prism (worse grammars) or none |
| `lucide-react` | ~4KB used | One icon system, tree-shaken per icon (§18.4) | Hand-drawn SVGs; more maintenance, no benefit |
| `clsx` | 0.4KB | Conditional class composition | String template concatenation; unreadable |

**Rejected, and why**

| Rejected | Reason |
|---|---|
| Framer Motion | 34KB for eleven CSS transitions ([§15.5](../design/components.md#155-no-animation-library)) |
| Redux Toolkit | The server-state problem is solved by TanStack Query; what remains is two booleans |
| shadcn/ui, MUI, Chakra | The brief demands an original design language. A component library means either fighting its defaults or inheriting its look — the exact "Vercel template" outcome forbidden |
| Axios | `fetch` is native, and streaming requires the native `ReadableStream` anyway |
| `date-fns` / `dayjs` | `Intl.RelativeTimeFormat` and `Intl.DateTimeFormat` are built in and localize correctly |
| `react-virtuoso` / `react-window` | Virtualization is not implemented — see §46 rationale. Revisit only with measured evidence |
| `socket.io` | The stream is unidirectional server→client. A WebSocket adds reconnection and protocol complexity for no gain |

### 18.2 Rendering and transport model

**SPA, client-rendered, no SSR.** Every route is behind authentication. There is no crawlable
content, no first-paint SEO requirement, and no shareable public page. SSR would add a Node process
to the deployment, a hydration boundary, and a second place where auth state can disagree with
itself — in exchange for nothing this product needs.

**Streaming uses `fetch` + `ReadableStream`, not `EventSource`.** This is a load-bearing decision:

| Requirement | `EventSource` | `fetch` streaming |
|---|---|---|
| POST with a JSON body | ✗ GET only | ✓ |
| Custom headers (`X-Nexus-Client` CSRF defense) | ✗ | ✓ |
| Cancellation via `AbortController` | ✗ (`close()` doesn't inform the server reliably) | ✓ |
| Automatic reconnect | ✓ | ✗ — and we do **not** want it: silent reconnection would duplicate a generation |

The server still speaks **SSE wire format** (`data: {...}\n\n`), because it is a well-understood,
proxy-friendly, human-debuggable framing. We simply parse it ourselves. The parser is ~60 lines in
`lib/sse.ts` and is unit-tested against split-chunk, multi-event-per-chunk, and CRLF cases.

### 18.3 Code splitting

```text
Entry chunk           React, Router, Query, shell, auth routes           target < 160KB gz
chat chunk            Conversation view, composer, model selector        lazy on /c/*
markdown chunk        react-markdown + remark-gfm                        lazy on first assistant message
shiki chunk           Highlighter + grammars                             lazy on first code block
settings chunk        Settings dialog                                    lazy on /settings
```

The markdown and Shiki chunks load *while the first response is streaming*, so their download
overlaps latency the user is already waiting through.

### 18.4 Icon policy

One system: **Lucide**, imported per-icon (`import { Plus } from 'lucide-react'`) so the bundle
contains only what is used. The complete permitted set for MVP is enumerated, and adding to it is a
review decision:

`Plus` `Search` `PanelLeft` `ChevronDown` `Check` `Copy` `RotateCcw` `Square` `ArrowUp`
`MoreHorizontal` `Pencil` `Trash2` `X` `AlertCircle` `Loader2` `Sun` `Moon` `Monitor` `LogOut`
`Eye` `EyeOff` `Paperclip`

Rules: 16px default (14px inline, 18px at `lg`), `stroke-width: 1.75`, `currentColor` only,
`aria-hidden` unless the icon is the sole content of a labelled `IconButton`. No emoji anywhere in
the product, including in code comments and commit messages.

### 18.5 Error boundaries

Three, at deliberate granularity:

1. **Root** — catches catastrophic render failure. Full-page recovery screen with `Reload`.
   Reports to the error endpoint with the request id.
2. **Route** — per route element. Keeps the shell and sidebar alive so the user can navigate away
   from a broken conversation rather than losing the whole app.
3. **Message** — around each `AssistantMessage`. A malformed markdown tree from a model must not
   take down the conversation. The failed message renders as plain preformatted text with a note.

Error boundaries catch render errors only. Async and network failures are handled by TanStack
Query's `error` state and by the stream's own error events — never by a boundary.

---

## 19. Frontend Repository Structure

**As implemented.** Generated from the tree, not from intent.

```text
frontend/
├── index.html              pre-paint theme bootstrap, font preload
├── public/fonts/           Instrument Sans + IBM Plex Mono, latin subsets (40 KB)
├── vite.config.ts          aliases, dev proxy, manual chunks
├── vitest.config.ts        jsdom, setup file, src/**/*.test.*
└── src/
    ├── main.tsx
    ├── app/                router, providers, query client, auth guard, error boundary
    ├── pages/              split by audience
    │   ├── home/           public landing
    │   ├── auth/           login, register, shared auth layout
    │   ├── app/            the authenticated workspace
    │   └── not-found-page.tsx
    ├── components/
    │   ├── ui/             generic primitives — zero domain knowledge
    │   ├── layout/         app shell, header
    │   └── marketing/      public-page only; never imported by product code
    ├── features/           auth, chat, conversations, models, search, settings
    ├── lib/                http, sse, routes, format, clipboard, id, shortcuts, metadata
    ├── stores/             theme, ui, toast — 6 values of global client state
    ├── styles/             tokens.css (single source of visual truth), base, markdown
    └── test/               render harness, fixtures
```

### 19.1 Boundaries

| Layer | May import | Never imports |
|---|---|---|
| `pages/` | features, components, lib, stores | — |
| `features/x/` | components/ui, lib, stores, contracts | another feature, `components/marketing` |
| `components/ui/` | lib | features, stores, marketing |
| `components/marketing/` | components/ui, lib | features (except `auth/use-session`) |
| `lib/` | contracts | features, components |

Marketing and product share every design token and never share components. The
landing page reuses `Rule`, `Logo`, `IconButton` and the rail's own geometry;
it does not reach into `features/chat`.

**Route paths live in `lib/routes.ts`.** Nowhere else. They were previously
literals in eight files, which is what made adding the `/app` prefix an
eight-file change.

### 19.2 Why this structure, and the rules that keep it honest

**Feature-first, not type-first.** A `components/`, `hooks/`, `services/` split scatters one feature
across five directories, so a change to model selection touches five folders and a reviewer cannot
see the feature's boundary. Here, everything about model selection is in `features/models/`.

**`lib/` is capped and named.** The brief specifically warns against `utils/helpers/common/misc`.
`lib/` here contains **five files**, each an infrastructure concern with a real name — HTTP
transport, SSE parsing, clipboard, formatting, keyboard. Rules enforced in review:

- A file in `lib/` may not import from `features/`.
- No file named `utils.ts`, `helpers.ts`, `common.ts`, `misc.ts`, `index.ts`-as-barrel, or `types.ts`
  containing unrelated types.
- If a function is used by exactly one feature, it lives in that feature. `lib/` requires ≥2 consumers.

**Dependency direction is enforced by lint**, not by convention. `eslint-plugin-boundaries`:

```text
routes    →  features, components, lib, stores      ✓
features  →  components, lib, stores, contracts     ✓
features  →  another feature                        ✗ ERROR
components→  lib                                    ✓
components→  features, stores                       ✗ ERROR
lib       →  contracts only                         ✓
```

`components/` importing from `stores/` is an error because it would make a "generic" component
secretly stateful and unreusable.

**No barrel files.** `index.ts` re-export barrels defeat tree-shaking, create import cycles, and
make "go to definition" land in the wrong place. Imports are always to the concrete module.

**File size ceiling: 250 lines.** Not a lint rule (which invites gaming) but a review trigger: a
file over 250 lines must be justified in the PR description. `use-chat-stream.ts` is expected to be
the largest file in the app at ~200 lines, and it is the one place where that concentration is
correct — splitting the stream lifecycle across four files would make it harder to reason about, not
easier.

---

## 20. Frontend State Architecture

### 20.1 The six state categories and their owners

| Category | Owner | Lifetime | Why |
|---|---|---|---|
| **Auth / session** | TanStack Query, key `['session']` | Until logout or 401 | It is server state. Treating it as client state creates two sources of truth about who you are |
| **Conversation list** | TanStack Query, key `['conversations']` | Cached 5 min, revalidated on focus | Server state |
| **Message history** | TanStack Query, key `['messages', conversationId]` | Cached per conversation | Server state, paginated |
| **Model catalog** | TanStack Query, key `['models']`, `staleTime: 60s` | Refetched on window focus | Server state that genuinely changes (availability) |
| **Active stream** | `useReducer` inside `use-chat-stream.ts`, local to the conversation route | The duration of one generation | Ephemeral, high-frequency, single-consumer. Putting 60 updates/second through a global store would re-render the sidebar |
| **UI state** | Zustand, two stores | Session / persisted | Genuinely global booleans |

### 20.2 Why the stream is not in a global store

The streaming reducer receives an event roughly every 16–30ms. Three properties make local state the
only correct choice:

1. **Single consumer.** Only the message list renders stream content.
2. **Frequency.** A global store notifies every subscriber; the sidebar and model selector would
   re-render thousands of times per response.
3. **Lifetime.** The state is meaningless after `COMPLETE`. Global state that must be manually torn
   down is a leak waiting to happen.

On `COMPLETE`, the finalized message is written into the TanStack Query cache for
`['messages', conversationId]` via `setQueryData`, and the local reducer resets. From that moment
there is exactly one source of truth again.

### 20.3 The two Zustand stores, in full

```ts
// stores/ui-store.ts
type UIStore = {
  sidebarOpen: boolean;            // mobile drawer
  sidebarCollapsed: boolean;       // desktop, persisted
  toggleSidebar(): void;
  setSidebarOpen(open: boolean): void;
  toggleCollapsed(): void;
};

// stores/theme-store.ts
type ThemeStore = {
  preference: 'dark' | 'light' | 'system';   // persisted
  resolved: 'dark' | 'light';                // derived from preference + media query
  setPreference(p: ThemeStore['preference']): void;
};
```

That is the entire global client state of the application: three booleans and an enum. This is the
"do not create a giant global store" rule made concrete. If a third store is ever proposed, the
first question is whether it is actually server state wearing a disguise.

### 20.4 Query client configuration

```ts
{
  queries: {
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: (failureCount, error) =>
      isRetryable(error) && failureCount < 2,      // never retry 4xx
    refetchOnWindowFocus: true,                    // availability must be fresh
    refetchOnReconnect: true,
  },
  mutations: { retry: false },                     // mutations are not idempotent
}
```

`refetchOnWindowFocus` is enabled specifically because model availability is time-sensitive: a user
returning to the tab after an hour must not see a stale `AVAILABLE` badge. This is the honesty rule
expressed as a cache policy.

### 20.5 Optimistic updates and rollback

Three mutations are optimistic. Each defines its rollback explicitly.

| Mutation | Optimistic effect | On error |
|---|---|---|
| Send message | User message appended with `status: 'sending'` | Marked `failed`, inline `Retry`, text recoverable into the composer |
| Rename conversation | Title updated in list and header | Previous title restored, toast `Couldn't rename that conversation.` |
| Delete conversation | Item removed; navigate away if active | Item reinserted at its original index, toast |

Every optimistic mutation cancels in-flight queries for the affected key first, snapshots the
previous value in `onMutate`, and restores it in `onError`. This is TanStack Query's documented
pattern and it is used uniformly rather than reinvented per call site.

### 20.6 The stream reducer

`stream-reducer.ts` is a pure function — no fetch, no DOM, no timers — which makes the hardest part
of the product exhaustively unit-testable.

```ts
type StreamState =
  | { phase: 'idle' }
  | { phase: 'pending';   messageId: string; startedAt: number }
  | { phase: 'streaming'; messageId: string; text: string; model: ModelRef; failover?: Failover;
                          firstTokenAt: number }
  | { phase: 'complete';  messageId: string; text: string; model: ModelRef; metadata: Metadata }
  | { phase: 'cancelled'; messageId: string; text: string; model: ModelRef }
  | { phase: 'error';     messageId?: string; text?: string; error: AppError };

function reduce(state: StreamState, event: ChatEvent): StreamState
```

Illegal transitions are unrepresentable: a `DELTA` arriving in `idle` is ignored and logged rather
than crashing; `COMPLETE` from `pending` without any delta produces `complete` with empty text,
which the UI renders as an error rather than an empty bubble. Test cases enumerate every
(phase × event) pair — 36 combinations, all asserted.

### 20.7 Frontend performance rules

- **RAF-coalesced streaming.** Deltas accumulate in a ref; a single `requestAnimationFrame` flush
  commits them. Maximum one render per frame regardless of token rate.
- **Memoized message rendering.** `AssistantMessage` is `memo`'d on `(id, text, status)`. Completed
  messages never re-render when a new message streams.
- **Block-level markdown memoization.** The renderer splits content into top-level blocks; completed
  blocks are memoized by index and only the final block re-parses during streaming.
- **Stable keys.** Message keys are server ids; the optimistic user message uses a client-generated
  `clientMessageId` that is reconciled with the server id on `START` — never an array index
  (UX Pro Max, React §keys).
- **No derived state in `useState`.** Grouped conversations, filtered search results, and character
  counts are computed during render (React §avoid-unnecessary-state).
- **Search is local.** Conversation search filters the already-cached list client-side with a 120ms
  debounce. A server round-trip per keystroke for a list of a few hundred titles would be slower and
  would leak typing patterns into logs.

## Marketing illustrations

The public page's product visuals are components, not images. Four of them —
`orchestration-visual`, `perspective-panel`, `synthesis-diagram`,
`failure-panel` — plus two legends, `stance-legend` and `rail-legend`.

They are components for one reason: a screenshot goes stale silently, and a
marketing page that shows an interface the product no longer has is a lie that
nobody notices. Built from the same tokens and the same notation, they drift
only when the design system does.

Two rules they all follow. **No invented model output** — every text run is
either a label the application renders or a neutral placeholder bar, because a
reader cannot tell a fabricated answer from a real one. And **counts come from
`lib/format`**, so an illustration cannot claim an agreement the workspace would
not report for that shape of turn.

Each is one `<figure>` with a single `sr-only` description and an
`aria-hidden` body: a screen reader gets one sentence describing what the
diagram shows, rather than walking a grid of decorative bars.

The dependency rule is unchanged — `components/marketing/` may reach
`components/ui`, `lib`, and nothing in `features/` except `auth/use-session`.

## Section rhythm on the public page

`Section` owns its own full-bleed band and takes two props that exist for one
reason: a twelve-section page on a single surface, every section the same
shape, reads as a memo no matter how good the copy is.

`surface` alternates the field between `canvas` and `workspace`. The eye needs
a boundary to register that a new idea has started, and a hairline rule does
not provide one.

`layout="split"` puts the heading in a sticky left column beside its content.
Used where the content is a sequence the reader works through — the heading
stays as context instead of scrolling away, and the page gains a second shape.

The marketing headline uses `--text-hero`, which is the one sanctioned break
from the workspace's `--text-display` ceiling. It is fluid (`clamp`) rather
than a stack of breakpoint overrides, so the exception stays a single decision:
~35px at 360px, ~58px at 1280px.

Connectors in the fan-out diagram are SVG paths, not borders. Branching and
converging *are* the idea; three boxes stacked with whitespace between them
assert a relationship the page never draws. They are hidden below `sm`, where
the lanes stack and a horizontal fan would describe a layout that no longer
exists.

## Scroll ownership

Three route families, two scroll models. Getting this wrong once cost a
completely unscrollable public site, so it is written down.

**Public pages (`/`) and auth (`/login`, `/register`) — the document scrolls.**
`body` carries `min-height: 100dvh` and nothing else: no fixed height, no
`overflow`. The browser owns the vertical scroll, which is what a long-form
marketing page needs and what every assistive technology and browser affordance
already understands.

**The workspace (`/app`, `/app/chat/:id`) — the shell scrolls, not the
document.** `app-shell.tsx` applies `h-dvh overflow-hidden` to its own root, and
the message list scrolls inside it. A chat surface wants a fixed frame with the
composer pinned; that is a property of the workspace, not of the site.

### The bug this replaced

`base.css` previously declared, globally:

```css
html { height: 100dvh; }
body { height: 100dvh; overflow: hidden; }
#root { height: 100%; }
```

Correct for the workspace, inherited by everything. And because `html` was
`overflow: visible`, the body's `overflow: hidden` **propagated to the
viewport** — the rule in CSS Overflow that takes the viewport's overflow from
`html`, or from `body` when `html` is `visible`. User scrolling was therefore
disabled document-wide: wheel, keyboard and scrollbar alike, on a marketing
page over eight thousand pixels tall.

`window.scrollTo` kept working throughout, which is why the problem can survive
a scripted check: **programmatic scrolling is unaffected by a clipped viewport.**
Any future test of this must measure user scrolling or the stylesheet, never
`scrollTo`.

### Rules that follow from it

- Nothing global may set a height or an `overflow` on `html`, `body` or `#root`.
- A route that needs a fixed viewport sizes itself in viewport units (`h-dvh`),
  never `h-full` — a percentage chain through `html`/`body` is how the
  constraint escapes its route.
- Public pages use `min-h-dvh`, not `min-h-full`, for the same reason.

Guarded by `src/styles/scroll-architecture.test.ts`, which asserts the
stylesheet rather than a rendered layout: jsdom performs no layout, so a test
that appeared to measure scrolling would be measuring nothing.
