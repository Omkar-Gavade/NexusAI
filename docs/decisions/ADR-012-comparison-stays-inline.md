# ADR-012 — Comparison stays inline; no side panel, no mobile tabs

Status: **Accepted** · 2026-08-19

## Context

[design/components.md](../design/components.md) specifies two comparison layouts
that were never built: a 360px side panel at ≥1280px showing model responses
beside the answer, and a tab strip below 1024px showing one model at a time.

Both were carried as debt. The question for this pass was whether to build them
or to remove them from the plan.

## Decision

**Keep the single inline layout at every viewport.** Comparison remains a
collapsed disclosure beneath the answer, opening into stacked per-model panes.

Neither of the two alternatives is built.

## Reasoning

The inline layout already satisfies what the product needs comparison to do:

- **It preserves the hierarchy.** Comparison sits below the synthesis, collapsed,
  behind a labelled rule. Nothing about it competes with the answer. A side panel
  would place model responses *beside* the synthesis at equal prominence — which
  is precisely the dashboard reading the product was designed to avoid.
- **It preserves the measure.** Opening a 360px panel narrows the answer column
  mid-read, reflowing text the user is looking at. The alternative — overlaying
  the answer — hides the thing the comparison is evidence *for*.
- **Stacked panes already work on every screen.** They are readable at 375px and
  at 1920px without a second layout to maintain, and the rail gives direct access
  to any single model, which is the actual task ("what did model 3 say?").

The costs were real and the benefit was speculative:

| Option | Cost | Benefit |
|---|---|---|
| Side panel ≥1280px | Second layout mode, panel state, measure recalculation, focus management, a third responsive branch | Side-by-side reading — the one comparison mode the product deliberately rejects |
| Mobile tabs <1024px | A `Tabs` primitive, roving tabindex, per-tab panel state | One model at a time — which stacked panes with a rail shortcut already provide |

Neither would be added because a user asked. They were on the list because a
specification written before the component existed said so.

## Consequences

- `components/ui/tabs.tsx` is not built. It has no other consumer.
- `docs/design/components.md` §4.5 is amended: the responsive comparison table
  is replaced by a single inline layout and a pointer here.
- Revisit only with evidence — someone actually reporting that stacked panes are
  hard to compare on a wide screen. Not before.
