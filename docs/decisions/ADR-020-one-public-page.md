# ADR-020 — One public page

Status: **Accepted** · 2026-09-02
Amends: [ADR-010](./ADR-010-public-product-surface.md)

## Context

ADR-010 established a public landing page at `/`. That page grew to carry every
explanation the product has — twelve sections, four diagrams, a capability
table — and became long, evenly weighted, and slow to reach a point. The
response was to split it: `/how-it-works`, `/synthesis` and `/use-cases` took
the detail, and `/pricing` was added alongside them.

Both halves of that were wrong.

**The split did not work.** The argument only landed for a reader who clicked,
and most do not. Nav and footer now had to be kept in sync with four routes, and
they were not: the anchors left behind by the split (`#how-it-works`,
`#synthesis`, `#provenance`, `#use-cases`) pointed at ids that existed nowhere
and shipped as four dead links on every marketing page, under a comment
asserting that every entry was an anchor that exists. Fixing that by pointing
them at routes then left the reverse problem waiting for the next change.

**Pricing described nothing.** No pricing exists, so the page could only say so
— three tiers marked "coming soon" and a test forbidding any figure from
appearing.

## Decision

**One public page.** `/` carries the whole product story in the order a visitor
needs it, and `/pricing`, `/how-it-works`, `/synthesis` and `/use-cases` are
removed — routes, components, chunks, nav entries, footer entries and tests.

The page is ordered around the product's single decision rather than around its
mechanism:

```text
hero          one question, one model or several
#modes        direct, or synthesised     ← the only section that must land
#models       six models, six providers
#how-it-works parallel fan-out, then the stages
#synthesis    reconciliation, stance, and its limits
#provenance   used models, rail, failover
#product      the real answer surface
cta
```

Everything after `#modes` is mechanism for a reader who wants it. A visitor who
leaves having understood only `#modes` has understood the product.

**Nav and footer use native anchors.** A React Router `Link` with a hash-only
`to` pushes the location and does not scroll, which looks exactly like a broken
link. `home-page.test.tsx` resolves every public href — anchor or route —
against what the page actually renders.

**Removed routes are not redirected.** The SPA fallback serves the shell and the
router answers not-found. A redirect would keep a dead concept addressable.

## Alternatives considered

- **Keep the sub-pages, fix the links.** Fixes the symptom. The structural
  problem is four surfaces kept in sync by hand, which had already failed twice
  in opposite directions.
- **Keep them and add redirects.** Preserves inbound links to a pre-launch
  product that has none, at the cost of keeping four dead concepts addressable.
- **One page, but shorter.** Tempting, and how the twelve-section version was
  justified. The length problem was never the section count; it was that every
  section had equal weight and none of them was the choice a visitor has to
  make. `#modes` is now that section and the rest supports it.

## Consequences

- The homepage is no longer lazy-loaded behind a chunk boundary, because there
  are no sibling marketing chunks to split from. It is the first paint.
- `components/marketing/` lost `capability-table`, `failure-panel` and
  `perspective-panel` (orphaned by the removal) and `PageHero` (its only
  callers were the sub-pages). It gained `response-modes` and `used-models`.
- `docs/product/routes.md` documents the anchors; the test enforces them.
