# 06 — Design pass

Status: resolved
Type: task
Phase: 3
Blocked by: 02, 03, 04, 05

## Goal

Apply ADR-0020 consistently to every screen: glass cards, 24 px radius, hairline borders,
Sonnat type scale, monochrome, light and dark themes, 44 px targets, one primary action per
screen, motion 150–250 ms with reduced-motion respected. Fix every place where a Persian
string sits outside `strings.ts`. Review each screen at 360 px and 430 px widths in both themes
(Playwright screenshots committed under `apps/web/e2e/__screenshots__/` are acceptable as the
record). The review card gets the most attention: it is the product.

## Done when

Screenshots of every screen in both themes exist; no colour outside the neutral scale except
the two grading buttons and destructive confirmations; `what.md` §7.9 says `live`.

## Comments

### 2026-09-24 — done (branch `feat/design-pass`)

**The bug the screenshots found first.** Every primary button rendered its label invisible:
`tailwind-merge` read `text-h6` / `text-body` as text *colours* and dropped the earlier
`text-[var(--bg)]`, so the label came out in the foreground colour on a foreground-coloured
pill. `ui/cn.ts` now declares the Sonnat scale as the `font-size` group; `ui/cn.test.ts`
pins it. This had shipped on Home («شروع مرور»), onboarding «بعدی», paywall, login and
summary.

**Tokens and primitives.** Light glass had a white hairline that vanished on the light ground;
dark glass was black-on-near-black mud. Retuned both, and added `--bg-muted`,
`--glass-bg-strong`, `--overlay`, `--bg-glow` in `:root` and both dark blocks. The glass is now
two Tailwind `@utility`s (`glass`, `glass-strong`) used by Card, Chip, Tabs, Sheet, Dialog, the
overflow menu, the bottom nav and the grade bar. New primitives: `ui/Segmented.tsx` (one choice
among a few, as one pill) and `ui/Select.tsx` (native picker, chevron on the inline end).
Secondary/ghost hover used `neutral-100` in dark mode too (light-grey flash under light text);
now `--bg-muted`. `--success` moved from green-600 to green-700 so white text on «بلد بودم»
clears 4.5:1 (green-600 was ~3.3:1).

**Enforcement.** `apps/web/src/design-rules.test.ts` (runs in `pnpm test`): Persian outside
`strings.ts`, palette colours other than `neutral` / arbitrary colours in classes, and
`--success`/`--danger`/`variant="success|danger"` outside the allowlist. Allowlist:
- Persian: `strings.ts` (the home of copy); `ui/format.ts` — the «٪» sign is number formatting,
  the same job Intl does for the digits.
- Accent: `ui/Button.tsx` (defines the variants); `screens/review/GradeBar.tsx` (the two grading
  buttons). No destructive confirmation exists yet, so none is allowlisted.
Moved into `strings.ts`: the Persian list separator «، » (`strings.format.listSeparator`, used
by `engine/card-content.ts`, the card back and word detail) and every relative-time phrase
(`strings.relativeTime`). The other files the brief listed (`db/dexie.ts`, `PlacementStep`,
`Slides`, `steps.ts`, `Review.tsx`, `sync/download.ts`) only had Persian in comments.

**Per screen** (PNGs in `apps/web/e2e/__screenshots__/`, 22 shots × 360/430 × light/dark = 88):
- *Review front* — word sized to the widest type step that fits one line at 360 px (≤9 letters
  h2, ≤14 h3, else h4), `dir="ltr" lang="en"`, exam badge under it, «برای دیدن معنی لمس کنید» at
  the card foot. Header is a 3-column grid (real chevron back on the right, centred title,
  ⋯ and «پایان» on the left).
- *Review back* — word (h4) then translations (h5) then badge; the sentence on a `--bg-muted`
  inset panel; «بیشتر» and «راهنمای یادگیری» under a hairline, both collapsed by default
  (the shot opens both). Latin runs isolated with `bdi`/`dir="ltr"` + `lang="en"`.
- *Grade bar* — unchanged geometry (fixed bottom, equal width, 56 px), now the `glass` utility.
- *Feedback* — sits inside the same glass card frame, so the screen no longer jumps between card
  and feedback; box change shown as two pills, outline → solid.
- *Flag sheet* — `glass-strong`, capped at 430 px wide and centred.
- *Home* — goal ring (168 px, label h3) and streak + progress bar on glass cards; the one primary
  «شروع مرور» moved to the bottom, above the nav, where the thumb is; backup dot in the header.
- *Bottom nav* — active tab gets a filled pill behind its icon (shape, not colour).
- *Boxes* — box tiles on glass, labels no longer wrap at 360 px, `aria-pressed` on the chosen box.
- *Progress* — chart bars rounded; days with reviews are `--fg-muted`, today `--fg`, empty days
  `--border` (past days were almost invisible before).
- *Settings* — minutes and theme are `Segmented` controls (the theme was three independent
  switches, which read as a multi-select); field uses `Select`.
- *Word detail* — POS + IPA as one isolated LTR line (it used to render «/ˈperələs/adj»); the
  English definition is LTR; exam years print as years (۱۴۰۲, not ۱٬۴۰۲) in an RTL line (it was
  `dir="ltr"` Persian); examples on inset panels; the disclosures and timeline grouped on a card.
- *Onboarding* — slides get position dots; the Leitner diagram no longer overlaps itself or clips
  at 360 px, reads right to left (box 1 on the right) and numbers its boxes; minutes is
  `Segmented`; step titles centred like the slides; placement's «بلدم» and the native install
  button step down to secondary so the footer's «بعدی»/«ادامه» is each step's only primary.
- *Session summary* — «ادامه» (primary, lg) stacked over «خانه» (ghost) instead of a pill and a
  12 px box side by side.
- *Login* — form on a card; errors are foreground-coloured, medium weight, with an icon, instead
  of red (colour is reserved, §7.9); the invalid input gets a heavier monochrome border.
- *Not found* — said «این صفحه در مرحلهٔ بعد ساخته می‌شود» (the placeholder copy); now says the
  address does not exist and offers «بازگشت به خانه».
- *Season, paywall* — unchanged in structure; they inherit the fixed primary and glass.

Not screenshotted: `/checkout` and `/purchase/result` (Phase 5 placeholders, online, need
payment), the login code step (needs a live OTP round trip), the goal-reached and save-progress
sheets and the install sheet (same `Sheet` primitive as the flag sheet, which is shot). Full-page
shots draw fixed bars (bottom nav, grade bar) where the first viewport ends — on the long
settings page the nav appears mid-page; that is Playwright's full-page capture, not the layout.

**Open questions for the owner** (judged, not settled):
1. Grade button order. In RTL the first button is on the right: today «بلد نبودم» (red) is
   right, «بلد بودم» (green) left. A right thumb reaches the right one more easily. Kept as is.
2. Chart direction. The 30-day chart runs left→right with today at the right edge, while the
   progress bar fills right→left. Mirroring the chart would match RTL; kept LTR (common in
   Persian apps) pending a call.
3. The dark theme's glass is a lighter-than-ground fill (`neutral-800` at 50 %). If it reads too
   flat on a real AMOLED phone, `--glass-bg` in the two dark blocks is the one knob.
4. Error text is monochrome. If a red error line is wanted, §7.9 needs to list errors next to
   destructive confirmations.

**Outside this ticket — reported, not fixed:**
- `screens/word/WordDetail.tsx`'s flag sheet enqueues `{ itemId, reason, at }` with the Persian
  *label* as `reason` and no `installId`/`appVersion`, while `/review` sends a full `FlagBody`
  with a reason code. The two flag paths disagree on the payload the server receives.
- `WordDetail` applies `BOTTOM_NAV_SPACER_CLASS` though it renders no bottom nav (harmless).

**Verification** (all exit 0):
- `pnpm lint` — Checked 288 files in 309ms. No fixes applied.
- `pnpm typecheck` — apps/web typecheck: Done
- `pnpm test` — Test Files 53 passed (53), Tests 577 passed (577)
- `pnpm build` — apps/web build: Done
- `pnpm budget` — 216.6 KB total gzipped (limit 300.0 KB), budget: ok, 83.4 KB to spare
- `KL_E2E_CHANNEL=msedge pnpm e2e` — 17 passed, 12 skipped (the screenshot spec)
- `KL_E2E_CHANNEL=msedge KL_SCREENSHOTS=1 pnpm e2e design-screens` — 12 passed
