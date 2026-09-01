# 1–5 · Product

> **LEGACY — v1.0.** Describes the original single-model router: one question,
> one model, one answer. Retained because its UX flows, error copy and state
> design still hold. Superseded on scope by [overview.md](../overview.md) and
> [capability-matrix.md](../capability-matrix.md). Where it disagrees with
> `packages/contracts`, the contracts win.


## 1. Executive Product Definition

### 1.1 What NexusAI is

NexusAI is a **conversational interface backed by a model-routing platform**. A user types a
question into one composer. A backend orchestrator decides which model from which provider should
answer it, verifies that model is actually reachable, streams the answer back, and records which
model answered and how long it took.

The product's value is not "chat with AI" — that is commodity. The value is **the user never has to
choose, and never has to care, yet is never lied to about what happened.**

### 1.2 What NexusAI is not

- Not a model marketplace. There is no browsing, comparing, or benchmarking surface in MVP.
- Not an infrastructure dashboard. Provider health is a routing input, not a user-facing screen.
- Not an agent platform. No tools, no autonomous loops, no file ingestion in MVP.
- Not a wrapper that hardcodes one provider and labels it "multi-model."

### 1.3 The interpretation that drives every decision

The brief says *"one interface, multiple intelligences."* Two readings are possible, and they lead to
opposite products:

| Reading | Consequence | Verdict |
|---|---|---|
| A. Expose the multiplicity — show the user the fleet, the health, the scores | Infrastructure dashboard. User does routing work. | **Rejected** |
| B. Absorb the multiplicity — the user sees one calm surface; the fleet is visible only as an honest attribution line | Product feels effortless; sophistication is structural | **Adopted** |

Reading B has one hard constraint that keeps it from becoming dishonest: **whenever the system does
something the user did not ask for — fails over, refuses, degrades — it says so, in one plain
sentence, at the moment it happens.** Silence is only acceptable when nothing surprising occurred.

### 1.4 Primary user

A technically literate professional — engineer, analyst, writer, founder — who uses an AI assistant
several times a day for real work. They already know that different models have different strengths.
They are tired of maintaining that knowledge manually. They will not tolerate a product that
invents metadata, because they will notice.

### 1.5 Success definition for MVP

The product succeeds if a user can work in it for a week without ever opening the model selector,
and separately, if a user who *does* open the model selector finds that every claim it makes about
availability is true.

---

## 2. Product Principles

These are ordered. When two conflict, the higher number wins.

**P1 — Honesty outranks polish.**
An empty state that says "No real models are currently available" is better than a beautiful screen
that quietly serves a mock. Every displayed fact is a measured fact.

**P2 — The default path requires no decisions.**
Auto is preselected. A user who never touches the model selector gets correct behavior forever.
Configuration is an escape hatch, not a prerequisite.

**P3 — Explicit intent is authoritative.**
If a user manually picks a model, the system uses that model or explains why it cannot. It never
substitutes silently, even when substitution would produce a better answer. Overriding a user's
stated choice to improve a metric is a trust violation.

**P4 — The interface is quiet.**
No element exists to impress. Chrome recedes; content dominates. The most visually prominent things
on screen are, in order: the conversation text, the composer, the active conversation in the sidebar.

**P5 — Every state is designed.**
Loading, empty, partial, error, offline, disabled, and cancelled are first-class designs, not
afterthoughts. The failure states are where trust is actually won.

**P6 — Restraint is the aesthetic.**
Remove until removing breaks comprehension. If a border, shadow, icon, or animation cannot justify
itself functionally, it is deleted.

**P7 — Boring and correct beats clever and impressive.**
This applies to code and to product. A deterministic scoring function beats an LLM-based router.
A modular monolith beats microservices. Fewer abstractions beat more.

---

## 3. User Experience Philosophy

### 3.1 The central tension

Sophisticated routing produces a question: *how much does the user need to know?*

The answer is a three-tier disclosure model.

| Tier | What the user sees | When | Example |
|---|---|---|---|
| **Tier 0 — Ambient** | Nothing. The answer just arrives. | Normal operation | Streaming text appears |
| **Tier 1 — Attribution** | A single muted line under the response | Always, after completion | `Gemini 2.5 Flash · 2.1s` |
| **Tier 2 — Explanation** | One plain sentence, inline, only when something unexpected happened | Failover, refusal, cancellation, degradation | `Switched to Mistral Large because Gemini was temporarily unavailable.` |

Tier 2 never appears speculatively. If no failover happened, no failover message exists. This is
what makes Tier 2 credible when it does appear.

### 3.2 Interaction posture

- **Composer-first.** Focus lands in the composer on load and after every response completes. The
  primary loop is type → Enter → read → type.
- **No modal interruptions during generation.** Errors render inline in the message stream, where
  the context is. Toasts are reserved for actions that happen away from the reading surface
  (conversation deleted, copied to clipboard).
- **The input never freezes.** During generation the composer stays focusable and editable. The user
  may compose their next message while the current one streams. Send is replaced by Stop.
- **Destructive actions confirm once.** Delete conversation opens a dialog. Rename is inline.
  Nothing else confirms.

### 3.3 Content and tone

Microcopy is short declarative sentences. No exclamation marks. No emoji. No second-person hype.

| Situation | Copy |
|---|---|
| Empty conversation | `Ask anything.` |
| No providers configured | `No real models are currently available.` Secondary: `Add a provider API key to the server environment to begin.` |
| Generation failed, nothing streamed | `Something went wrong while generating the response.` + `Try again` button |
| Generation failed mid-stream | `The response was interrupted.` + `Continue` disabled, `Regenerate` offered |
| Manual model unavailable | `Claude Sonnet 4.5 is temporarily unavailable.` + `Use Auto instead` |
| Failover occurred | `Switched to Mistral Large because Gemini was temporarily unavailable.` |
| User cancelled | `Stopped.` |
| Rate limited | `You've sent too many requests. Try again in 30 seconds.` |

Forbidden vocabulary: *supercharge, unlock, seamless, revolutionize, effortlessly, journey,
next-generation, powerful AI, magic.*

---

## 4. Information Architecture

### 4.1 Route map

```text
/                       → redirect: authenticated ? /c/new : /login
/login                  public   Sign in
/register               public   Create account
/c/new                  private  Empty conversation (no conversation record yet)
/c/:conversationId      private  Existing conversation
/settings               private  Modal route over the current conversation, not a page
*                       any      Not found
```

**Decision — `/c/new` creates nothing.** A conversation record is created by the server only when
the first message is actually sent. This prevents a graveyard of empty conversations from users who
open a new chat and change their mind. On first successful send the client replaces the URL with
`/c/:id` via `history.replaceState`, so Back does not return to a now-stale `/c/new`.

**Decision — Settings is a modal route, not a page.** Settings in MVP is four controls. A full page
navigation would discard the user's scroll position and reading context for a theme toggle. The
modal is a real route (`/settings`) so it is linkable and Back-dismissible.

### 4.2 Screen hierarchy

```text
AppShell (authenticated)
├── Sidebar                      persistent ≥1024px, drawer <1024px
│   ├── Identity + collapse control
│   ├── New chat
│   ├── Search conversations
│   ├── Conversation list (grouped by recency)
│   └── Account menu → Settings, Log out
└── Main
    ├── ChatHeader               conversation title, mobile menu trigger
    ├── Conversation region
    │   ├── EmptyChat            when no messages
    │   └── MessageList          when messages exist
    └── Composer                 input, model selector, send/stop
```

### 4.3 Content grouping in the sidebar

Conversations are grouped by `updatedAt` into: **Today**, **Yesterday**, **Previous 7 days**,
**Previous 30 days**, **Older**. Group headers are sticky within the scroll container. Empty groups
are omitted entirely — never rendered as an empty heading.

### 4.4 Navigation model

- The sidebar is the only navigation. There is no top nav, no breadcrumb, no tab bar.
- Browser Back moves between conversations, because each is a real route.
- `⌘K` / `Ctrl+K` focuses conversation search. `⌘⇧O` starts a new chat. `⌘/` opens the shortcut list.
- No deep link requires authentication state to render a shell — unauthenticated users hitting
  `/c/:id` are redirected to `/login?next=/c/:id` and returned after sign-in.

---

## 5. UX Flows

Each flow is specified as: trigger → steps → states → failure handling.

### 5.1 Registration

```text
/register
  → email, password, display name
  → submit
  → 201 + session cookies set
  → redirect /c/new, focus composer
```

- Password rules stated **before** submission, not as post-hoc errors: minimum 12 characters.
  A strength meter is not shown — it is decorative and misleading.
- Duplicate email returns `409` with field-scoped error on the email input, announced via
  `role="alert"`. The form is not cleared.
- Submit button enters `loading` state and is disabled; the form is disabled as a `fieldset`.
- Network failure: inline form-level error, button returns to `default`, input values preserved.

### 5.2 First message in a new conversation

```text
/c/new, composer focused
  → user types, presses Enter
  → optimistic user message appears immediately, status "sending"
  → POST /api/chat/stream (fetch, streamed response)
  → server creates conversation + persists user message
  → START event  → conversationId, messageId, model, provider
  → client replaces URL /c/new → /c/:id, inserts conversation into sidebar at top
  → DELTA events → assistant text renders progressively
  → METADATA event → latency, token counts, failover notice if any
  → COMPLETE     → attribution line renders, composer refocuses
```

**Title generation.** The conversation title is the first 60 characters of the first user message,
trimmed at a word boundary, set server-side at creation. No second LLM call is made to write a
title — that would be a hidden cost and a hidden latency for cosmetic benefit. The user can rename.

**Failure before START:** the optimistic user message is marked `failed` with an inline `Retry`
affordance. No conversation is created. The user stays on `/c/new`.

### 5.3 Continuing a conversation

```text
/c/:id
  → messages load (paginated, newest 50)
  → scroll anchored to bottom
  → user sends
  → same stream lifecycle as 5.2, minus conversation creation
```

**Scroll behavior during streaming.** The view auto-follows the bottom only while the user is
already within 64px of the bottom. If the user scrolls up to read, auto-follow disengages and a
`Jump to latest` button appears above the composer. This prevents the single most irritating bug in
streaming chat UIs — being yanked away from text you are reading.

### 5.4 Stopping generation

```text
generation in progress
  → user clicks Stop (or presses Escape while composer focused)
  → client aborts fetch
  → server detects abort, cancels provider request
  → server finalizes assistant message with status "cancelled"
  → CANCELLED event (best effort; may not arrive if socket already closed)
  → UI: partial text retained, muted line "Stopped."
  → composer refocuses, Regenerate available
```

The partial text is **kept**, not discarded. Discarding work the user already read is destructive.

### 5.5 Manual model selection

```text
composer → model selector (⌘M or click)
  → listbox opens: AUTO, then AVAILABLE group, then UNAVAILABLE group, then DEVELOPMENT (dev only)
  → arrow keys move, Enter selects, Escape closes and restores focus to trigger
  → selection persists for the conversation, stored in user preferences as the new default
```

Unavailable models are **listed but not selectable** (`aria-disabled`), each with its reason as
secondary text (`Not configured`, `Temporarily unavailable`). Hiding them would make the product
feel smaller than it is and would leave the user unable to discover why a model is missing.

### 5.6 Failover during a request

```text
Auto selected → Gemini chosen → provider returns 503 before any token
  → orchestrator classifies as PROVIDER_UNAVAILABLE (retryable, no tokens emitted)
  → excludes Gemini, re-ranks remaining compatible candidates
  → selects Mistral Large, begins stream
  → METADATA event carries failover: { from: "gemini-2.5-flash", to: "mistral-large-2", reason: "PROVIDER_UNAVAILABLE" }
  → UI renders one muted line above the response:
    "Switched to Mistral Large because Gemini was temporarily unavailable."
```

If tokens had already been emitted, **no failover occurs** — see [Failover](../backend/ai-platform.md#32-failover).

### 5.7 Renaming and deleting

- **Rename:** double-click or `F2` on the conversation item, or the row's overflow menu. The item
  becomes an inline input, text preselected. Enter commits, Escape reverts. Optimistic update with
  rollback on failure.
- **Delete:** overflow menu → confirmation dialog naming the conversation. On confirm, the item is
  removed optimistically; if the user is currently viewing it, navigate to `/c/new`. Failure
  restores the item and shows a toast: `Couldn't delete that conversation.`

### 5.8 Session expiry

Access tokens are short-lived. When any request returns `401` with `code: "TOKEN_EXPIRED"`, the
client silently attempts one refresh and replays the original request. If refresh fails, the client
clears cached state and navigates to `/login?next=<current path>` with a single line:
`Your session expired. Sign in to continue.`

A refresh failure **during streaming** does not attempt a mid-stream replay — the partial response
is finalized locally and the user is signed out after the stream terminates, so no text is lost.

### 5.9 Degraded operation

| Condition | Behavior |
|---|---|
| No provider configured | Composer disabled with helper text `No real models are currently available.` Model selector shows only unavailable entries. Conversations remain readable. |
| All providers unhealthy | Composer remains enabled (health data can be stale); send attempt returns a clear error rather than pre-emptively blocking. |
| Browser offline | Composer disabled, banner `You're offline. Messages will send when you reconnect.` Existing conversation stays readable from cache. |
| Redis unavailable | Chat continues. Rate limiting fails **closed** for auth endpoints and **open** for chat. Availability falls back to `UNKNOWN`. See [Redis](../architecture/security-operations.md#40-redis). |
| MongoDB unavailable | Chat is rejected with a clear error. No response is generated that cannot be persisted. |
