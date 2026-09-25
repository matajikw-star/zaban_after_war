---
description: Take one exam year all the way from scans to lexicon, and commit it
argument-hint: "[year, e.g. 1404 - omit to take the newest unfinished year]"
---

Finish one year of the konkour corpus, end to end. Year: $1 (omit it and you pick
the newest year that is not finished).

This is the owner's unit of work. They open a fresh session, type this, and get a
completed year. Assume they remember nothing about the pipeline — the state on
disk is the memory. `extraction/RUNBOOK.md` is the procedure and
`extraction/PIPELINE.md` is the reasoning; follow them rather than improvising.

## Hard rules for this session

**Never read an exam page image yourself.** Every page image goes to an
`exam-extractor` subagent and stays there. If you open one, this session's
context is spent and the year has to finish in another one. The whole design
depends on it.

**Reading comprehension is not extracted, and does not need discussing.** Part C
is deliberately out of scope; S1 already recorded where it sits in every booklet
(`readingPages` in `routes.jsonl`, ADR-0008), so nothing is lost and nothing
about it has to be decided here. Never render or read a reading page. Same for a
standalone grammar block — `grammarPages` holds its address. Grammar items inside
Part A and the Part B cloze are extracted as normal, tagged `part: "grammar"`.

**Do not select context vocabulary here.** S4 transcribes; which stem words earn
a lexicon entry is decided later, in one pass over every year at once
(ADR-0010). Adding a `contextVocab` field in this session would be the wrong
answer at the wrong time.

## Steps

1. **Find the position.** Run `python extraction/scripts/status.py` and show the
   user its output. Pick the year: `$1` if given, otherwise the newest year with
   papers still `pending`, otherwise the newest year not yet routed.

   Say which year you picked and what it will take, then continue without asking.

2. **Route it, if it is not routed** (no `routes.jsonl` rows for that year). This
   is free CPU but slow — about 3 booklets/min, so a ~120-booklet year is roughly
   40 minutes. Start it in the background and tell the user the estimate:

   ```
   python extraction/scripts/s1_route.py --years <year> --workers 12
   ```

   It holds the machine awake by itself and is resumable, so a killed run loses
   only the page it was on. While it runs, do not idle — if the user has other
   work in flight, get on with it. When it finishes, run:

   ```
   python extraction/scripts/s2_cluster.py
   ```

   Re-clustering is safe: paper ids stay on the cluster they already named
   (ADR-0009). Report how many booklets collapsed into how many papers.

3. **Render the year.**

   ```
   python extraction/scripts/s3_render.py --year <year>
   ```

   This prints, per pending paper, its id, booklet reach, and PNG paths.

4. **Extract, in waves of at most 6.** Spawn one `exam-extractor` subagent per
   paper, all of a wave in a single message so they run concurrently. Give each
   one only: `paperId`, `year`, `groupCodes`, `bookletCount`, source `file`, and
   its PNG paths. Wait for the wave, then start the next. A year of 13 papers is
   three waves, not thirteen calls.

5. **Mark them done.** For each paper that produced a file:

   ```
   python extraction/scripts/status.py --mark <paperId> extracted
   ```

6. **Cross-check for free.**

   ```
   python extraction/scripts/s5_crosscheck.py
   ```

   It corroborates both the options and the question stems against the local OCR
   (ADR-0010 made stems first-class data, so they are verified like options).
   Any flagged paper is re-extracted **once**, by a fresh `exam-extractor`
   spawned with `model: opus`, told exactly which items the check disputed. Still
   flagged after that: mark it `needs-owner-review` and move on. Never loop on
   one paper.

7. **Fold into the lexicon, then check the year is not counted twice.**

   ```
   python extraction/scripts/s6_lexicon.py
   pnpm content:lint
   ```

   Check 15 must not name this year: two papers of one year sharing more than
   three question stems are one English test under two ids, and every word in
   them would be counted twice (ADR-0021). If it does, do what its message says —
   add `duplicateOf` and a `duplicateReason` (the measured overlap) to the paper
   it does not keep, never delete a file — re-run S6 and lint, and tell the user.
   Checks 16–18 must be clean for this year too.

8. **Commit the year.** One commit on the current branch:
   `content: extract <year> - <n> papers, <n> questions, <n> new words`
   Then append one line to `wiki/log.md`:
   `extract | <paperIds> | <n> questions | <n> new words | <n> updated`

9. **Close with the scoreboard**, in this shape and no longer:

   - year finished, papers extracted, questions, new words, total lexicon
   - anything left `needs-owner-review`, with the PNG path to look at
   - any `keyConfidence: "low"` items the owner should skim
   - what the next year would be

   Then stop. Do not start another year unless the user asks.

## Cost discipline

- A paper is roughly 2 page images. A 6-paper wave is ~25k image tokens, spent
  inside subagents; this session's own context barely grows.
- If a subagent returns more than its short report, do not paste it anywhere.
- A whole year is normally one session. If the context indicator passes ~60%
  mid-year, finish the current wave, commit, and tell the user to run
  `/complete-year <year>` again in a fresh session — it resumes from disk with
  nothing to hand over.

## If the year cannot be finished

Say so plainly and stop, rather than half-finishing quietly:

- **no PDFs for that year** — 1391 and 1392 are not in the corpus at all
- **routing produced no papers** — report it; do not spend tokens
- **a paper keeps failing the cross-check** — mark it, name it in the scoreboard
