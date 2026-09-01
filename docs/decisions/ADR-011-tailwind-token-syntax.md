# ADR-011 — Custom properties in Tailwind v4 utilities

Status: **Accepted** · 2026-08-19

## Context

The design system's premise is that `tokens.css` is the single source of visual
truth and components reference roles. Components did that with Tailwind
arbitrary values written in v3 syntax:

```tsx
className="max-w-[--measure-answer] px-[--gutter] duration-[--duration-instant]"
```

Tailwind v4 does not read that as a variable reference. It emits the token
**name** as the value:

```css
.max-w-\[--measure-answer\] { max-width: --measure-answer }   /* invalid */
```

Invalid declarations are dropped by the browser silently. The result: the
reading measure was never applied, every transition duration fell back to
instant, and every `z-index` resolved to `auto`. 41 declarations across 21 files
were dead. Nothing failed — typecheck, lint, tests and the build were all green,
because none of them look at whether a CSS declaration survives parsing.

## Decision

Bare custom properties in utilities use the v4 parenthesis form, which emits
`var()`:

```tsx
className="max-w-(--measure-answer) px-(--gutter) duration-(--duration-instant)"
```

## Alternatives considered

- **`max-w-[var(--measure-answer)]`.** Also correct and more explicit, but
  noisier at every call site.
- **Named theme keys for layout tokens** (`--spacing-gutter` in `@theme`) so
  `px-gutter` works. Cleaner to read, but it moves layout values into the
  Tailwind namespace and away from the plain custom properties that the theme
  switch and the token contrast test both depend on.

## Consequences

- The token layer works as designed; 66 distinct tokens now resolve through
  `var()` in the built stylesheet.
- **The gap this exposed is the real lesson:** the entire toolchain can be green
  while the design system is inert.

## Validation (added 2026-08-19)

`frontend/scripts/check-built-css.mjs` runs as the last step of `pnpm build`. It
parses the emitted stylesheet with postcss — a real parser over the real build
output, not a regex over source text — and fails on any of:

1. **A standard property whose value is a bare `--token` name.** This is exactly
   the original defect. A bare custom-property name is never a valid value for a
   standard property, so the rule has no false positives. Token *definitions*
   (`--x: --y`) are exempt, since a custom property may legitimately hold
   anything.
2. **A `var(--x)` with no fallback whose token is never defined.** Catches a
   renamed or deleted token leaving a declaration resolving to nothing.
   References carrying a fallback — `var(--x, normal)` — are ignored, because
   they resolve either way; Tailwind's own internals depend on this.
3. **A missing critical utility.** Five declarations must be present by exact
   text, including `max-width:var(--measure-answer)`. Catches the case where a
   class stops being emitted at all.

lightningcss was tried first and rejected: it parses `max-width: --measure-answer`
without complaint, so a parser alone is not sufficient. The discriminating rule
is structural, applied to parsed declarations.

**The check was verified by reintroducing the bug.** Reverting one component to
`px-[--gutter]` and rebuilding fails with:

```text
  1 declaration(s) use a bare token name as a value.
    padding-inline: --gutter   (in .px-\[--gutter\])
```

One trap worth recording: the failure message originally contained a
class-shaped literal, which Tailwind scanned out of the script and compiled into
a real utility — the checker generated the defect it was looking for. The
message is now worded to avoid class-shaped text.
