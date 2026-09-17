# 03 — Review screen

Status: ready-for-agent
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
