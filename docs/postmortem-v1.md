# Post-mortem: v1 (`starting-pwa-on-zaban`)

A critical read of the previous build. It reached "working demo" and that was its job — but a
demo that becomes a product carries its mistakes forward, so each finding below names the
replacement decision. Nothing from v1 is copied into v2 without checking this list.

Read alongside the v1 `AGENTS.md`, which is an accurate description of what v1 *does* and a
genuinely good handover document.

---

## 1. It is not actually spaced repetition — severity: critical

`LeitnerProgress` is `{ currentLevel, currentSubLevel, boxes: number[][] }`. There is **no
timestamp on any word.** No due date, no interval, no review history.

`selectNextWord()` picks a box by weighted random, then a word inside it by uniform random.
So a word answered correctly can reappear ninety seconds later, and a word in box 4 that has
not been seen in three weeks has no way to become urgent. The boxes are buckets that bias a
random draw — the *spacing* in "spaced repetition", the one mechanism the product sells, is
absent. The name on the domain promises the thing the code does not do.

**Replacement:** every review is timestamped; a word is due at `lastReview + interval(box)`;
the queue is due-first. → `docs/adr/0003-leitner-with-real-intervals.md`

## 2. Advancing a level erases all prior review history — severity: critical

`useLeitnerSystem.advance()`, on level completion:

```ts
newBoxes = Array.from({ length: LEITNER_BOX_COUNT }, () => []);
```

Every word from levels 1..n is dropped out of the boxes and is **never scheduled again**. A user
who finishes level 1 stops reviewing those ~380 words permanently, right at the point where
long-term retention would need them. The app teaches forgetting.

**Replacement:** one lifelong deck. Words are introduced over time; nothing is ever evicted.

## 3. Progress is one JSON blob, so multi-device sync silently destroys data — severity: critical

`user_progress.progress_data` is the whole state as one `jsonb` value, upserted wholesale.
Conflict resolution is `resolveDataSource()`, which guesses with heuristics like:

```ts
// isProgressInitial
return p.currentLevel === 1 && p.currentSubLevel === 1 && wordsInAdvancedBoxes < 5;
```

"Fewer than 5 words in advanced boxes means this is probably a fresh install" is not a merge
strategy. Study on a phone, then a laptop, and whichever writes last wins — the other session's
work is gone, with no error and no way to recover it.

**Replacement:** append-only review events, merged by union of ids. Merging becomes commutative
and lossless, offline stops being a special case, and a fold is replayable — which also buys
per-word history, retention stats, and the option to swap schedulers later.
→ `docs/adr/0002-review-event-log.md`

## 4. Word identity is array position, so the content can never grow — severity: critical

Ids are `1..2668`, and the curriculum is built by slicing that array: `allWords.slice(start, end)`.
Insert one new word at position 40 and every user's level boundaries shift under them. This is
fatal for *this specific product*, whose whole plan is to add a new exam every year.

**Replacement:** stable lemma slugs, frozen at first ingest. → `CLAUDE.md` → "Word ids".

## 5. The paid content ships to everyone — severity: high

`data/words.ts` (1.6 MB) and `data/hints.ts` (413 KB) are `import`ed into the bundle. Any visitor
can open devtools and read all 2668 words and every hint. The paywall gates the *UI*, not the
*content*.

Then `useSecurityCheck.ts` **bans** — sets `is_banned = true` — any non-premium account whose
progress exceeds the free tier. That is client-reported state deciding an irreversible punishment:
trivially forged by anyone who wanted the content (they already have it in the bundle), while a
genuine sync race can lock out a paying customer. It punishes honest users and inconveniences
nobody else.

**Replacement:** content is fetched in entitlement-gated chunks and cached; banning is deleted
outright. → `docs/adr/0004-server-side-entitlement.md`

## 6. Runtime CDN dependencies break both the offline promise and Iranian access — severity: high

`index.html` carries an import map pointing React, Supabase and friends at `aistudiocdn.com` and
`jsdelivr`, Tailwind loads from `cdn.tailwindcss.com`, and heroicons come from `unpkg.com` as
runtime ESM. Three consequences, all bad:

- An "offline-first PWA" whose first paint needs four foreign hosts is not offline-first.
- Those hosts are exactly the ones filtering and sanctions reach for. The target audience is the
  audience most likely to see a blank page.
- Any of them can change or vanish and the deployed app breaks with no redeploy.

**Replacement:** everything is a build-time dependency, bundled and self-hosted, fonts included.
→ `docs/adr/0005-no-runtime-cdn.md`

## 7. The backend was on infrastructure that deletes itself — severity: high, already realised

Supabase free projects pause after ~7 days idle and are eventually removed. That is documented
behaviour, not bad luck — and it took every user account and all progress with it. Sanctions and
filtering made it the wrong choice for Iranian users regardless.

**Replacement:** self-hosted PocketBase on an Iranian VPS, with backups the owner controls.
→ `docs/adr/0001-backend-pocketbase-on-iranian-vps.md`

## 8. Smaller, still worth fixing

| Finding | Where | Fix |
|---|---|---|
| Supabase URL + anon key hardcoded | `backend/supabase.ts` | env vars, `.env.example` |
| Day boundary uses `toISOString()` (UTC) — streaks break at 03:30 Tehran | `syncHelpers.ts:getTodayString` | Tehran-local day boundary; Jalali dates in UI |
| Zero tests, on a codebase whose core is a scheduling algorithm | everywhere | pure `packages/core`, exhaustively unit-tested |
| Hand-rolled `sw.js` | `sw.js` | `vite-plugin-pwa` + Workbox |
| Empty stub files that look implemented | `usePasswordRecovery.ts`, `usePremiumStatus.ts`, `ResetPassword.tsx` | ship or delete |
| "Premium" granted by a button that flips a boolean | `useUserProfile.ts` | Zarinpal with server-side verification |
| Deploy by FTP with password in CI | `.github/workflows` | SSH key + rsync |
| `manifest.json` hardwired to `leitner.parspack.net` | `manifest.json` | build-time origin |

## What v1 got right — keep these

- The **Leitner box metaphor** as UI. It is legible to students and matches the brand.
- **Offline-first with the server as backup**, not as a hard dependency for study.
- **The hint format** (`قالب / تداعی / جمله کمکی`). It is a strong, consistent template.
- **The content itself** — 2668 words with translations, synonyms, examples and mnemonics is
  real work. It is unusable for legal reasons, but it is proof the format works and a
  high-quality reference for what the re-extracted lexicon should look like.
- **Maintaining an `AGENTS.md`.** That instinct is the reason this project has any usable
  history, and it is what `CLAUDE.md` now formalises.

## The scheduler, read closely

Finding #1 above summarises `selectNextWord` as "weighted random over boxes". That is accurate but
incomplete, and the omission matters because the owner's instinct that there was "a relatively
mature idea" in there is **correct**. Read in full (`hooks/useLeitnerSystem.ts:85-116`), the
algorithm is: *weighted random over the four reviewable boxes, with a thin-box exclusion rule,
then uniform random within the box, over a frequency-ordered cumulative slice.* Four parts of that
are worth carrying into v2; three are defects that must not be.

### Worth carrying forward

1. **The curriculum ordering is the strongest idea in v1, and it lives in the data, not the code.**
   `data/words.ts` is hand-ordered by exam importance, and every level is a `slice()` of it, so the
   scheduler inherits a frequency-first curriculum for free. v2 reproduces this properly through
   `stats.priority` — but note that v1 got the *benefit* without anything in the algorithm knowing
   about frequency at all.
2. **`BOX_SELECTION_THRESHOLD = 10` is a real anti-repetition heuristic** (`:97-98`): any box
   holding fewer than ten in-scope words is excluded from selection. The insight is sound —
   sampling uniformly from a two-word box shows those two words back to back forever — and it is
   the one place in the file where someone reasoned about the *experience* of the sampler rather
   than its distribution. It is coarse (it acts on boxes, not words) and it disables itself in
   exactly the endgame case where repetition is worst, but it is the seed of a proper
   recently-seen suppression window.
3. **The sub-level gate is a mastery *ratio* over a *cumulative* scope** — 50% of everything
   introduced so far in the level must sit in the top two boxes (`:76-83`). Three intended
   consequences: progress survives across days, you cannot advance by grinding only the new words
   because the old ones are in the denominator, and 50%-not-100% deliberately lets the hard tail
   roll forward instead of blocking. That is considered pacing, not an accident.
4. **`remainingDaysForLevel` is a genuine pacing model** (`:51-67`): it converts the live box
   histogram into remaining box-steps and divides by the daily goal, which is derived in the same
   unit so the two are dimensionally consistent. It is optimistic — it assumes no future errors, so
   the estimate stalls on bad days — but it is a real model rather than a decorative progress bar.

### The break modal — v1's only spacing mechanism, and it is good

`components/LearningSession.tsx:230-259` fires a two-stage modal when the daily goal is met. Stage
one congratulates and offers to stop or continue; stage two actively argues for stopping —
«برای این که لغات به حافظه بلند‌مدت منتقل بشن، بهتره بین جلسات یادگیری، فاصله باشه … ولی انتخاب با
شماست» — and then extends the goal if the user insists. It is worth recognising what this is: in
v1 the *only* spacing in the entire product was a persuasive UI nudge, because the scheduler had
no intervals. In v2 the scheduler does the spacing, which frees this modal to be what it always
should have been — encouragement plus an honest suggestion, never a gate.

### Defects not to carry forward

- **Box weights are not normalised by box population.** The weights are `(4-i)²+1` → 17/10/5/2 per
  *box* (`:104-111`), so with 55 words in box 0 and 10 in box 3, each individual box-0 word is
  drawn at 0.9% and each box-3 word at 0.59% — a 1.5:1 per-word gradient where 8.5:1 was intended,
  drifting as the histogram changes. The tuning knob did not do what its author believed.
  **v2 rule: weight per word, never per box.**
- **The box wipe on level advance** (`:201`) — already finding #2, and still the most serious
  defect in the engine.
- **The streak counts app-opens, not study days.** `performDailyReset` (`utils/syncHelpers.ts:94-119`)
  runs on load, unconditionally stamps `lastSessionDate = today` and increments the streak, which
  makes the `recordSuccessfulAction` path dead for the rest of that day. Opening the app for one
  second daily yields an unbroken streak with zero words reviewed. Compounding it, both paths use
  `toISOString()`, so the day boundary is 03:30 Tehran time.

### v1's tuned numbers, for reference

2668 words; 5 boxes (index 4 terminal, never re-reviewed); 4 consecutive correct answers to master,
any miss resetting to box 0; 7 levels × 7 sub-levels; 382 words per level, 55 per sub-level; daily
goal `ceil(382×4/30)` = **51 correct answers**, extended by **+26** when the user chooses to
continue; only correct answers counted toward the goal. Implied total programme ≈ 209 study days.

## Legal note

The v1 lexicon was extracted from a copyrighted book, which is why v1 was abandoned. v2's
premise is that vocabulary *tested in a public exam*, extracted from the exam papers, with
translations and mnemonics written fresh, is a different and defensible asset. That premise is
worth confirming with someone qualified before launch — it is the foundation of the business,
not a detail.
