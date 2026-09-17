# extraction/

Turns 7.7 GB of scanned konkour booklets into `content/exams/` and
`content/lexicon/`, across as many sessions as it takes.

**Running it:** `RUNBOOK.md` — what to type, on which model, and how to resume.
**Why it works this way:** `PIPELINE.md` — the design and its constraints.

```
RUNBOOK.md     the operating procedure (read this one)
PIPELINE.md    the design rationale and data contracts
scripts/       the free local stages - Python, offline, CPU only
state/         pipeline state, committed: booklets, routes, papers, checks
cache/         gitignored: OCR text and rendered pages, both regenerable
```

The model-facing half lives with the harness, not here, so that the prompt and
the schema it produces cannot drift apart:

```
.claude/agents/exam-extractor.md    the subagent that reads pages (and the JSON spec)
.claude/commands/extract-next.md    one batch, start to commit
```

## Where things stand

```
python extraction/scripts/status.py
```

Prints every stage's progress and the exact next command to run.

## The one rule

Page images go to subagents, never to the session you are typing in. That is
what keeps a session's context flat, and it is why you can stop and resume at any
point without a handover.
