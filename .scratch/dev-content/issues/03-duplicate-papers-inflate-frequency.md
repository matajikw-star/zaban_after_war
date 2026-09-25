# 03 — Duplicate papers in 1399 and 1400 inflate every frequency count

Status: resolved
Type: bug
Found: 2026-09-24, from the design-pass screenshot of `affluent` («۶ بار در کنکور»; the truth is 3)

## What is wrong

ADR-0007 makes the distinct English paper the unit of ingest precisely so that one question is
never counted as several occurrences. In 1399 and 1400 the routing split what is the same paper
into several paper ids, and each was transcribed separately. Question-stem overlap between
papers of the same year (normalised whitespace + case), measured 2026-09-24:

- 1399: p01~p03 13/13, p02~p06 12/15, p02~p11 13/15, p04~p05 10/12, p06~p11 12/15
- 1400: p01~p04 13/14, p01~p06 12/14, p02~p07 10/13, p02~p13 11/13, p03~p05 13/13,
  p03~p10 11/13, p03~p12 11/13, p04~p06 13/14, p05~p10 11/13, p05~p12 11/13, p07~p13 9/13,
  p10~p12 14/15
- No other year shows any overlap.

Across `content/exams/`: 1,089 questions, 920 distinct (year, stem); 169 redundant copies in
98 groups. Every word they test has `stats.timesTested`, `stats.byYear` and `stats.priority`
inflated, which feeds the card's exam badge, the progress weight (§5, `weight = timesTested`)
and which words ship first.

The non-matching remainder in each pair (e.g. 12/15) is probably the same question transcribed
with small differences, so exact-stem matching undercounts the duplication.

## Done when

- Each duplicate group is decided as one paper, recorded durably (e.g. `duplicateOf` on the
  retired paper, keeping its id — ADR-0009: ids are never reused or renamed), with the reason.
- Stats are recomputed so one question counts once; `content:lint` gains a check that fails on
  two papers of a year sharing more than a few stems.
- `content:build` is re-run; the change in shipped words and weights is reported to the owner
  (prelaunch, so no user progress is affected; word ids are unchanged).
- The root cause in routing (S1/S2 clustering) is found and written into `extraction/PIPELINE.md`
  so the next year does not repeat it.

## Comments

**2026-09-25 — resolved** on `fix/duplicate-papers`. Decision record: ADR-0021; history:
`how-why.md` §5.18; root cause: `extraction/PIPELINE.md` → "Why 1399 and 1400 split".

### The measure and its threshold

Stems normalised (lower case; `.....`, `____`, `-----`, `…` and punctuation to spaces), compared
by token-set Jaccard (`packages/content/src/duplicates.ts`, `STEM_MATCH_THRESHOLD = 0.6`). Best
match of each question against every other paper, all 58 exam files:

| best-match Jaccard | 0–.1 | .1–.2 | .2–.3 | .3–.4 | .4–.5 | .5–.6 | .6–.7 | .7–.8 | .8–.9 | .9–1 |
|---|---|---|---|---|---|---|---|---|---|---|
| same year | 1,952 | 5,306 | 111 | 6 | 2 | 3 | 2 | 6 | 8 | 483 |
| different year (negative control) | 16,701 | 36,872 | 619 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |

Different years never exceed 0.273 except one pair at 0.933 (below). The same-year 0.3–0.6 tail
is cloze passages cut at a different sentence in two transcripts; the paper-level count absorbs
it. A character edit ratio was tried and separates worse (different-year noise up to 0.535).

Decided per paper: two papers are one test when they share more than `MAX_SHARED_STEMS = 3`
stems. Observed: same-year pairs share 0 (192 pairs) or 14–15 (17 pairs), nothing between;
different-year pairs share 0 (1,443) or 1 (one pair: `arshad-1398-p04 ~ arshad-1399-p07`, the
1110 field's paper reusing one question from the year before — a real second test, left
counted). **No year other than 1399 and 1400 shows any duplication.**

### Every pair, and the groups

| pair | shared stems |
|---|---|
| 1399-p01 ~ 1399-p03 | 15/15 |
| 1399-p02 ~ 1399-p06 | 14/15 |
| 1399-p02 ~ 1399-p11 | 15/15 |
| 1399-p06 ~ 1399-p11 | 14/15 |
| 1399-p04 ~ 1399-p05 | 15/15 |
| 1400-p01 ~ 1400-p04, p01 ~ p06, p04 ~ p06 | 15/15 each |
| 1400-p02 ~ 1400-p07, p02 ~ p13, p07 ~ p13 | 15/15 each |
| 1400-p03 ~ p05, p03 ~ p10, p03 ~ p12, p05 ~ p10, p05 ~ p12, p10 ~ p12 | 15/15 each |

(14/15: 1399-p06 cut its cloze passage at a different sentence.) Kept-paper rule: most
questions → fewest `uncertain[]` (paper + questions) → most booklets → lowest id. Every
candidate had 15 questions and all but 1400-p13 (1 note) had none, so booklets decided:

| kept | retired (`duplicateOf` → kept) | booklets after S2 re-cluster |
|---|---|---|
| arshad-1399-p01 | p03 | 58 |
| arshad-1399-p02 | p06, p11 | 30 |
| arshad-1399-p04 | p05 | 22 |
| arshad-1400-p01 | p04, p06 | 57 |
| arshad-1400-p02 | p07, p13 | 33 |
| arshad-1400-p03 | p05, p10, p12 | 30 |

The 11 retired transcripts agree with their kept paper option for option on 164 of 165
questions. The one disagreement is 1400-p12 q5, «bibliographics» for «bibliographies»
(lint check 17).

### Occurrences: moved, not flagged

S6 now folds a retired paper as a second reading of the kept one: its questions are booked on
the kept paper's id, number, part and key, at most once per word per question. Flagging and
filtering was rejected because every reader would have to filter; dropping the retired
occurrences outright was rejected once measured — the two readings lemmatised some options
differently, and 12 words (8 shipping: `creative`, `delicate`, `eventual`, `sentimental`,
`mislead`, `strict`, `a-case-in-point`, `in-the-meantime`) would have fallen to zero
occurrences. `senses[].testedIn` was moved to the kept paper by
`extraction/scripts/migrate_duplicate_papers.py` (231 entries; lint rule 13 holds on every
word). S7, S8 finalize and S8 fold skip retired papers; context occurrences fell 415 → 366
(20 words). S6 and S8 fold are idempotent afterwards. 262 lexicon files changed, only in
`occurrences`, `stats` and `senses[].testedIn`; no id changed, no file deleted.

### Before / after (`pnpm content:build`)

| | before | after |
|---|---|---|
| shipped words | 893 | 893 (same set) |
| free / paid | 150 / 893 | 150 / 893 (same free set, same order) |
| Σ `timesTested`, whole lexicon | 2,586 | 2,156 (2,155 without the orphan below) |
| Σ `weight`, free / paid | 570 / 1,693 | 362 / 1,263 |
| counted questions | 1,089 | 924 |
| `free.json` / `paid.json` bytes | 309,946 / 1,392,301 | 255,731 / 1,279,635 (v 2026-09-25.1) |

**226 words** changed `timesTested`, every one of them shipping (91 in the free 150), all
downward (by 1: 82, 2: 97, 3: 39, 4: 3, 5: 5). No word moved into or out of the shipped set or
the free set: ranks are frozen. **`affluent`: 6 → 3** (1400: 4 → 1, plus 1404 and 1405;
answer 5 → 2; priority 22 → 13) — the truth the ticket named.

Top 30 by drop (ties alphabetical):

| word | before → after | | word | before → after |
|---|---|---|---|---|
| cautious | 7 → 2 | | broach | 5 → 2 |
| distinction | 8 → 3 | | confront | 6 → 3 |
| justification | 9 → 4 | | convert | 6 → 3 |
| perilous | 10 → 5 | | courageous | 4 → 1 |
| superficial | 9 → 4 | | depict | 5 → 2 |
| deplete | 7 → 3 | | derive | 9 → 6 |
| impact | 6 → 2 | | digress | 4 → 1 |
| withdraw | 11 → 7 | | drop | 4 → 1 |
| account | 4 → 1 | | economical | 5 → 2 |
| affluent | 6 → 3 | | elite | 4 → 1 |
| amalgamate | 6 → 3 | | enormous | 4 → 1 |
| anomalous | 4 → 1 | | entertainment | 4 → 1 |
| apprehensive | 6 → 3 | | evolve | 4 → 1 |
| arise | 6 → 3 | | exaggeration | 4 → 1 |
| attentive | 4 → 1 | | expectation | 4 → 1 |

### Root cause

The OCR reads `e` as `c` on some print runs (`becausc`, `applianccs`), and S2's fingerprints are
exact-token sets, so two scans of one paper scored as low as 0.33 against `THRESHOLD = 0.55`.
Fixed in `s2_cluster.py` (`fold_ocr_confusions`), measured to recover exactly one cluster per
paper in all eight routed years with no false merge; re-clustered, and no other year's row
changed. `/complete-year` now runs `content:lint` after S6, so check 15 catches whatever the
fold does not.

### For the owner

1. **Re-rank the free 150?** The frozen ranks were assigned from the inflated priorities. A
   from-scratch re-rank on today's stats would swap 41 of the free 150 (out: `account`,
   `cautious`, `impact`, `drop`, `digress`, … ; in: `benign`, `credible`, `profound`, `poignant`,
   …). There are no users yet, so it is still free to do; after launch it never is.
2. **`bibliographic`** exists only because 1400-p12 misread «bibliographies». No fold derives
   it now; it keeps a stale occurrence on the retired paper, has no senses and ships nothing.
   Lint check 18 warns until you decide (retire the id, or keep it as an unshipped orphan).
3. **`needs-owner-review` on 1399-p01, 1399-p04, 1400-p01, 1400-p03.** Each now has one to three
   independent transcripts of the same test that agree with it option for option — stronger
   corroboration than the OCR. They could be cleared on that evidence.
4. Unchanged and still blocking `content:lint`: the 12 check-1 findings of ticket 02.

**2026-09-25 — Owner decisions, carried out** on `fix/duplicate-papers-followup`.

1. **Free 150 re-ranked from the true counts.** Done the documented way: `ranks.json` emptied
   to `{}` and `pnpm content:build` re-assigned all 893 shipping ids by the builder's own rule
   (priority, `timesTested`, `firstYear` desc, id asc) — no hand ordering. Ranks are contiguous
   1–893. The paid set is the same 893 ids and no card differs except its `rank`; `free.json`
   267,352 bytes, both packages at version 2026-09-25.2. The freeze is enforced only by the
   builder (append-only) and its test, not by lint; `what.md` §6.2 now records how a full
   re-assignment is done and that it never happens after launch. No e2e or snapshot names a
   specific free word (`payment-journey.spec.ts` reads `free.json` at run time), so none changed.
   41 out / 41 in, `timesTested` before the duplicate fix → now:
   - **Out:** account (4→1), acerbity (3→1), allocate (4→2), cautious (7→2), clarify (3→1),
     concoct (3→1), concurrent (4→2), digress (4→1), drop (4→1), economical (5→2),
     exaggeration (4→1), exceed (4→2), extent (4→2), extravagant (3→1), fascinate (5→2),
     flexible (4→2), gist (3→1), impact (6→2), interpretation (3→1), interval (3→1),
     intervention (4→2), laudable (3→1), manipulate (4→2), means (3→1), momentous (3→1),
     obligation (4→2), obsolete (3→1), opponent (3→1), prosper (3→1), random (3→1),
     redundant (4→2), regret (3→1), scrutinize (4→2), spill (3→1), strive (4→2),
     successive (5→2), tangible (4→2), transient (4→2), triumph (3→1), veracity (3→1),
     vulnerable (6→3).
   - **In** (none was touched by the duplicates; 2→2 unless noted): adulation, benign,
     besmirch, casual, cede, cloying, colloquial, commitment, crack, credible, disband,
     diversity (3→3), divulge, elliptical, exert, expatriate (3→3), extrapolate, feeble, fetid,
     fickle, flummery, ground, inconsequential, invective (3→3), lassitude, maintain,
     mendacity, modesty, myopic, nullify, outcome, palpate, peregrination, perpetuate,
     poignant, profound, settle, stake, tout, treacherous, vigorous.
2. **`bibliographic` retired.** File and id kept; occurrences emptied, stats zeroed, and a new
   optional lexicon field `retired: { reason, date }` — `isShippable` refuses it, lint check 4
   accepts it only with no occurrences, S6 carries it through. The misreading is noted in
   1400-p12 q5's `uncertain[]`, which is what quiets check 17 (a disagreement on record);
   check 18 has nothing left to name.
3. **`needs-owner-review` cleared** on 1399-p01, 1399-p04, 1400-p01, 1400-p03 → `extracted`,
   via `status.py --mark … --note`, which now stores the decision, evidence and date as
   `reviewNote` on the row in `extraction/state/papers.jsonl` (S2 preserves it). Evidence,
   option for option by question number:
   - 1399-p01 ← 1399-p03 (1103-1399, S5-clean) 15/15.
   - 1399-p04 ← 1399-p05 (1104-1399) 15/15 — **weakest**: that copy was itself flagged by S5,
     so neither transcript was ever OCR-corroborated; they only corroborate each other.
   - 1400-p01 ← 1400-p04 (1125-1400, clean) 15/15, 1400-p06 (1103-1400, clean) 15/15.
   - 1400-p03 ← 1400-p10 (1142-1400, clean) 15/15, 1400-p05 (1143-1400) 15/15,
     1400-p12 (1156-1400) 14/15 (its own «bibliographics»).
   10 papers remain `needs-owner-review` (2 each in 1398, 1399, 1400, 1402, 1403).
