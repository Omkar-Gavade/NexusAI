# NexusAI Component System

Status: **CURRENT (v2.0)** · Updated 2026-08-19

> **Supersedes** the previous version. That version specified components for a single-model chat
> product. This version covers the full-vision workspace: synthesis, provenance, comparison, sources,
> attachments, knowledge, and projects. It depends on [Design Language](language.md) for
> all tokens and signatures.

---

## 1. Component Philosophy

### 1.1 The question every component must answer

> **Why does this component exist, and what breaks if it doesn't?**

A component that exists because it "looked good as a card" is deleted. Two consequences:

- **Cards are rare.** Six card instances exist in the whole application: comparison pane, source
  card, attachment chip-expanded, inline error, dialog, toast. Everything else is whitespace,
  measure rules, and tonal surfaces — the separation hierarchy from
  [§5.4](language.md#54-the-separation-hierarchy).
- **Variants are named, not configured.** `<Button variant="primary">`, not
  `<Button config={{...}}>`. A component taking a configuration object is a component that has lost
  its boundary.

### 1.2 Ownership

| Location | Rule |
|---|---|
| `components/ui/` | Primitives. Zero domain knowledge. If it mentions a model, a conversation, or a source, it does not belong here |
| `components/layout/` | `AppShell`, `Sidebar`, `Header`, `SidePanel`. Structure only |
| `features/<domain>/components/` | Owned by one feature. May import `ui/` and `layout/`, never another feature |

**Promotion rule:** a component moves into `ui/` when a *second* feature actually needs it. Never in
anticipation.

**When not to abstract:** `Synthesis` and `ModelResponse` share a markdown renderer and nothing else
— different registers, different measures, different surfaces, different states. They are not unified
behind `<Answer variant>`. A variant prop whose branches share nothing is a `switch` in costume.

### 1.3 Inventory

```text
ui/            Button IconButton Input Textarea Select Checkbox Toggle
               Tooltip Dropdown Dialog Sheet Popover Tabs Toast
               Avatar Chip Skeleton Alert EmptyState Rule Kbd

layout/        AppShell Sidebar Header SidePanel Scrim

features/
  conversations/  ConversationList ConversationItem ConversationSearch
                  ProjectList ProjectItem AccountMenu DeleteDialog
  chat/           Composer ComposerInput AttachmentTray SendControl
                  MessageList UserMessage AnswerBlock
                  ProvenanceRail RailSegment
                  Synthesis AgreementSummary
                  Comparison ModelResponse ModelMark ModelHeader
                  SourceList SourceCard CitationMarker
                  MessageActions MessageMetadata MessageError
                  Markdown CodeBlock MarkdownTable
  models/         ModelSelector ModelOption RoutingModeSelect
  knowledge/      KnowledgeList KnowledgeItem AttachmentCard
  search/         SearchDialog SearchResult
  settings/       SettingsDialog AppearanceSection AccountSection
```

---

## 2. Primitives

Each spec: **purpose · anatomy · dimensions · states · keyboard · accessibility · must-not-contain.**

### Button

Four variants. There is no fifth.

| Variant | Fill | Text | Border | For |
|---|---|---|---|---|
| `primary` | `--text-primary` | `--text-inverse` | none | Send, Sign in, Save. One per view |
| `secondary` | transparent | `--text-primary` | 1px `--border-control` | Cancel, Retry, Use Auto |
| `ghost` | transparent | `--text-secondary` | none | Row actions, menu triggers, message actions |
| `danger` | `--danger` | `#FFFFFF` | none | Destructive confirmation only. Never a resting-state control |

**Dimensions.** `sm 26px` · `md 30px` (default) · `lg 38px` (auth only). Padding-x `--space-3`.
Radius `--radius-control` 5px. Text `--type-ui` 13/400, `550` for `primary`. Icon 14px, gap
`--space-1`.

30px rather than 32 is deliberate: with 13px/20 text and 5px radius, 30px is the height at which a
button reads as an instrument control rather than a web button.

**States.** Per [§7.1](language.md#71-state-vocabulary). `primary` hover darkens the fill
6%; `secondary`/`ghost` hover take `--surface-hover`. **No transform on press.**
`loading` freezes width and holds the label at zero opacity.

**Keyboard.** Native `<button>`. Enter and Space. Never `<div onClick>`.
**a11y.** Icon-only usage is impossible — the type signature rejects a missing child; use
`IconButton`.
**Must not contain.** Gradients. Label substitution ("Sending…"). A `size="xl"`.

---

### IconButton

Square, one icon, mandatory label.

**Dimensions.** `sm 26` · `md 30` · `lg 38`. Icon 14/16px. Radius `--radius-full`. Below 1024px the
hit area expands to 44×44 via a `::before` while the visual box stays 30px.

**a11y.** `label: string` is a **required prop**, enforced by TypeScript. It becomes `aria-label` and
the tooltip content. An unlabeled icon button cannot be constructed.

---

### Input / Textarea

**Anatomy.** Visible `<label>` above (never a placeholder as label), control, helper or error below.

**Dimensions.** Height 30px (`Input`), radius 5px, padding `--space-2`, border 1px
`--border-control`, text `--type-ui`. Background `--surface-canvas` in dark, `--surface-floating` in
light — the input reads as an inset well in dark and a raised field in light, matching each theme's
depth direction.

**States.** `hover` border → `--border-strong`. `focus-visible` border → `--accent` **plus** the
focus ring. `error` border → `--danger`, message below with `role="alert"`, `aria-invalid`,
`aria-describedby`. `disabled` → `--surface-workspace` fill, `--text-disabled`.

**Mobile.** `font-size: 16px` forced below 768px to defeat iOS zoom-on-focus. `inputmode` and
`enterkeyhint` set per field.

---

### Select

Native `<select>` is **not** used — it cannot render two-line options or group headers consistently.
`Select` is a `Dropdown` with listbox semantics, sharing the `Listbox` behaviour module with
`ModelSelector`.

---

### Checkbox / Toggle

**Checkbox** 15×15px, radius 3px, 1.5px `--border-control`; checked fills `--accent` with a 9px
white check. **Toggle** 30×17px track, 13px knob, radius full; checked track `--accent`. Both use a
real `<input>` visually hidden beneath a styled span, so form semantics, `:checked`, and
`:focus-visible` are native. Toggle carries `role="switch"` and `aria-checked`.

---

### Tooltip

**Trigger delay 400ms in, 80ms out**, with a 300ms grace period so moving between adjacent icon
buttons does not re-delay. Content `--type-micro` 12px on `--surface-floating`, 8px radius,
`--shadow-float`, 1px border. Max 220px.

**Tooltips never carry information required to complete a task.** They are supplementary, because
they are unreachable on touch. Keyboard focus opens them with no delay.

---

### Dropdown / Popover

Portal-rendered, `--surface-floating`, 8px radius, `--shadow-float`, 1px `--border-default`. Min
width 180px, max 320px. Rows 28px, `--type-ui`, `--space-2` inset. Group headers are 11px machine
register, uppercase, `--text-tertiary`, with `--space-1` padding.

Positioned with anchor-relative logic that flips on collision and clamps to the viewport with an 8px
inset. Closes on: Escape, outside pointerdown, scroll of the anchor's container, route change.

---

### Dialog / Sheet

Built on native `<dialog>` + `showModal()`. Focus trapping, background `inert`, Escape handling, and
top-layer stacking come from the platform; a hand-rolled trap is ~120 lines reimplementing it worse.

**Dialog** `min(460px, 100vw − 32px)`, `--space-6` padding, 8px radius, `--shadow-modal`, 1px border.
Title `--type-title`, body `--type-ui`, actions right-aligned, `secondary` before `primary`.

**Focus lands on the least destructive action.** On close, focus returns to the trigger.

**Below 640px a Dialog becomes a Sheet** — full width, bottom-anchored, top corners 8px, entering
`translateY(100%) → 0` at `--duration-slow`.

---

### Tabs

Used only in the comparison view and settings. Underline indicator 2px `--accent`, sitting on a 1px
`--border-subtle` baseline that runs the measure. Labels `--type-ui`, active `--type-ui-strong`.
Roving tabindex, `role="tablist"`, arrow keys move, `Home`/`End` jump, activation is **manual**
(Enter/Space) so arrowing through does not fire expensive panel loads.

---

### Chip

`--type-meta` 12px machine register, 3px radius, `--surface-raised`, 1px `--border-subtle`, padding
`2px 6px`. Used for attachments, active filters, and model marks in comparison headers. **Never
used decoratively** — a chip that is not removable or not a filter is just text with a box around it.

---

### Rule

The [S4 measure rule](language.md#13-what-the-signatures-are-not) as a component.

```tsx
<Rule label="COMPARISON" />     // ── COMPARISON ────────────────
<Rule />                        // ──────────────────────────────
```

Renders as `<hr>` when unlabelled; as a `<div role="separator" aria-label>` when labelled. Spans
`--measure-answer`, never the viewport.

---

## 3. Layout

### AppShell

```text
≥1280px
┌────────────────┬──────────────────────────────────────┬───────────────┐
│ Sidebar 264px  │ Header 44px                          │ SidePanel     │
│ surface-       ├──────────────────────────────────────┤ 360px         │
│ workspace      │                                      │ (conditional: │
│ border-right   │  ▌ answer column, 68ch measure       │  comparison   │
│                │  ▌                                   │  or sources)  │
│                │  ▐                                   │               │
│                │  │ FOUR MODELS · THREE CONCUR        │               │
│                │                                      │               │
│                ├──────────────────────────────────────┤               │
│                │  composer, aligned to measure        │               │
└────────────────┴──────────────────────────────────────┴───────────────┘
```

The answer column is centred **in the space remaining after both panels**, so opening the side panel
shifts the measure rather than overlapping it. Overlaying content the user is reading to show them
more content is the wrong trade.

Owns: drawer state, side-panel state, skip link, the single `<main>` landmark, and the route-change
focus target.

---

### Sidebar

Information architecture, in order. This ordering follows access frequency, not category tidiness.

```text
  264px
┌────────────────────────────────┐
│ 10px                           │
│  ◇ NexusAI               ⇤     │  40px · mark 18px · wordmark --type-ui-strong
│  ── ───────────────────────    │  border-bottom, full width (chrome, not measure)
│                                │
│  ＋ New conversation      ⌘⇧N  │  28px rows, --type-ui
│  ⌕ Search                 ⌘K   │
│                                │
│  ── PROJECTS ──────────────    │  labelled rule, 11px machine
│  ▸ Distributed systems         │  28px, collapsible
│  ▸ Q3 research                 │
│                                │
│  ── TODAY ─────────────────    │
│  ▌Saga vs. two-phase commit    │  28px · selected: 2px accent rail
│   Index strategy review        │    + surface-selected + ui-strong
│                                │
│  ── EARLIER ───────────────    │
│   Vite config questions        │
│                                │  ← flex-1, scrolls
│  ── ───────────────────────    │
│  ◐ Knowledge              3    │  28px · count in machine register
│  ☆ Saved                       │
│  ● Omkar                  ⋯    │  36px · avatar 18px
│ 10px                           │
└────────────────────────────────┘
```

**Design rules.**
- Rows are 28px on pointer devices — dense chrome. They become 44px below 1024px where the sidebar is
  a touch drawer.
- **Active state uses three channels**: 2px `--accent` left rail, `--surface-selected` fill, and
  `--type-ui-strong` weight. Never a filled colour block, which destroys the title's contrast and is
  the single most common generated-dashboard tell.
- Icons are 14px, `--text-tertiary`, `currentColor`, and only on non-conversation rows. Conversation
  rows have **no icon** — forty identical document glyphs is noise, and the row's position already
  says what it is.
- **No badges** except the Knowledge count, which is a real number, set in the machine register with
  no pill around it.
- Group headers are `Rule` components, sticky within the scroll container.

**Keyboard.** `↑`/`↓` move between rows, `Enter` opens, `F2` renames inline, `Delete` opens the
confirmation, `←`/`→` collapse and expand a project.

---

### SidePanel

360px, `--surface-workspace`, 1px `--border-default` left edge, no shadow. Enters with
`translateX(16px)` + opacity at `--duration-normal`. Holds comparison or sources — never both at
once; opening one closes the other, because two 360px panels leave no measure.

Below 1280px it becomes a `Sheet` from the right at 90vw. Below 768px it is full-screen with a back
control.

---

## 4. The Answer Surface

This is the product. It is specified in the most detail because everything else exists to serve it.

### 4.1 Structure

```text
                                 ┌─ user prompt: right-aligned, --surface-raised,
                                 │  5px radius, max 80% measure, --type-body,
                                 │  --space-3 inset. Distinct but quiet.
                                 ▼
                        ┌──────────────────────────────────┐
                        │ How should I handle writes that  │
                        │ span two services?               │
                        └──────────────────────────────────┘

 ▌  Distributed transactions across service boundaries are usually the
 ▌  wrong solution to a problem that is actually about ownership.
 ▌
 ▌  Before reaching for a saga, check whether the two writes belong in
 ▐  the same service. Most cross-service write coupling is a bounded
 ▌  context drawn in the wrong place [1].
 ▌
 ▌  If the boundary is genuinely correct, the options are:
 ▌
 ▌  1. Transactional outbox …
 │
 │  FOUR MODELS · THREE CONCUR · ONE DIVERGES · 3.2 s        ⧉  ↻  ⋯
 │
    ── COMPARISON ────────────────────────────────────  ▸
    ── SOURCES · 4 ───────────────────────────────────  ▸
```

- **No container on the synthesis.** No card, no border, no fill, no avatar. Typeset text on the
  canvas at 16/27 across a 68ch measure. This is the anti-chatbot decision.
- **The Provenance Rail sits in the gutter**, 20px left of the text, aligned to the synthesis block's
  full height.
- **Metadata is the machine register**, `--text-tertiary`, 12px, immediately below at `--space-3`.
- **Comparison and Sources are collapsed measure rules**, not open panels. One gesture away, never in
  the way.

### 4.2 ProvenanceRail

**Anatomy.** A 2px column, height = synthesis block height, divided into N segments separated by 1px
gaps. Live indicator (6px square) at the head while any model is in flight.

**Encoding.** Position = identity (fixed registry order). Opacity of `--border-strong` = density ramp
(100/75/50/25%). A 2px horizontal notch at a segment's midpoint = that model diverged. Segment height
∝ contribution, floored at 8px. In-flight segments render at 25% and settle on completion.

**Interaction.** The rail is a `<ul role="list">` of `<button>` segments. Hover widens the segment to
4px and shows a tooltip: `claude-sonnet-4.5 · concurs · 1.8 s`. Click or Enter expands Comparison
scrolled to that model. Tab reaches each segment; `↑`/`↓` move between them.

**Accessibility.** The rail is decorative-plus-interactive, so it is *not* the only route to the
information: the metadata line states the same facts in words (`FOUR MODELS · THREE CONCUR · ONE
DIVERGES`), and each segment carries an `aria-label` with the full sentence. In forced-colors mode
segments render as `ButtonBorder` with the notch preserved as a real gap.

**Reduced motion.** The 4px hover widen becomes an instant change; the live indicator goes static.

### 4.3 Synthesis

The default and primary experience. Rendered by `Markdown` at `--type-body` across
`--measure-answer`.

**Streaming.** Tokens append; no typewriter, no per-character animation. Deltas are coalesced on
`requestAnimationFrame` — at most one render per frame regardless of token rate — and completed
top-level blocks are memoized by index so only the tail block re-parses. Without this a 2,000-token
answer triggers 2,000 full markdown parses and the composer visibly stalls.

**Citations.** Inline `[1]` markers in the machine register, 3px radius, `--surface-raised`, tabbable,
linking to the corresponding `SourceCard`. Activating one expands Sources and focuses that card. A
citation marker never renders unless a real source backs it.

### 4.4 AgreementSummary

The metadata line. Machine register, 12px, `--text-tertiary`, tabular numerals.

```text
FOUR MODELS · THREE CONCUR · ONE DIVERGES · 3.2 s
```

Words, not a badge; a count, not a percentage. Confidence percentages are not shown, because a
synthesised "87% confident" is a number nobody measured — and inventing it would break the product's
core honesty rule.

Degenerate cases are stated plainly, never hidden:

| Situation | Copy |
|---|---|
| All agree | `FOUR MODELS · ALL CONCUR · 2.8 s` |
| Deep disagreement | `FOUR MODELS · TWO CONCUR · TWO DIVERGE · 3.4 s` |
| One model failed | `THREE OF FOUR RESPONDED · ALL CONCUR · 2.9 s` |
| Single model | `ONE MODEL · 1.4 s` — no rail, no comparison affordance |

### 4.5 Comparison

Collapsed by default behind a labelled rule. Expands via `grid-template-rows: 0fr → 1fr` at
`--duration-normal` with `--ease-expand`.

**One layout at every viewport.** Comparison expands inline beneath the
synthesis as vertically stacked `ModelResponse` panes — at 375px and at 1920px
alike. The rail gives direct access to any single model, which is the actual
task; a viewport-dependent second layout was evaluated and rejected in
[ADR-012](../decisions/ADR-012-comparison-stays-inline.md).

Panes are never side-by-side columns. Column layout is what makes an interface
read as monitoring software; stacking preserves the reading measure and the
hierarchy.

### 4.6 ModelResponse

A card — one of the six — because grouping here carries real semantics: this text has a different
author from the synthesis.

**Anatomy.** `ModelHeader` (28px: `ModelMark` 8px · model name in machine register · concurs/diverges
word · latency) → body at `--type-ui` 13/20 across `--measure-wide`.

**Surface.** `--surface-raised`, 1px `--border-default`, radius `0` — it is structure, not a control.
A diverging model's pane carries a 2px `--border-strong` left edge, echoing the rail notch.

**Deliberately quieter than the synthesis**: 13px against 16px, raised surface against canvas. The
evidence must not compete with the conclusion.

**States.** `pending` (skeleton at final height, so expanding does not grow) · `complete` ·
`failed` (inline `Alert` inside the pane, `Retry this model`, rail segment renders hollow) ·
`empty` (model returned nothing — stated, not hidden).

### 4.7 SourceList / SourceCard

Collapsed behind `── SOURCES · 4 ──`. Each card: title `--type-ui-strong`, domain and retrieval
timestamp in the machine register, 2-line snippet at `--type-micro`, index `[1]` matching the inline
marker. `--surface-raised`, 1px `--border-subtle`, radius `0`.

No favicons. No thumbnails. No coloured domain chips. A favicon row is a colour system the product
does not control.

### 4.8 MessageActions

Copy · Regenerate · Overflow (copy as markdown, view diagnostics, delete). `ghost` `IconButton`s,
14px icons, revealed at `opacity: 0 → 1` on hover or focus-within — and **always in the tab order**
regardless of opacity.

Diagnostics (Tier 5) live in the overflow menu only: request id, routing decision, per-model latency.
Present for the user who needs them, absent for everyone else.

---

## 5. Composer

The precision instrument. Not a floating pill, not a glass blob, not a card with fifteen buttons.

```text
┌──────────────────────────────────────────────────────────┐
│ Ask anything…                                            │  ← --type-body 16/27
│                                                          │
│  ⏵ report.pdf  ✕                                         │  ← AttachmentTray, conditional
│                                                          │
│  ＋   Auto ▾                                        ↑    │  ← 26px control row
└──────────────────────────────────────────────────────────┘
    Enter to send · Shift+Enter for a new line                ← --type-micro, focus only
```

**Dimensions.** Width = `--measure-answer`, aligned to the answer column **to the pixel** — asserted
by a Playwright bounding-box comparison, because that alignment is the most visible signal of craft in
the layout. Min 48px, max 216px then internal scroll. Shell inset `--space-3`, radius 5px, 1px
`--border-control` on `--surface-workspace`.

**Auto-grow** by setting `height: auto` then `scrollHeight`, clamped, inside `useLayoutEffect`. No
`ResizeObserver`, no ghost-div measurement.

**Progressive disclosure.** Only four controls are ever visible: attach, routing mode, send, and the
attachment tray when populated. Advanced controls (model pinning, temperature, system context) live
behind the routing-mode dropdown. The composer is powerful without looking complicated.

**States.**

| State | Treatment |
|---|---|
| `default` | `--border-control` |
| `focus-within` | Border `--accent` + focus ring on the shell. The textarea itself shows no ring — a ring inside a ring is noise |
| `generating` | Textarea stays **enabled and editable**; Send becomes Stop |
| `disabled` | `--surface-workspace` fill, helper text states the reason |
| `error` | Not a composer state — errors render in the message region |

**Keyboard.**

| Key | Behaviour |
|---|---|
| `Enter` | Send — only when no overlay owns focus and the value is non-empty after trim |
| `Shift+Enter` | Newline |
| `Escape` | Generating → stop. Otherwise no-op. **Never clears the input** |
| `⌘M` | Routing-mode dropdown |
| `↑` on empty | Load the last prompt for editing |
| `⌘↵` | Send even when an overlay is open |

The Enter-versus-select collision is resolved structurally: overlays portal and hold focus, and the
composer's handler checks `event.target` identity, so a listbox Enter can never reach the send path.
Asserted by E2E test.

**Mobile.** Width `100vw − 32px`, `font-size: 16px`, pinned with `env(safe-area-inset-bottom)` and
`100dvh` (never `100vh`), repositioned on `visualViewport` resize. Not `position: fixed` — it detaches
from the keyboard on iOS.

---

## 6. ModelSelector / RoutingModeSelect

**Data comes from `GET /api/models`.** The component contains no model name, no provider name, and no
hardcoded ordering. Group order derives from the availability enum.

```text
  ◦ Auto                              ✓     Best available models
  ── ─────────────────────────────────────
  ROUTING
    Single model            fastest
    Synthesis · 3 models    balanced
    Synthesis · 5 models    thorough
  ── AVAILABLE ───────────────────────────
    ◇ Claude Sonnet 4.5
      anthropic · 200k
    ▢ Gemini 2.5 Pro
      google · 1M
  ── UNAVAILABLE ─────────────────────────
    ⬡ GPT-5                            ⚠
      openai · not configured
```

Model names in the human register; provider, context window, and status in the machine register —
[S1](language.md#13-what-the-signatures-are-not) applied to a list.

**Unavailable models are listed, disabled, and annotated with the reason.** Hiding them makes the
product feel smaller and leaves the user unable to discover why a model is missing.

**Keyboard.** Full combobox/listbox semantics: `Enter`/`Space`/`↓` opens; `↑`/`↓` move active option
skipping disabled rows and group headers; `Home`/`End`; `Enter` selects and returns focus to the
trigger; `Escape` closes without selecting; `Tab` closes without selecting; a–z typeahead with a
500ms buffer.

**ARIA.** Trigger `role="combobox"` + `aria-expanded` + `aria-controls` + `aria-haspopup="listbox"`.
List `role="listbox"` + `aria-activedescendant`. Groups `role="group"` + `aria-labelledby`. Options
`role="option"` + `aria-selected` + `aria-disabled`. DOM focus stays on the trigger throughout.

**Below 768px** the list becomes a bottom `Sheet`, 48px rows, `max-height: 60dvh`.

---

## 7. Component State Matrix

Nine states. A component that cannot express one must document why; it may not silently omit it.

| Component | default | hover | active | focus | disabled | loading | error | success | selected |
|---|---|---|---|---|---|---|---|---|---|
| Button | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a¹ | n/a¹ | n/a |
| IconButton | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a¹ | ✓² | ✓³ |
| Input / Textarea | ✓ | ✓ | n/a | ✓ | ✓ | n/a⁴ | ✓ | n/a⁵ | n/a |
| Checkbox / Toggle | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | ✓ | n/a | ✓ |
| ConversationItem | ✓ | ✓ | ✓ | ✓ | n/a | ✓⁶ | ✓⁷ | n/a | ✓ |
| ModelSelector trigger | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | ✓ |
| ModelOption | ✓ | ✓ | ✓ | ✓⁸ | ✓ | n/a | n/a | n/a | ✓ |
| Composer | ✓ | n/a | n/a | ✓ | ✓ | n/a⁹ | n/a | n/a | n/a |
| SendControl | ✓ | ✓ | ✓ | ✓ | ✓ | ✓¹⁰ | n/a | n/a | n/a |
| RailSegment | ✓ | ✓ | ✓ | ✓ | n/a | ✓¹¹ | ✓¹² | n/a | ✓ |
| Synthesis | ✓ | ✓¹³ | n/a | ✓ | n/a | ✓ | ✓ | n/a | n/a |
| ModelResponse | ✓ | n/a | n/a | ✓ | n/a | ✓ | ✓ | n/a | n/a |
| SourceCard | ✓ | ✓ | ✓ | ✓ | n/a | ✓ | n/a | n/a | ✓ |
| Dialog | ✓ | n/a | n/a | ✓ | n/a | ✓ | ✓ | n/a | n/a |

¹ Result feedback belongs to the surface the action changed, not the button.
² Copy shows a 1.6s check. ³ Toggling icon buttons carry `aria-pressed`.
⁴ The form owns loading; inputs are disabled. ⁵ Green ticks on valid fields are noise; validity is
signalled by the absence of an error. ⁶ During rename commit. ⁷ Rename/delete failure — the row
reverts. ⁸ Via `aria-activedescendant`, not DOM focus. ⁹ The composer is enabled or disabled, never
loading. ¹⁰ Replaced by Stop rather than showing a spinner. ¹¹ 25% opacity while in flight.
¹² Hollow segment when that model failed. ¹³ Reveals the action row.

---

## 8. Responsive Behaviour

Four breakpoints, each marking a real layout change.

```css
--bp-sm:  640px;   /* dialogs stop being sheets            */
--bp-md:  768px;   /* inline dropdowns, 2-up suggestions    */
--bp-lg: 1024px;   /* persistent sidebar                    */
--bp-xl: 1280px;   /* side panel instead of inline expand   */
```

### 375px — the floor

| Element | Behaviour |
|---|---|
| Sidebar | Off-canvas drawer 280px, 44×44 trigger, scrim `rgb(0 0 0 / 0.5)`, body scroll locked, closes on scrim tap / Escape / navigation |
| Header | 44px: menu · truncated title · overflow |
| Answer | 16px gutters, measure = `100vw − 32px` |
| Prompt bubble | `max-width: 90%` |
| Provenance rail | **Rotates to horizontal**, sitting above the metadata line as a 2px segmented bar the width of the measure. A left gutter rail costs 22px of a 343px measure, which is not affordable |
| Comparison | `Tabs` — one model at a time |
| Sources | Full-screen sheet |
| Composer | `100vw − 32px`, 16px text, safe-area pinned, `100dvh` |
| Model selector | Full-width bottom sheet, 48px rows |
| Code blocks | Horizontal scroll, 12px mono, edge fade hint |
| Tables | `overflow-x: auto` wrapper |
| Message actions | Always visible — no hover on touch |
| Dialogs | Sheets |
| Touch targets | ≥44×44, ≥8px apart |

**Horizontal overflow is a build failure**, asserted at every breakpoint on every route including a
200-character unbroken token and a wide table.

### 390px

Identical structure; gutters 20px. No new layout — inventing one for 15px of width is arbitrary.

### 768px — tablet, not a narrow desktop

Sidebar remains a drawer (a 264px persistent sidebar leaves 504px, below the measure) but widens to
320px and overlays rather than pushes. Dropdowns become anchored rather than sheets — pointer input
is likely. Comparison expands inline as stacked panes rather than tabs. Gutters 32px.

### 1024px — compact desktop

Persistent sidebar appears: 1024 − 264 = 760px, which fits the 68ch measure with 24px gutters. Below
this the arithmetic fails, which is why the breakpoint is here and not at a round 1000. Comparison
expands inline. Drawer machinery is unmounted, not hidden.

### 1280px and above

`SidePanel` becomes available; comparison and sources open beside the answer instead of beneath it.
The measure stays 68ch — the surplus becomes margin. **There is no ultrawide mode**; at 2560px the
layout is identical to 1280px with more margin, because a 2000px line of prose is unreadable and a
third column would invent surface area the product does not need.

---

## 9. Accessibility

Target **WCAG 2.2 AA**, with AAA text contrast wherever it is free (the dark palette exceeds AAA on
primary and secondary text).

### 9.1 Structure

```html
<a class="skip-link" href="#answer">Skip to conversation</a>
<div class="app">
  <nav aria-label="Conversations and projects">…</nav>
  <main id="answer">
    <h1 class="sr-only">Saga vs. two-phase commit</h1>
    <div role="log" aria-label="Conversation" aria-live="polite" aria-atomic="false">…</div>
    <form aria-label="Message composer">…</form>
  </main>
  <aside aria-label="Model comparison">…</aside>
</div>
```

One `<h1>` per route, visually hidden where the header already shows the title. Response headings are
demoted so a model emitting `#` produces `<h2>`. Heading levels are never skipped.

### 9.2 Keyboard map

| Key | Context | Action |
|---|---|---|
| `⌘K` | global | Search |
| `⌘⇧N` | global | New conversation |
| `⌘M` | composer | Routing mode |
| `⌘⇧C` | answer | Toggle comparison |
| `⌘/` | global | Shortcut reference |
| `Enter` / `Shift+Enter` | composer | Send / newline |
| `Escape` | generating | Stop |
| `Escape` | overlay | Close, restore focus to trigger |
| `↑` | empty composer | Edit last prompt |
| `↑` `↓` | sidebar, rail, listbox | Move |
| `←` `→` | project row | Collapse / expand |
| `F2` / `Delete` | conversation row | Rename / delete |
| `Home` `End` `a–z` | listbox | Jump |

Every mouse-reachable action is keyboard-reachable. No keyboard trap: drawer, dialogs, sheets, and
listboxes all restore focus to their trigger.

### 9.3 Focus management

| Event | Focus goes to |
|---|---|
| App load | Composer |
| Answer completes | Composer |
| Conversation opened | Composer |
| Drawer / dialog / sheet opens | First focusable, or least-destructive action |
| Any overlay closes | Trigger |
| Comparison expands | First `ModelResponse` heading |
| Citation activated | The matching `SourceCard` |
| Route change | `<main>` via `tabindex="-1"` |

### 9.4 Streaming and screen readers

The hardest problem here, solved explicitly:

1. On send, a visually hidden `role="status"` announces `Generating response`.
2. During streaming the answer carries `aria-busy="true"` and is **not** a live region — announcing
   tokens as they arrive makes the product unusable with a screen reader.
3. On completion `aria-busy` flips to `false` and the status region announces the full attribution:
   `Response complete. Four models, three concur, one diverges. 3.2 seconds.` Non-visual users get
   the provenance through the same channel visual users do.
4. Per-model completion is **not** announced — four interruptions per answer is noise.
5. Errors fire `role="alert"` immediately.

### 9.5 Additional requirements

- **Contrast** — verified in [§2.2](language.md#22-dark-theme) and
  [§2.3](language.md#23-light-theme--designed-independently); asserted in CI from the token
  values, so a token edit that breaks AA fails the build.
- **Colour is never the only signal** — the rail pairs density with a notch; status pairs colour with
  an icon and a word; selection uses three channels.
- **Touch targets** ≥44×44 below 1024px, ≥8px apart.
- **Zoom** — usable at 200% and at 320px CSS width with no horizontal scroll (WCAG 1.4.10).
  `user-scalable=no` is forbidden.
- **Forced colors** — borders retained on every surface; the rail's notch survives as a real gap;
  focus uses `Highlight`.
- **Reduced motion** — [§6.4](language.md#64-reduced-motion).
- **Forms** — visible labels always; errors adjacent with `aria-describedby` + `aria-invalid`; first
  invalid field focused on failed submit.
- **Automated** — `axe-core` on every route × theme × state in Playwright; serious and critical fail
  the build. Treated as a floor: the keyboard map is verified manually each phase.

---

## 10. Engineering Rules

- **No component references a raw value.** Colour, radius, spacing, and duration come from tokens.
  Stylelint enforces it; Tailwind arbitrary values (`bg-[#1F1D1B]`, `p-[13px]`) are lint errors.
- **No barrel files.** Import the concrete module. Barrels break tree-shaking and create cycles.
- **File ceiling 250 lines, component ceiling 150.** Over is a review trigger, not a lint rule.
- **No `dangerouslySetInnerHTML` anywhere**, enforced by lint. Markdown renders to a React tree; raw
  HTML in model output is not parsed and renders as literal text.
- **Props destructured in the signature with an explicit type.** No configuration objects.
- **Stable keys** — server ids, never array indices.
- **No `useEffect` for derived state.** Effects are for subscriptions, measurement, and focus.
- **No animation library, no component library, no icon package beyond tree-shaken per-icon imports.**
  The twelve motions are CSS.
- Banned component names: `ReusableCard`, `GenericWrapper`, `BaseComponent`, `CommonLayout`,
  `ItemRenderer`, anything prefixed `I` or suffixed `Manager`.
