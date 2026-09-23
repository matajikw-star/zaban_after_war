# 03 — Review screen

Status: resolved
Type: task
Phase: 3
Blocked by: 01

## Goal

`/review` per `docs/spec/what.md` §7.8: the card front (word, exam badge), tap to reveal, the
back (translations, one sentence — the exam stem for answer-words else the authored example;
«بیشتر» expands definition, other senses, confusables, exam history; the **hint disclosure**
«راهنمای یادگیری» collapsed by default, showing «راهنمای این کلمه به‌زودی اضافه می‌شود» when
`hint` is null), the two grading buttons (green «بلد بودم», red «بلد نبودم» — the only colour
in the app), overflow with «این را بلدم» (know) and «این کلمه اشکال دارد» (flag sheet, 3
reasons → outbox `flag`), feedback after grading (box change + «دفعهٔ بعد: …»), goal-reached
sheet (non-blocking), paywall trigger when `presentationsBeforePaywall` reaches
`freePresentationLimit` and the entitlement is `none` → `/paywall` (placeholder screen until
Phase 5, with «بعداً» back to review), `/session/summary` on leaving.

Every presentation: `nextCard` from the engine adapter → event appended via `repo` → re-fold →
next card. No network anywhere in this loop.

## Done when

Unit tests for the card-content selection (which sentence, which sense first, homograph note)
and the paywall counter; a Playwright spec: onboarding → 10 reviews (grade alternately) → the
box feedback appears → reload → the same words are in the boxes. `what.md` review row `live`.

## Comments

**2026-09-18 — built on `feat/web-review-screen`.**

Shape: `Review.tsx` owns the flow and nothing else. Every rule it needs is a pure function
somewhere it can be tested without a DOM:

- `engine/card-content.ts` — `primarySentence`, `sentenceParts`, `orderedSenses`, `examBadge`,
  `examBadgeText`, `nextDueText`, `boxLabel` (22 tests).
- `engine/paywall-counter.ts` — `countPresentation` (7 tests).
- `engine/review-beacons.ts` — `beaconsCrossed` over the §8.4 thresholds (7 tests).
- `engine/goal-sheet.ts` — `shouldShowGoalSheet` + the bound `todayKey` (5 tests).
- `engine/fold-reads.ts` — `itemBox`, `totalPresentations`; the two fold projections the loop
  reads on both sides of `recordReview`.

Screen parts: `CardFront`, `CardBack`, `GradeBar`, `Feedback`, `FlagSheet`, `GoalReachedSheet`,
`OverflowMenu`, `Toast`. `screens/paywall/Paywall.tsx` is a placeholder with the pace argument
and a real «بعداً» back to `/review`.

Decisions worth knowing (all in `how-why.md` §5.5):

- Only the **first** `.....` of a multi-blank stem is filled — 75 of 1,085 stems have two or
  more, and the card cannot know its lemma belongs in the second.
- The exam sentence is pinned: highest year, tie on `paperId` then `questionNo`, so a word never
  shows a different sentence on its next review.
- The presentation that trips the paywall shows no feedback; it navigates straight to
  `/paywall`.
- The overflow is a Radix dropdown, not a third sheet — two stacked focus traps otherwise.
- `content/types.ts` is gone: the package shapes come from `@kl/content` now, and the manifest
  half of the file moved to `content/manifest.ts`.

Verified: `pnpm lint`, `pnpm typecheck`, `pnpm test` (322 passed, 41 new), `pnpm build`,
`pnpm budget` (179.9 KB of 300 KB), `KL_E2E_CHANNEL=msedge pnpm e2e` (3 passed).
