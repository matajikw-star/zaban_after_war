# Runbook — extracting the corpus

For the owner. What to type, in which session, on which model, to move the
7.7 GB of scanned konkour papers into `content/`. Written to be picked up cold:
nothing here depends on remembering a previous session.

The design behind it is in `PIPELINE.md`. Read that once; read this every time.

---

## 0. The one idea

52,467 scanned pages cannot go through a model. So the pipeline spends **CPU
instead of tokens** wherever it can:

- A local OCR model finds the English pages and dedupes the papers. Free.
- The same pass writes down where each booklet's reading and grammar sit, so
  that nobody ever has to reopen the corpus to find them. Free, and no model
  sees those pages.
- Only the surviving unique pages — a few dozen, not thousands — reach Claude.
- Claude's reading of them is checked against the local OCR. Also free.

Your job is to run the free passes when they are due, and then run batches.

---

## 1. First-time setup (once per machine)

```
python -m pip install pymupdf rapidocr-onnxruntime
```

That is the whole dependency list. Both are offline, CPU-only, no CDN, no API.

Then **restart Claude Code once**. `/complete-year`, `/extract-next` and the `exam-extractor`
subagent are read from `.claude/` when a session starts, so a session that was
already open when they were added will not see them.

---

## 2. The free local passes (no tokens — run these yourself, in a terminal)

These take CPU minutes to hours and cost nothing. Run them outside a Claude
session, or ask Claude to start them in the background and go do something else.

```bash
# S0 — inventory every PDF. Seconds. Run once, or after adding files.
python extraction/scripts/s0_survey.py

# S1 — find the English pages, and record where reading and grammar sit.
#      The long one. Reading pages are dense English and OCR slowly: the
#      section scan alone measured 3.1 booklets/min on 8 workers (1405).
#      One 5-year block at a time, newest first.
python extraction/scripts/s1_route.py --years 1401-1405 --workers 12

# S1 backfill - only for booklets routed before the section scan existed
#      (status.py says "<- backfill"). Replays phase one off the OCR cache,
#      so it pays for the reading pages and nothing else. ~3 booklets/min.
python extraction/scripts/s1_route.py --years 1398-1405 --sections --workers 12

# S2 — collapse booklets that carry the same paper. Seconds.
python extraction/scripts/s2_cluster.py
```

### The machine must not doze off

This laptop is Modern Standby: `powercfg /a` reports `S0 Low Power Idle` and no
S3. On that hardware the **screen timeout is itself an entry into standby**, so a
multi-hour pass with no window on screen can be throttled or suspended a few
minutes after you walk away - and it looks exactly like a hang.

`s1_route.py` now holds a Windows "do not idle into standby" request for the
length of its run. The display is left alone: it still turns off on its own
timeout, so no static image sits on the panel.

For a job already in flight, or anything else long, hold it from outside:

```bash
python tools/keepawake.py --hours 3
```

To check whether a run really stalled rather than guessing from the fan, count
the OCR files by the minute they were written - that is direct evidence:

```bash
python -c "import os,time,collections,datetime; b=collections.Counter(); [b.update([datetime.datetime.fromtimestamp(f.stat().st_mtime).replace(minute=0,second=0,microsecond=0)]) for d in os.scandir('extraction/cache/ocr') if d.is_dir() for f in os.scandir(d.path)]; [print(k,v) for k,v in sorted(b.items())[-8:]]"
```

S1 is resumable and idempotent: it skips booklets already routed and caches
every OCR'd page, so a killed run loses only the page it was on. Re-running
after a crash is always safe. `--sections` is the single exception to "skips
booklets already routed": it revisits the rows that predate the section scan,
and only those.

**Do the years in blocks of five, newest first**: `1401-1405`, then
`1396-1400`, then `1393-1395`, then `1386-1390`. (1391 and 1392 are not in the
corpus.) The newest block alone is enough to start building the app.

---

## 3. The extraction sessions (this is where tokens go)

Open a Claude Code session in this repo and type:

```
/complete-year 1404
```

That is the whole instruction. **A year is the unit of work.** The command file
(`.claude/commands/complete-year.md`) carries the procedure; you do not have to
remember it or re-explain it. It routes and clusters the year if that has not
happened, renders every pending paper, hands each to its own subagent,
cross-checks the results, folds them into the lexicon, commits, and reports.

Leave the year off and it takes the newest unfinished one:

```
/complete-year
```

Nothing is handed between sessions. The next one runs `status.py`, reads
`extraction/state/` off disk, and continues — which is the entire reason state
lives there. So the loop for the rest of the corpus is: open a session, type
`/complete-year`, read the scoreboard, close the session. Once per year of exams.

`/extract-next 6` still exists for a smaller bite — half a year, or a retry —
and can be repeated in one session, because **page images only ever live inside
subagents** and the orchestrator's context barely grows.

### Which model

| Role | Model | Why |
|---|---|---|
| The session you type in | **Sonnet 5** | It runs scripts and dispatches. It never reads a page. |
| `exam-extractor` subagents | **Sonnet 5** (set in the agent file) | Enough for clean printed scans, and the free cross-check catches its misses. |
| Re-run of a flagged paper | **Opus 5** | Only papers the cross-check disputed — a handful. The command does this automatically. |

Do not run the orchestrator on Opus. It reads nothing hard; you would be paying
Opus rates to run `python`.

**Nothing picks the model for you.** `.claude/settings.json` sets `"model":
"opus"`, so every new session starts on Opus — type `/model sonnet` first thing
in an extraction session. The subagents are unaffected either way: their model
is pinned in `.claude/agents/exam-extractor.md`, so the orchestrator's model
changes the cost of orchestrating and nothing about the transcription.

### When to start a fresh session

One year per session is the intended rhythm, and the cheapest one. Start a
**new** session when:

- a year is finished and committed — just open a new one and type
  `/complete-year` again, or
- the context indicator says you are past ~60% mid-year. Let the current wave
  finish and commit; re-running `/complete-year <year>` resumes the same year
  from disk.

There is nothing to hand over. The next session runs `status.py`, sees exactly
where things stand from `extraction/state/`, and continues. That is the point of
keeping all state on disk.

### If you just want to resume without thinking

Type this and nothing else:

```
/complete-year
```

It works out which year is next — including a year that still needs routing, in
which case it starts the free local pass itself and tells you the wait.

---

## 4. Reading the status

```
python extraction/scripts/status.py
```

Prints where every stage stands and, at the bottom, the exact next command. When
you are unsure what to do, this is the answer.

The `sections` line is the reading/grammar address book (ADR-0008). It never
blocks a batch, but a year is only finished when it reads N/N.

What the numbers looked like on the first year measured (1405):

```
81 routed booklets  ->  7 distinct papers      12x dedup
arshad-1405-p01     ->  29 field codes sat it
                        7 vocabulary + 3 grammar items, 2 page images
                        cross-check: 100% of options corroborated
                        28 lexicon words, 7 of them correct answers
```

---

## 5. What you personally have to judge

Two things the pipeline deliberately will not decide for you.

**Answer keys.** These booklets ship without them. The model picks the answer
and records `keySource: "inferred"` with a confidence. Items marked
`keyConfidence: "low"` are collected for you; skim them before promoting words
to `status: "approved"`. Nothing is ever labelled as coming from an official key,
because nothing does.

**Papers flagged `needs-owner-review`.** The cross-check found options in the
model's transcript that the local OCR cannot corroborate, twice. Usually a bad
scan. Open the PNG under `extraction/cache/pages/<paperId>/` and look. Clearing a
flag records why, on the paper's row in `papers.jsonl` (S2 keeps it across
re-clusters):
`python extraction/scripts/status.py --mark <paperId> extracted --note "<decision, evidence, date>"`.
An independent transcript of the same test that agrees option for option - a
paper retired as its duplicate (ADR-0021) - is evidence enough; four papers were
cleared that way on 2026-09-25.

---

## 6. Where the reading and the grammar are

Not extracted, by decision - but located, so that adding a reading or grammar
feature later never means reopening 7.7 GB of scans (ADR-0008).

Every row in `extraction/state/routes.jsonl` carries `readingPages` and
`grammarPages`: page numbers inside that booklet's own PDF. Recorded per
booklet, not per paper, because زبان تخصصی differs for every field code.

To turn an address back into images:

```bash
python extraction/scripts/s3_render.py --booklet 1103-1405 --reading
```

PNGs land under `extraction/cache/pages/reading/<bookletId>/`. Nothing
transcribes them and no model reads them until there is a feature that needs
them.

Grammar is mostly extracted already: items inside Part A and the Part B cloze
are in `content/exams/*.json` tagged `part: "grammar"`. `grammarPages` records
only the rare standalone "Structure and Written Expression" block.

## 7. Adding the older years later

Nothing special, and nothing to remember: `/complete-year 1397`, then `1396`,
one per session whenever there is time. The command runs the free local passes
for a year that has not been routed, so §2 is an optimisation — route a whole
five-year block overnight and the years that follow start at step 3 — not a
prerequisite.

This is safe to do months apart because of three properties, and it is worth
knowing which ones you are relying on:

- **The lexicon is a fold** over everything in `content/exams/`, so a word first
  seen in 1403 simply gains occurrences when 1396 lands. Every frequency and
  priority is recomputed from scratch, never patched.
- **Word ids are frozen**, so a user's progress survives that recount untouched.
- **Paper ids stay on their cluster** (ADR-0009), so re-clustering a corpus that
  grew by a year does not renumber what is already extracted.

What *does* change when an old year lands is the **ranking** of words by
priority — a word at priority 3 today may be priority 1 once five more years are
in. That is the system working, not drifting: the ordering is derived from the
counts, and nothing user-facing is keyed on it.

## 8. Context vocabulary — deliberately not yet

Words in a question's stem that were never one of the four options (`ability`,
`knowledge`, `score`) get no lexicon entry today. They are not lost: every stem
is stored verbatim in `content/exams/*.json`, and since ADR-0010 every stem word
is corroborated against the local OCR like an option is.

Choosing which of them earn an entry is a **separate pass that runs once, after
the years are in** — it reads the stored stems as text, never the scans, so it
sees all ~830 questions at once and can use repetition as evidence instead of
guessing paper by paper. Do not add it to an extraction session; the ticket is
`.scratch/stem-vocab/issues/01`.
