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
- Only the surviving unique pages — a few dozen, not thousands — reach Claude.
- Claude's reading of them is checked against the local OCR. Also free.

Your job is to run the free passes when they are due, and then run batches.

---

## 1. First-time setup (once per machine)

```
python -m pip install pymupdf rapidocr-onnxruntime
```

That is the whole dependency list. Both are offline, CPU-only, no CDN, no API.

---

## 2. The free local passes (no tokens — run these yourself, in a terminal)

These take CPU minutes to hours and cost nothing. Run them outside a Claude
session, or ask Claude to start them in the background and go do something else.

```bash
# S0 — inventory every PDF. Seconds. Run once, or after adding files.
python extraction/scripts/s0_survey.py

# S1 — find the English pages. The long one: ~25 s per booklet, parallel.
#      One 5-year block at a time, newest first.
python extraction/scripts/s1_route.py --years 1401-1405 --workers 12

# S2 — collapse booklets that carry the same paper. Seconds.
python extraction/scripts/s2_cluster.py
```

S1 is resumable and idempotent: it skips booklets already routed and caches
every OCR'd page, so a killed run loses only the page it was on. Re-running
after a crash is always safe.

**Do the years in blocks of five, newest first**: `1401-1405`, then
`1396-1400`, then `1393-1395`, then `1386-1390`. (1391 and 1392 are not in the
corpus.) The newest block alone is enough to start building the app.

---

## 3. The extraction sessions (this is where tokens go)

Open a Claude Code session in this repo and type:

```
/extract-next 6
```

That is the whole instruction. The command file
(`.claude/commands/extract-next.md`) carries the procedure; you do not have to
remember it or re-explain it. It renders the next pending papers, hands each to
its own subagent, cross-checks the results, folds them into the lexicon, and
commits.

Repeat `/extract-next 6` until it reports nothing pending. You can do this
several times in one session — the orchestrator's context barely grows, because
**page images only ever live inside subagents**.

### Which model

| Role | Model | Why |
|---|---|---|
| The session you type in | **Sonnet 5** | It runs scripts and dispatches. It never reads a page. |
| `exam-extractor` subagents | **Sonnet 5** (set in the agent file) | Enough for clean printed scans, and the free cross-check catches its misses. |
| Re-run of a flagged paper | **Opus 5** | Only papers the cross-check disputed — a handful. `/extract-next` does this automatically. |

Do not run the orchestrator on Opus. It reads nothing hard; you would be paying
Opus rates to run `python`.

### When to start a fresh session

When `/extract-next` finishes a batch and you want to keep going, just run it
again. Start a **new** session when:

- the context indicator says you are past ~60%, or
- you have run more than about ten batches, or
- you are switching to a different five-year block.

There is nothing to hand over. The next session runs `status.py`, sees exactly
where things stand from `extraction/state/`, and continues. That is the point of
keeping all state on disk.

### If you just want to resume without thinking

Type this and nothing else:

```
/extract-next
```

If there is free local work outstanding instead, it will say so and stop rather
than burning tokens.

---

## 4. Reading the status

```
python extraction/scripts/status.py
```

Prints where every stage stands and, at the bottom, the exact next command. When
you are unsure what to do, this is the answer.

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
scan. Open the PNG under `extraction/cache/pages/<paperId>/` and look.

---

## 6. Adding the older years later

Nothing special. Run §2 for the next block, then §3. The lexicon is a fold over
everything in `content/exams/`, so a word first seen in 1403 simply gains
occurrences when 1396 lands — its id, and every user's progress against it, are
untouched.
