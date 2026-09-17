# 02 — One word, two ids: the lemmatiser split across twin papers

Status: open
Type: bug (unrepairable by rename — see Constraint)
Found by: word-data batches 13-16, 2026-09-17

## What

**18 surface forms are each claimed by two different lexicon ids.** The same
written word, in the same repeated question, became two entries because S7's
rule-based lemmatiser resolved it one way in one paper and another way in its
twin.

The clearest case: `misleading` in question 2.

| id | paper | question | surface |
|---|---|---|---|
| `mislead` | `arshad-1399-p05` | q2, option 3 | misleading |
| `misleading` | `arshad-1399-p04` | q2, option 3 | misleading |

p04 and p05 are field-code twins sitting the same English test, so this is
**one question, counted as two words**. The user gets two cards.

All 18:

| surface | ids |
|---|---|
| `appropriation` | appropriate, appropriation |
| `concerned` | concern, concerned |
| `condescending` | condescend, condescending |
| `creatively` | creative, creatively |
| `delicately` | delicate, delicately |
| `devoted` | devote, devoted |
| `enthusiastically` | enthusiastic, enthusiastically |
| `eventually` | eventual, eventually |
| `ineptly` | inept, ineptly |
| `inflated` | inflate, inflated |
| `involved` | involve, involved |
| `misleading` | mislead, misleading |
| `selectively` | selective, selectively |
| `sentimentally` | sentimental, sentimentally |
| `sequentially` | sequential, sequentially |
| `strictly` | strict, strictly |
| `a case in point` | a-case-in-point, case |
| `in the meantime` | in-the-meantime, meantime |

Fourteen are adverb/adjective or participle/verb pairs. The last two are a
multiword phrase also captured as its head noun.

## What is NOT wrong

- **No exam slot is claimed twice.** A check of every `(paperId, questionNo,
  optionIndex)` across the lexicon found **0** collisions, so `stats` and
  `occurrences` are internally consistent and no frequency is double-counted
  within a paper.
- Both entries are legitimate English words with a real occurrence, so neither
  violates lint blocking rule 4.
- This is separate from the 121 *derivative pairs* where the exam genuinely
  tested both forms in different questions (`commit`/`commitment`,
  `attain`/`attainable`). Those are two words. These 18 are one.

## Constraint: this cannot be fixed by renaming

**Word ids are stable forever** (constitution rule 6). Deleting or merging
`misleading` into `mislead` orphans progress for anyone who has studied it. The
repair is a product decision, not a data edit. Options, in rough order of cost:

1. **Do nothing.** 18 duplicate pairs in 2,098 entries is under 1%, and both
   cards teach a real word. Cheapest, and the cards are not wrong.
2. **Alias at build time.** Keep both ids; have the chunk builder mark one as
   the canonical card and the other as a pointer, so only one enters a user's
   queue. Preserves every id and every review event.
3. **Cross-link as confusables.** What batch 14 did for `mislead`/`misleading`
   by hand — each card names the other and says which is verb and which is
   adjective. Turns the duplication into a teaching point. Does not reduce card
   count.

## Also worth fixing upstream

S7's lemmatiser should be deterministic across twin papers regardless of which
is processed first. That does not repair the 18 already minted, but it stops the
19th when 1406 is ingested.
