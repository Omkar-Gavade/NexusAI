# ADR-010 — A public product surface, and an `/app` prefix

Status: **Accepted** · 2026-08-19

## Context

`/` was a bare redirect into the authenticated workspace. Anyone arriving
without a session was bounced through `/app` to `/login` and shown a form,
having never been told what the product is. The product had no public face.

Separately, product routes sat at `/c/:id`, indistinguishable from a public path.

## Decision

**A real landing page at `/`**, and every authenticated surface behind `/app`.

```text
/                       public   landing
/login  /register       public   auth
/app                    private  workspace (new conversation)
/app/chat/:id           private  conversation
```

The prefix makes the auth boundary readable from the URL alone, and it means a
route guard can wrap one subtree rather than being repeated per route.

**Search and Settings stay dialogs, not routes.** Both are transient overlays
over a conversation the user is mid-way through reading. Making them routes
would unmount the conversation, discard scroll position, and put an entry in
history for something nobody links to. `⌘K` and `⌘,` open them.

**The landing page states what is built and what is planned, in one table, with
equal weight.** Attachments, Projects and Knowledge are marked `Planned`
because they are not built. The interface illustration in the hero is captioned
as a static illustration and contains no model name, latency or agreement count.

## Alternatives considered

- **Keep `/` as a redirect.** Cheapest, but the product cannot be explained to
  anyone who has not already been sold on it.
- **Marketing on a separate site.** Duplicates the design system and guarantees
  the two drift. The landing page reuses the product's own tokens, typography
  and rail geometry.
- **A hero with a live product demo.** Would require either a real backend on a
  public page or fabricated model output. Rejected — the second option is the
  exact dishonesty the product exists to avoid.
- **`/chat/:id` without a prefix.** Leaves no room for `/app/projects` and other
  authenticated surfaces without ambiguity against public routes.

## Consequences

- The workspace is lazy-loaded. Landing does not download the chat surface,
  markdown renderer or model selector: home entry is 133 KB gzipped against a
  full-app 152 KB.
- Route paths are centralised in `frontend/src/lib/routes.ts`. They had been
  string literals in eight files, which is why a prefix change touched eight
  files.
- `pages/` is split by audience — `pages/home`, `pages/auth`, `pages/app` — and
  marketing components live in `components/marketing/`, which may not be
  imported by product code and vice versa.
