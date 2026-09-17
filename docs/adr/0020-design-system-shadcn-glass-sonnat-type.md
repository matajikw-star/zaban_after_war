# ADR-0020 — Design system: shadcn/ui components, liquid-glass look, Sonnat typography, monochrome

**Status:** accepted · **Date:** 2026-09-18

## Context

`what.md` §7.9 was pending the owner's choice among Geist, Linear, Apple HIG, Material 3, Sonnat
and Untitled UI. On 2026-09-18 the owner chose, with a reference screenshot of a glassmorphic
monochrome dashboard: the shadcn/ui component look with its "liquid glass" theme, Sonnat for
everything Persian (type, RTL, digits), a gray/black/white palette with light and dark themes,
and colour only on the primary grading buttons.

## Decision

- Components follow the shadcn/ui pattern (Radix primitives + Tailwind v4, code owned in
  `apps/web/src/ui/`), so there is no component library at runtime (ADR-0005).
- The visual language is translucent glass surfaces, 24 px card radius, hairline borders.
- Palette: one neutral scale + black + white; green and red appear only on «بلد بودم» /
  «بلد نبودم» and destructive confirmations.
- Typography: Sonnat's type scale (16 px base, its twelve variants). Face: Vazirmatn,
  self-hosted, because Sonnat's IRANSans is commercial. Swapping to IRANSans later is one
  `@font-face` block.
- Tokens live in `packages/design/tokens.css`; every app (`web`, `landing`, `admin`) imports the
  same file.

## Consequences

- No design decision blocks Phase 3 any more.
- Any new colour outside the neutral scale is a spec change to §7.9, not a local choice.
- A licensed Persian face can be introduced without touching components.
