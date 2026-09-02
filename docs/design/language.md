# NexusAI Design Language

Status: **CURRENT (v2.0)** · Updated 2026-08-19

> **Supersedes** the previous version of this document. That version specified a competent but
> generic restrained-minimal system (Swiss grid, cool graphite, cobalt accent, Geist). It satisfied
> "don't look like an AI product" but failed the harder test: *if you removed the logo, you could not
> tell it was NexusAI.* This version builds an identity, not just a set of good defaults.
>
> Scope: this document reflects the **full-vision product** — multi-model synthesis, comparison,
> provenance, knowledge, and projects. See [Scope revision](#scope-note).

---

## 0. Design Audit

There is no frontend code. The audit target is therefore the previously specified system, reviewed
against the identity requirement.

### 0.1 What the previous system got right — kept

| Decision | Why it survives |
|---|---|
| Two-layer token architecture (primitive → semantic), no component-token layer | Correct at this scale; a third layer is unmaintained aliasing |
| Assistant response has no container — typeset text, not a card | The single most important anti-chatbot decision in the product |
| Content measure capped, never full-viewport prose | Non-negotiable for long-form reading |
| Inverted-neutral primary button after the blue fill measured 3.23:1 | Both higher contrast and more restrained |
| Focus ring: 2px accent + 2px spacer, `:focus-visible` only, never removed | Correct mechanism |
| Eleven-animation inventory, CSS only, no animation library | Right constraint, right size |
| Colour never the sole signal — every status carries text or geometry | Kept and extended |
| Nine-state matrix required per interactive component | Kept |
| `prefers-reduced-motion` handled per-component, not just globally | Kept |

### 0.2 What was wrong — changed

| Problem | Evidence | Change |
|---|---|---|
| **No identity.** Cool graphite + cobalt + Inter-class grotesque is the default of every serious tool built since 2020 | Remove the logo and it is unattributable | Warm graphite foundation, verdigris accent, two typographic registers |
| **Geist typeface** | Geist is Vercel's typeface; the brief forbids copying Vercel, and using their face is the most literal form of it | Instrument Sans + IBM Plex Mono |
| **Cobalt accent** | Blue is the default AI accent; it was chosen because it is safe, not because it means anything | Verdigris — cool accent against a warm field, which is the inverse of the convention |
| **Radius was uniform and semantically empty** | 6/8/10px applied by size of thing, not by nature of thing | Radius now encodes interactivity: structure is square, controls are rounded |
| **Metadata differed from content only by size and grey** | Tier 3 and Tier 4 information were visually adjacent | Machine register — metadata is a different typeface, permanently |
| **Dividers spanned the full viewport** | Made the page read as stacked bands, i.e. cards without borders | Measure rules: dividers align to the content column and carry their label inline |
| **No provenance language at all** | The prior spec routed to one model, so none was needed | Provenance Rail — the defining component of the new scope |
| **Elevation had three shadows** | `--shadow-drawer` was a shadow doing a border's job | Two shadows. Drawer separation is a border plus a scrim |
| **Empty state was centred wordmark + four suggestion buttons** | Decorative; the wordmark communicates nothing the sidebar hasn't already said | Task-first empty state, no logo, no illustration |

### 0.3 Debt deliberately not carried forward

The prior spec's `--content-width-wide` break-out for code blocks, the sidebar drag-resize, and the
`--space-24` token (defined, never used) are removed. A token nothing consumes is drift waiting to
start.

---

## 1. Concept and Signature

### 1.1 The concept — Intelligent Workspace

NexusAI is where several intelligences are reconciled into one answer. The interface's job is to make
that reconciliation legible without making it the subject. The user should see the answer; the
evidence should be one gesture away, never in the way.

Four operating rules, in priority order:

```text
Signal    over  decoration
Hierarchy over  ornament
Content   over  chrome
Meaning   over  motion
```

The fifth rule governs the other four: **precision over novelty.** Where a choice is a coin-flip
between distinctive and legible, legible wins — an identity built on illegibility is a costume.

### 1.2 The five signatures

These are what make NexusAI recognisable with the logo removed. Each is functional first; the
identity is a by-product of solving a real problem in a specific way.

---

**S1 · Two typographic registers**

Every glyph on screen belongs to one of two registers, and the register is semantic, not decorative.

| Register | Typeface | Carries | Never carries |
|---|---|---|---|
| **Human** | Instrument Sans | Anything a person wrote or a model wrote: prompts, answers, titles, labels, prose, button text | Machine-generated facts |
| **Machine** | IBM Plex Mono | Anything the system measured or assigned: model names, latency, token counts, agreement counts, timestamps, citation indices, status words, keyboard hints, section labels on rules | Prose of any kind |

The consequence: **metadata is never mistaken for content, at any size, at any distance, in any
theme** — because it is a different shape, not merely a lighter grey. This does most of the work of
[§9 Information Hierarchy](#9-information-hierarchy) for free, and it is instantly recognisable.

Discipline: the machine register is small (11–13px), tracked `+0.02em`, and never bold. It is a
notation, not a voice. If mono appears at 15px in a paragraph, the rule has been broken.

---

**S2 · The Provenance Rail**

The product's defining component. A vertical rail at the left edge of the content measure, aligned to
the synthesis block, divided into one segment per contributing model.

```text
 ▌  Distributed transactions across service boundaries are usually
 ▌  the wrong solution to a problem that is really about ownership.
 ▐
 ▌  Before reaching for a saga, check whether the two writes belong
 ▌  in the same service …
 │
 │  FOUR MODELS · THREE CONCUR · ONE DIVERGES          ← machine register
```

Encoding rules:

- **Position, not colour, identifies a model.** Segment order is fixed for the life of a conversation
  (registry `rank` order). The third segment is always the third model. Users learn positions the way
  they learn the order of tabs.
- **Density, not hue, distinguishes segments.** Segment fills are drawn from a four-step neutral
  density ramp — solid, 75%, 50%, 25% opacity of `--border-strong`. No vendor colour is used
  anywhere in the product ([§2.6](#26-model-identity-is-never-vendor-colour)).
- **Divergence is a notch.** A model whose response materially differs renders its segment with a
  2px horizontal gap at its midpoint. Concurrence is the unbroken state; disagreement is the
  interruption. This reads correctly in greyscale, at 200% zoom, and in forced-colors mode.
- **Contribution is length.** Segment height is proportional to that model's contribution to the
  synthesis, floored at 8px so a minor contributor is still visible and still clickable.
- **The rail is the control.** Clicking or pressing Enter on any segment expands comparison scrolled
  to that model. The rail is not an illustration of a control located elsewhere.

The rail is `2px` wide. Not 4, not 6. At 2px it is a margin annotation; at 4px it becomes a coloured
block on the left of a card, which is the pattern every generated dashboard uses.

---

**S3 · Radius encodes interactivity**

A single rule replaces a scale of arbitrary values:

> **Square means structure. Rounded means you can touch it.**

| Radius | Applies to | Rationale |
|---|---|---|
| `0` | Panels, sidebar, rails, dividers, table cells, message regions, synthesis block, code block body | These are architecture. Architecture is orthogonal |
| `3px` | Chips, badges, citation markers, inline code, keyboard hints | Small marks; 3px reads as "considered", 0 reads as harsh at this size |
| `5px` | Buttons, inputs, select, menu rows, checkbox, conversation rows | Controls |
| `8px` | Overlays only — dialog, dropdown, popover, sheet, toast | Detached from the grid, so their edges are their own |
| `full` | Avatar, toggle knob, live indicator | Genuinely circular objects |

**Ceiling is 8px.** Nothing in NexusAI is 12, 16, 20, or 24px round. That ceiling alone removes the
single strongest visual cue of the generated-AI-interface look, and it makes the workspace read as
architectural rather than soft.

The odd numbers (3, 5) are deliberate. 4 and 8 are what every system uses because they are grid
multiples, but radius is not spacing and does not need to be on the grid. 5px on a 32px control is
optically the point at which a corner reads as intentionally softened rather than accidentally
rounded.

---

**S4 · Labelled measure rules**

Dividers never span the viewport. They span **the content measure**, and where a divider introduces a
section it carries its label inline, sitting on the rule, in the machine register.

```text
  ── SOURCES ─────────────────────────────────────────────
  ── COMPARISON ──────────────────────────────────────────
  ── EARLIER TODAY ───────────────────────────────────────
```

The label sits flush left with `--space-2` of clear space either side; the rule resumes and runs to
the measure's right edge. `1px`, `--border-subtle`. Label is 11px mono, `+0.08em`, uppercase,
`--text-tertiary`.

Why this and not a heading above a full-bleed line: a full-bleed rule cuts the page into bands, and
bands are cards without borders. A measure-width rule with an inline label reads as a technical
document annotation — it organises without segmenting. It also means the gutter stays clear, which is
what keeps the Provenance Rail legible.

---

**S5 · Warm foundation, cool signal**

Every serious tool of the last five years is built on cool blue-grey with a warm or violet accent.
NexusAI inverts it: **warm graphite surfaces, a single cool verdigris accent.**

This is the highest-leverage identity decision in the document, because surfaces are ~95% of the
pixels. A user does not consciously notice that the background is warm; they notice that the product
does not look like the other ones.

---

### 1.3 What the signatures are not

They are not applied everywhere. The rail appears only on synthesised answers. Measure rules appear
where a section genuinely begins. The registers are a rule, not a flourish. A signature applied
universally becomes a texture, and texture is decoration.

---

## 2. Colour

### 2.1 Philosophy

1. **The foundation is neutral and warm.** Hue ≈ 35–45°, chroma near-zero. Warm neutrals at low
   chroma read as paper and graphite; cool neutrals read as screen and metal. The former is calmer
   for eight-hour use and is the differentiator.
2. **One accent family. One.** Verdigris. It means: focus, active, live, selected, provenance,
   link. Six meanings, one hue — and all six are "the system is paying attention to this."
3. **The accent is never a surface.** No accent-filled panels, no accent headers, no accent buttons
   in the resting state. It appears as 2px rails, 1px borders, small marks, and text. If you can
   measure an accent area in square centimetres, it is wrong.
4. **Status colours are not the accent and never overlap it.** Success is a yellow-green ~90°,
   warning amber ~40°, danger a warm brick ~10°. The accent sits at ~175°, more than 80° from the
   nearest status hue.
5. **No gradient anywhere.** Not on surfaces, borders, text, buttons, or scrims. There is no case in
   this product where a gradient carries information.
6. **No coloured shadow.** Shadows are black at low alpha, always.

### 2.2 Dark theme

Dark is the primary theme and was designed first.

```css
[data-theme="dark"] {
  /* Surfaces — five levels, deliberately close together */
  --surface-canvas:    #131211;   /* the workspace floor; conversation background */
  --surface-workspace: #191817;   /* sidebar, composer shell, side panels          */
  --surface-raised:    #1F1D1B;   /* comparison panes, code blocks, table headers  */
  --surface-floating:  #262421;   /* dialog, dropdown, popover, toast              */
  --surface-hover:     #232120;
  --surface-active:    #2B2825;
  --surface-selected:  #16211F;   /* accent-tinted, 4% chroma                       */

  /* Lines */
  --border-subtle:     #242220;   /* measure rules, table lines, list separators   */
  --border-default:    #332F2B;   /* panel edges, code block frame                 */
  --border-strong:     #4A453F;   /* provenance rail base, emphasis dividers       */
  --border-control:    #787067;   /* input and control outlines — ≥3:1, WCAG 1.4.11 */

  /* Text */
  --text-primary:      #EDEAE5;
  --text-secondary:    #ABA49B;
  --text-tertiary:     #98938C;
  --text-disabled:     #6E6860;
  --text-inverse:      #131211;

  /* Accent — verdigris */
  --accent:            #5FB3A8;
  --accent-strong:     #7FC9BF;   /* hover, and text on tinted surfaces            */
  --accent-quiet:      #16211F;   /* selected-row wash                             */

  /* Status */
  --success:           #7FB356;   --success-quiet: #16200F;
  --warning:           #D9A441;   --warning-quiet: #241C0D;
  --danger:            #E8736A;   --danger-quiet:  #26140F;
}
```

**Verified contrast — dark** (computed, not estimated)

| Foreground | canvas | workspace | raised | floating | hover | Result |
|---|---|---|---|---|---|---|
| `text-primary` | 15.59 | 14.78 | 14.00 | 12.90 | 13.36 | AAA everywhere |
| `text-secondary` | 7.59 | 7.19 | 6.81 | 6.28 | 6.50 | AAA / AA |
| `text-tertiary` | 6.14 | 5.82 | 5.51 | 5.08 | 5.26 | **AA everywhere** |
| `accent` | 7.57 | 7.18 | 6.80 | 6.27 | 6.49 | AAA / AA |
| `accent-strong` | 9.81 | 9.30 | 8.81 | 8.11 | 8.40 | AAA |
| `success` | 7.56 | 7.16 | 6.79 | 6.25 | 6.48 | AAA / AA |
| `warning` | 8.32 | 7.88 | 7.47 | 6.88 | 7.13 | AAA / AA |
| `danger` | 6.32 | 5.99 | 5.67 | 5.23 | 5.41 | AA |
| `border-control` | 3.84 | 3.63 | 3.45 | 3.18 | — | ≥3:1 ✓ |
| `text-disabled` | 3.40 | 3.22 | 3.05 | 2.81 | — | exempt (1.4.3); held ≥3 on primary surfaces |

**Surface steps are intentionally tiny.** canvas→workspace is 1.055:1; workspace→raised 1.055:1;
raised→floating 1.086:1. Hierarchy in dark mode is carried by *borders and position*, with tone as
reinforcement. Larger steps produce the "stack of grey cards" look; the brief asks for subtlety and
this is the numeric expression of it.

### 2.3 Light theme — designed independently

Not an inversion. Three structural differences, each a consequence of how light behaves:

1. **The depth order flips.** In dark, chrome is *lighter* than the canvas. In light, chrome is
   *darker* than the canvas. In both cases chrome recedes and the content plane advances — which is
   the actual goal, and it requires opposite implementations.
2. **The floating layer runs out of room.** In dark, floating is the lightest surface. In light,
   raised is already near-white, so the floating layer is separated by **shadow and border, with
   only a 1.025:1 tonal step**. This is stated rather than pretended away.
3. **Status and accent hues are re-picked, not lightened.** `#5FB3A8` measures 7.57:1 on near-black
   and 1.9:1 on near-white. The light accent is an independently chosen darker verdigris.

```css
[data-theme="light"] {
  --surface-canvas:    #FBFAF8;   /* warm paper, not white                          */
  --surface-workspace: #F4F2EE;   /* sidebar and composer sit *into* the page       */
  --surface-raised:    #FDFCFA;
  --surface-floating:  #FFFFFF;
  --surface-hover:     #EDEAE4;
  --surface-active:    #E4E0D9;
  --surface-selected:  #E7F0EE;

  --border-subtle:     #E9E5DE;
  --border-default:    #DAD5CC;
  --border-strong:     #BDB6AB;
  --border-control:    #807A72;

  --text-primary:      #1A1816;
  --text-secondary:    #5B554D;
  --text-tertiary:     #696259;
  --text-disabled:     #948D86;
  --text-inverse:      #FBFAF8;

  --accent:            #206A63;
  --accent-strong:     #17544E;   /* darker than accent ⇒ contrast ≥ accent's       */
  --accent-quiet:      #E7F0EE;

  --success:           #42691D;   --success-quiet: #EEF3E6;
  --warning:           #8A6216;   --warning-quiet: #F8F1E2;
  --danger:            #B93B33;   --danger-quiet:  #FBECEA;
}
```

**Verified contrast — light**

| Foreground | canvas | workspace | raised | hover | Result |
|---|---|---|---|---|---|
| `text-primary` | 16.97 | 15.83 | 17.70 | 14.75 | AAA |
| `text-secondary` | 7.06 | 6.59 | 7.36 | 6.13 | AAA / AA |
| `text-tertiary` | 5.77 | 5.38 | 6.01 | 5.01 | **AA everywhere** |
| `accent` | 6.09 | 5.69 | 6.35 | 5.29 | AA |
| `accent-strong` | ≥6.09 by construction (darker than `accent` on a light field) | | | | AA+ |
| `success` | 6.16 | 5.75 | 6.42 | 5.35 | AA |
| `warning` | 5.24 | 4.89 | 5.47 | 4.56 | AA |
| `danger` | 5.39 | 5.03 | 5.62 | 4.68 | AA |
| `border-control` | 4.07 | 3.80 | 4.24 | 3.54 | ≥3:1 ✓ |
| `text-disabled` | 3.14 | 2.93 | 3.27 | — | exempt; held ≥3 on canvas |

### 2.4 The three fills that use colour as an area

Only three, and each is justified:

| Fill | Dark | Light | Why an area is warranted |
|---|---|---|---|
| Primary button | `--text-primary` bg, `--text-inverse` text — **15.59:1 / 17.70:1** | same relationship | Highest available contrast; keeps the accent free of commercial duty |
| Selected row | `--surface-selected` (4% accent chroma) | same | Selection must survive being scanned peripherally |
| Danger confirm | `--danger` bg, white text | `--danger` bg, white text | Destructive actions should be uncomfortable to mis-click |

Everything else that uses accent uses it as a 1–2px line, a ≤12px mark, or text.

### 2.5 Focus

```css
--focus-ring: 0 0 0 2px var(--surface-canvas), 0 0 0 4px var(--accent);
```

2px accent, offset from the element by a 2px canvas-coloured spacer so it survives against both the
control and whatever is behind it. `:focus-visible` only. Measures 7.57:1 (dark) and 6.09:1 (light) —
far above the 3:1 that WCAG 1.4.11 requires for a non-text indicator.

Forced-colors mode: `outline: 2px solid Highlight; outline-offset: 2px`, box-shadow suppressed.

**The ring is never removed.** `outline: none` without an equivalent is a stylelint error.

### 2.6 Model identity is never vendor colour

No OpenAI green, no Anthropic clay, no Google blue, no Mistral orange. Vendor colouring turns the
product into an aggregator dashboard and makes the synthesis look like a summary of other people's
work rather than NexusAI's own output.

Models are distinguished by, in order of strength:

1. **Position** — fixed order, learned once, free of any visual budget
2. **Name in the machine register** — `claude-sonnet-4.5`, mono 11px, uppercase-tracked
3. **Density** — the four-step neutral ramp on the Provenance Rail
4. **A geometric mark** — 8×8px, one per model, drawn from a fixed set of five neutral glyphs
   (`▢ ◇ ▷ ◻ ⬡`) rendered as inline SVG in `--text-tertiary`, used only in the comparison view where
   several models are adjacent and position alone is insufficient

Never colour. Never a logo. Never a favicon pulled from the provider.

---

## 3. Typography

### 3.1 The two families

```css
--font-human:   "Instrument Sans", ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif;
--font-machine: "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace;
```

**Instrument Sans** (variable, OFL, self-hosted). A neo-grotesque with genuine character in the `R`,
`G`, `a`, and `y` — enough personality to be recognisable, restrained enough to disappear in a
paragraph. Chosen explicitly *instead of* Inter (ubiquitous, characterless at this point) and *instead
of* Geist (Vercel's; using it is the most literal way to copy Vercel).

**IBM Plex Mono** (variable, OFL, self-hosted). Slightly warm, engineered rather than playful,
excellent at 11px. It is the notation face, and it never sets prose.

Both self-hosted as `woff2` with Latin subsetting, `font-display: swap`, and metric-matched fallbacks
via `size-adjust` / `ascent-override` so the swap costs no layout shift (CLS budget < 0.02).

**Two families. There is no third.** No serif — a serif/sans pairing is the reference system's
signature and reproducing it would defeat the purpose of this exercise.

### 3.2 Scale

| Token | Size / line | Weight | Tracking | Register | Use |
|---|---|---|---|---|---|
| `--type-note` | 11 / 16 | 500 | `+0.08em` | machine | Rule labels, group headers, keyboard hints, status words — uppercase |
| `--type-meta` | 12 / 18 | 400 | `+0.02em` | machine | Model names, latency, token counts, timestamps, citation indices |
| `--type-micro` | 12 / 18 | 400 | `0` | human | Helper text, validation messages, tooltip body |
| `--type-ui` | 13 / 20 | 400 | `0` | human | The interface default: buttons, rows, labels, inputs, menus |
| `--type-ui-strong` | 13 / 20 | 550 | `0` | human | Active nav row, table headers, emphasised labels |
| `--type-body` | 16 / 27 | 400 | `-0.003em` | human | **Answer and prompt text — the most important size in the product** |
| `--type-title` | 18 / 26 | 550 | `-0.01em` | human | Response `h3`, dialog titles, panel titles |
| `--type-section` | 21 / 30 | 550 | `-0.015em` | human | Response `h2` |
| `--type-display` | 25 / 34 | 550 | `-0.02em` | human | Response `h1`, auth page title. **Ceiling — nothing is larger** |

**One documented exception.** `--text-hero` (34px / 38px) exists for the public landing headline
only. The workspace ceiling stands: nothing inside `/app` exceeds `--type-display`. A marketing
headline needs presence that no in-product text does, and the exception is a token rather than an
arbitrary value so it stays inside the system — and inside the CSS validation check.

**Control heights are tokens.** `--control-sm` 26px, `--control-md` 30px, `--control-lg` 38px,
shared by `Button`, `IconButton` and the marketing `CtaLink`. They were three magic numbers repeated
across three files, which is how a landing-page call to action drifts from the product's primary
button one hover state at a time.

Three things to notice, because they are the whole strategy:

1. **Navigation is 14px.** One step above UI chrome, used by the sidebar only.
   The sidebar is read at desktop distance as a list of destinations rather than
   glanced at beside prose, and 13px titles were hard to scan. Scoped to
   `--text-nav` rather than raising `--text-ui`, which would push every control
   in the workspace up with it.

1. **Body is 16px, UI is 13px.** A 3px gap and a 7px line-height gap. Chrome recedes; the answer is
   the largest sustained text on screen by a clear margin. The prior spec used 15px body; 16px is
   chosen because full-vision answers are longer and are read, not skimmed.
2. **The weight axis is nearly flat.** 400, 500, 550, 600. `550` — available because the face is
   variable — is the workhorse for emphasis, because 600 is a visible jump at 13px and reads as
   shouting in a dense sidebar. There is no 700 except `<strong>` inside answers.
3. **Only the machine register has positive tracking.** Human text is `0` or slightly negative. This
   is what makes the two registers read as genuinely different systems rather than two fonts.

### 3.3 Measure

```css
--measure-answer: 68ch;   /* ≈ 660px at 16px Instrument Sans */
--measure-wide:   84ch;   /* comparison panes, tables         */
```

Expressed in `ch`, not px, so the measure tracks the font rather than a screen assumption. 68
characters sits in the centre of the 45–75 comfortable band, biased high because answers contain code
and tables that suffer when narrow.

**Prose is never allowed to exceed the measure at any viewport.** At 1440px and at 2560px the answer
column is the same width; the surplus becomes margin. This is the rule that stops the workspace
becoming a wall of text.

### 3.4 Answer typography

Generated content must not out-shout the application. Heading sizes are compressed relative to a
document scale, and vertical rhythm does the separating.

| Element | Token | Space before | Space after |
|---|---|---|---|
| `h1` | `--type-display` | `--space-7` 32px | `--space-3` 12px |
| `h2` | `--type-section` | `--space-6` 24px | `--space-3` 12px |
| `h3` | `--type-title` | `--space-5` 20px | `--space-2` 8px |
| `h4`–`h6` | `--type-body` 550 | `--space-4` 16px | `--space-2` 8px |
| `p` | `--type-body` | — | `--space-4` 16px |
| `ul` / `ol` | `--type-body` | `--space-3` | `--space-4` |
| `li` | | | `--space-2` between |
| `blockquote` | `--type-body`, 2px `--border-strong` left rule, `--space-4` inset | `--space-4` | `--space-4` |
| `pre` | `--type-meta` 12/18 machine | `--space-4` | `--space-4` |
| `code` inline | `0.9em` machine, `--surface-raised`, 3px radius, `1px 5px` | — | — |
| `table` | `--type-ui` | `--space-4` | `--space-4` |

`margin-block-end` only, with `:first-child { margin-block-start: 0 }` — never double margins.
`text-wrap: pretty` on headings. Hyphenation off, justification never.

`font-variant-numeric: tabular-nums` on every machine-register numeral, so latency and token counts
align down a column of stacked messages.

---

## 4. Space

### 4.1 Scale

4px base. Twelve steps. Non-linear above `--space-6` because a scale offering every integer is a set
of arbitrary numbers.

| Token | px | Primary use |
|---|---|---|
| `--space-0` | 0 | resets |
| `--space-1` | 4 | icon↔label, chip padding, rail segment gap |
| `--space-2` | 8 | control padding, row inset, list-item gap |
| `--space-3` | 12 | button padding-x, panel inset, content↔metadata |
| `--space-4` | 16 | paragraph rhythm, composer padding, mobile gutter |
| `--space-5` | 20 | `h3` lead-in, dialog padding |
| `--space-6` | 24 | desktop gutter, `h2` lead-in, form field rhythm |
| `--space-7` | 32 | message turn separation, `h1` lead-in, section breaks |
| `--space-8` | 40 | dialog vertical padding |
| `--space-10` | 56 | conversation top inset |
| `--space-12` | 72 | empty-state offset |
| `--space-16` | 96 | large-viewport top inset |

Off-grid values permitted, exhaustively: `1px` borders, `2px` focus ring and rail, `3px` and `5px`
radii, `5px` inline-code padding-x (4 crowds the glyphs, 8 makes inline code read as a block).
Nothing else. No 13, 17, 21, 27.

### 4.2 The three ratios that carry the design

Perceived quality comes from relationships, not from the scale:

1. **Related : unrelated ≈ 1 : 2.7.** Answer→metadata is 12px; turn→turn is 32px. If these converge
   the eye cannot find the seam between exchanges.
2. **Chrome density < content density.** Sidebar rows are 8px vertical; the conversation breathes at
   32px between turns. Dense chrome, spacious content — this is what makes a workspace feel like a
   workspace rather than a document viewer.
3. **Container inset ≥ inner gap.** Composer shell insets 12px; its controls sit 8px apart. Reversed,
   controls look glued to the edge.

### 4.3 Layout tokens

```css
--sidebar-width:        264px;
--panel-width:          360px;   /* comparison / sources side panel  */
--rail-width:           2px;
--rail-gutter:          20px;    /* rail → text; keeps the rail a margin annotation */
--gutter:               24px;    /* ≥1024px */
--header-height:        44px;
--composer-min-height:  48px;
--composer-max-height:  216px;   /* ≈8 lines, then internal scroll */
```

`44px` header rather than 48: the header holds one title and two controls, and every pixel of chrome
height is taken from the reading area.

---

## 5. Geometry, Borders, Elevation

### 5.1 Radius

Per [S3](#13-what-the-signatures-are-not): `0` structure · `3px` marks · `5px` controls · `8px`
overlays · `full` circular objects. Ceiling 8px. Values are tokens; a raw radius in a component is a
stylelint error.

Nesting rule: an inner control inside a container subtracts the inset. In practice the composer's
textarea is square (`0`) and only the shell carries `5px`, because a rounded box inside a rounded box
at 12px inset is optically wrong at every value.

### 5.2 Border language

Four weights of line, each with one job. All are `1px` except the rail.

| Token | Job | Never used for |
|---|---|---|
| `--border-subtle` | Measure rules, table row lines, list separators | Panel edges |
| `--border-default` | Panel edges, code-block frame, sidebar edge | Text emphasis |
| `--border-strong` | Provenance rail base, comparison pane divider, blockquote rule | Ordinary containers |
| `--border-control` | Input, select, and secondary-button outlines (≥3:1) | Non-interactive elements |

No border is wider than 1px except the 2px focus ring and the 2px Provenance Rail — and both of those
are 2px precisely so they read as *not being borders*.

No gradient borders. No glowing borders. No double borders. A border and a shadow on the same edge
appear together only on floating layers, where the border guarantees the edge survives
`prefers-reduced-transparency` and forced-colors.

### 5.3 Elevation

**Two shadows.** Both dark, both cheap, both only on genuinely detached layers.

```css
--shadow-float:  0 2px 8px -2px rgb(0 0 0 / 0.24), 0 1px 2px rgb(0 0 0 / 0.16);
--shadow-modal:  0 12px 32px -8px rgb(0 0 0 / 0.36), 0 2px 8px -4px rgb(0 0 0 / 0.20);
```

Light theme drops the alphas to `0.10 / 0.06` and `0.14 / 0.07`. A shadow tuned for a dark field looks
like grime on paper.

The drawer has **no shadow** — it is separated by a `--border-default` edge and a scrim, because a
shadow on a full-height panel is a shadow doing a border's job.

### 5.4 The separation hierarchy

Reach for these in order. Stop at the first that works.

```text
1. whitespace          ← default; costs nothing, adds nothing to the page
2. a measure rule      ← when a boundary needs naming
3. a tonal surface     ← when a region needs to read as a different plane
4. a border            ← when the region has interactive edges
5. elevation           ← only when the layer genuinely floats above the page
```

**Cards are not the default container.** A card is warranted only when grouping carries semantic
meaning that whitespace cannot — in this product that is: a comparison pane, a source card, an
attachment, an inline error. Six card instances exist in the entire application. Everything else is
whitespace and rules.

---

## 6. Motion

### 6.1 Tokens

```css
--duration-instant: 100ms;   /* hover, focus, press                    */
--duration-quick:   140ms;   /* dropdown, tooltip, chip                */
--duration-normal:  180ms;   /* dialog, expansion, toast               */
--duration-slow:    220ms;   /* drawer, sheet — longest travel         */

--ease-out:      cubic-bezier(0.2, 0, 0.15, 1);   /* enter            */
--ease-in:       cubic-bezier(0.4, 0, 1, 1);      /* exit             */
--ease-expand:   cubic-bezier(0.16, 1, 0.3, 1);   /* comparison open  */
```

Ceiling 220ms, per the brief's 100–220ms band. Exits always run at `--duration-instant` regardless of
their entrance duration: appearing should feel *placed*, dismissing should feel *immediate*.

### 6.2 The complete inventory

Twelve. A thirteenth requires a written justification against "does this communicate cause and
effect?"

| # | Motion | Property | Duration | Ease |
|---|---|---|---|---|
| 1 | Hover fill | `background-color` | 100 | out |
| 2 | Focus ring | `box-shadow` | 100 | out |
| 3 | Press fill | `background-color` | 100 | out |
| 4 | Dropdown / tooltip in | `opacity` + `translateY(-3px→0)` | 140 | out |
| 5 | Dropdown / tooltip out | `opacity` | 100 | in |
| 6 | Dialog in | `opacity` + `scale(0.985→1)` | 180 | out |
| 7 | Comparison expand | `grid-template-rows: 0fr→1fr` + `opacity` | 180 | expand |
| 8 | Side panel in | `translateX(16px→0)` + `opacity` | 180 | out |
| 9 | Drawer | `translateX(-100%→0)` | 220 | expand |
| 10 | Toast in / out | `opacity` + `translateY(6px)` | 180 / 100 | out / in |
| 11 | Live indicator | `opacity` 1↔0.35 | 1.6s `step-end` ×∞ | — |
| 12 | Skeleton | `opacity` 1↔0.55 | 1.4s alternate | out |

Only `opacity` and `transform` are animated — plus `grid-template-rows` on the comparison expansion,
which is the one case where the alternative (animating `height` to a JS-measured pixel value) is both
worse and jankier. Never `width`, `height`, `top`, `left`, or `margin`.

### 6.3 Streaming motion — deliberately quiet

The brief is specific: do not animate four model responses simultaneously in a distracting way. The
rules:

- **Only the synthesis streams visibly.** Model responses in the comparison view populate silently
  and are revealed complete. Four columns of racing text is a slot machine.
- **No typewriter effect, no per-character animation.** Tokens append. Text appearing is the signal.
- **The live indicator is a 6px square** at the head of the Provenance Rail, stepping between two
  opacities at 1.6s — slow enough to read as "working", not as a pulse demanding attention. It is a
  square, not a circle, and it does not scale or glow.
- **Provenance segments fill as models complete.** A segment is at 25% opacity while its model is in
  flight and reaches its assigned density when the model finishes. This is the only place in the
  product where a state change animates over more than 220ms, and it is not an animation — it is a
  discrete opacity change per completion event.
- **No layout shift during streaming.** The metadata row's height is reserved from the first token.

### 6.4 Reduced motion

The global block zeroes durations and `scroll-behavior`. Three components need more:

| Component | Reduced-motion behaviour |
|---|---|
| Live indicator | Static square at full opacity — the signal survives, the motion does not |
| Skeleton | Static fill |
| Comparison expand | Instant open; content still appears, no grid animation |

---

## 7. Interaction Language

### 7.1 State vocabulary

Every interactive element expresses state through **at least two** channels, never colour alone.

| State | Channels |
|---|---|
| `default` | — |
| `hover` | `--surface-hover` fill + cursor. 100ms |
| `active` | `--surface-active` fill. **No transform.** A 32px control that shrinks on press reads as a glitch |
| `focus-visible` | `--focus-ring` |
| `selected` | `--surface-selected` fill **+** a 2px `--accent` left rail **+** `--type-ui-strong` weight. Three channels, because selection must survive peripheral scanning and greyscale |
| `disabled` | `--text-disabled` + `cursor: not-allowed` + an adjacent reason (helper text or tooltip) |
| `loading` | Label held in place at 0 opacity, 13px indicator centred, width frozen, `aria-busy` |
| `error` | `--danger` + icon + text + `role="alert"` |
| `success` | `--success` + icon + text |

### 7.2 Rules

- **Hover is never the only way to reach a function.** Every hover-revealed action is in the tab
  order at all times, regardless of opacity.
- **Disabled always explains itself.** `aria-disabled` is preferred over the `disabled` attribute
  wherever the reason must remain reachable by keyboard.
- **Loading never shifts layout.** Widths freeze; skeletons match final dimensions; skeletons appear
  only after 200ms of pending state.
- **Nothing changes state in 0ms** and nothing takes longer than 100ms to acknowledge a pointer.

---

## 8. Loading, Empty, Error

### 8.1 Loading

| Context | Treatment |
|---|---|
| Conversation list, cold | 6 skeleton rows at exact final height, `--surface-hover`, 1.4s opacity pulse |
| Message history | 3 message-shaped blocks; the measure is reserved so nothing reflows |
| Model catalog | 3 skeleton rows inside the open selector |
| Answer, pre-first-token | Live indicator on the rail + a reserved 27px line. **No spinner.** |
| Comparison pane, pending | Pane renders at final height with a skeleton; the layout never grows |
| Button action | In-button indicator, frozen width |

No gradient shimmer, no rainbow placeholder, no full-screen spinner anywhere in the product. Loading
is never visually louder than the content it replaces.

### 8.2 Empty

Empty states explain what belongs in the space and offer exactly one action. No illustration, no
logo, no oversized icon.

```text
  ── NEW CONVERSATION ────────────────────────────────

  Ask a question, or paste something to analyse.

  NexusAI selects the models, reconciles their answers,
  and shows you where they disagree.

  ┌──────────────────────────────────────────────────┐
  │  Ask anything…                                   │
  └──────────────────────────────────────────────────┘
```

The composer *is* the empty state's call to action; a separate button pointing at it would be
redundant. Suggested prompts, where shown, populate the composer and focus it — they never auto-send,
because the user must be able to edit.

### 8.3 Error

**Errors render where the failure happened.** A toast for a failure with a visible location is a
design error — it detaches the problem from its context and disappears before it can be read.

| Failure | Location | Content |
|---|---|---|
| One model fails, others succeed | Inside that model's comparison pane; its rail segment renders hollow | What failed · that the synthesis is unaffected · `Retry this model` |
| All models fail | In the answer region, in place of the synthesis | What failed · `Try again` |
| Failure mid-stream | Below the retained partial text | The partial is never discarded · `Regenerate` |
| Validation | Adjacent to the field, `aria-describedby` | Specific, actionable |
| Conversation delete failed | Toast | The row is restored first |

Every error answers three questions in this order: **what failed · what was unaffected · what you can
do.** The second is the one most products omit, and it is the one that determines whether the user
trusts the rest of the screen.

---

## 9. Information Hierarchy

Five tiers. Everything on screen has exactly one. The tier determines register, size, colour, and
position — and the register does most of the work.

| Tier | Content | Register | Type | Colour |
|---|---|---|---|---|
| **1 · Task** | Composer, primary action | human | `--type-body` / `--type-ui` | `--text-primary` |
| **2 · Content** | Synthesis answer, user prompt | human | `--type-body` 16/27 | `--text-primary` |
| **3 · Support** | Model responses in comparison, sources, attachments | human | `--type-ui` 13/20 | `--text-primary` on `--surface-raised` |
| **4 · Metadata** | Model names, latency, tokens, agreement counts, timestamps | **machine** | `--type-meta` 12 | `--text-tertiary` |
| **5 · Diagnostics** | Request id, routing scores, raw error codes | **machine** | `--type-meta` 12 | `--text-tertiary`, disclosed only on demand |

The rule that keeps it honest: **Tier 4 and 5 are never in the same typeface as Tier 2.** Latency can
never be mistaken for an answer, no matter how a future contributor styles it, because the register
is structural.

Applied to a single answer:

```text
 ▌  [Tier 2]  The synthesis, 16px human, full measure
 ▌
 ▐
 │  [Tier 4]  FOUR MODELS · THREE CONCUR · ONE DIVERGES · 3.2 s     ← 12px machine, tertiary
 │  [Tier 3]  ── COMPARISON ─────────────  (collapsed)              ← measure rule, one gesture away
 │  [Tier 5]  req 01J8XQ… (revealed only from the overflow menu)
```

---

## 10. Token Architecture

### 10.1 Two layers, no third

```text
Primitive   --warm-950, --verdigris-400, --step-4
            Raw values. Referenced only by semantic tokens. Never used in a component.

Semantic    --surface-canvas, --text-tertiary, --radius-control
            Roles. The only layer a component may reference.
```

A component-token layer (`--button-bg-hover`) is deliberately not created: with ~30 components it
produces several hundred aliases to maintain in service of a theming flexibility no requirement asks
for.

### 10.2 The single source of truth

`src/styles/tokens.css` is the only file in the repository containing a colour value, a radius, a
duration, or a spacing constant. Enforced:

- **Stylelint** — raw hex, `rgb()`, `hsl()`, `px` radius, and `ms` duration are errors outside
  `tokens.css`.
- **Tailwind v4 `@theme`** — utilities are generated *from* the tokens, so `bg-surface-raised` exists
  and `bg-[#1F1D1B]` is rejected by the arbitrary-value lint rule.
- **A token-contrast test** asserts every documented pair in [§2.2](#22-dark-theme) and
  [§2.3](#23-light-theme--designed-independently) still meets its stated ratio. Editing a token to a
  value that breaks AA fails CI. This is what makes the tables above a contract rather than a claim.
- **An unused-token check** fails the build on a token no component references — the mechanism that
  prevents the scale rotting into an archive.

### 10.3 No drift

A component looks like NexusAI when moved to another page because it references roles, not values.
Page-level style overrides are forbidden; if a page needs a variant, the variant belongs to the
component and is named.

---

## 11. The Tests

### 11.1 The AI-generated-UI test

Every screen is inspected for: gradient · glow · glassmorphism · backdrop blur · rounded card as
default container · shadow on a non-floating element · radius above 8px · badge or pill used
decoratively · icon used as ornament · emoji · decorative illustration · animated background ·
vendor-coloured model chips · metric cards · centred marketing layout · type above 25px.

Any hit is removed. If removing something makes the screen clearer, it was decoration.

### 11.2 The removal test

> Strip every shadow, transition, and rounded corner. Is NexusAI still premium?

**Yes, by construction.** What remains: two typefaces in two semantic registers, a warm graphite
field, four line weights, an 8-step vertical rhythm, a controlled measure, and a segmented rail
encoding provenance in geometry. Two shadows and twelve transitions are the entire decorative budget,
and none of them carries information that the structure does not already carry.

### 11.3 The identity test

> Remove the logo. Is this NexusAI?

Yes, from any one of: the warm field with a cool accent; mono metadata beside grotesque prose; the
segmented rail in the left gutter; measure-width rules with inline labels; the absence of any corner
rounder than 8px.

### 11.4 The premium test

Quality here comes from proportion, register discipline, spacing consistency, interaction latency
under 100ms, and every edge aligning to the measure. It does not come from effects. The target
reaction is *"everything is exactly where it should be"* — not *"look how much design is here."*

---

## Scope note

This document assumes the full-vision product (synthesis, comparison, provenance, knowledge,
projects). The orchestrator, API contract, MVP exclusions, and phase plan in
[06](../backend/ai-platform.md), [07](../api/contracts.md), [10](../product/roadmap.md), and [11](../decisions/README.md)
still describe single-model routing and require the corresponding revision.
