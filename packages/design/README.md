# @kl/design

Design tokens, the self-hosted Persian face, and nothing else. No JavaScript, no components —
components live in `apps/web/src/ui/` as copied shadcn/ui primitives (ADR-0020, `what.md` §7.9).

- `tokens.css` — CSS variables on `:root` and `[data-theme="dark"]`. Tailwind v4 reads them
  through an `@theme` block in each app's entry stylesheet.
- `fonts.css` — three `@font-face` blocks for Vazirmatn 400/500/700.
- `fonts/` — Vazirmatn v33.003 woff2 files plus `OFL.txt`. Committed on purpose: the users are
  behind filtering and the app must run offline (ADR-0005).

Swapping in a licensed IRANSans later is one edit to `fonts.css` and three files here.
