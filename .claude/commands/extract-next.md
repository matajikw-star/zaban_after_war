---
description: Run one extraction batch of the konkour English corpus and commit it
argument-hint: "[batch size, default 6]"
---

Run one batch of the konkour extraction pipeline. Batch size: $1 (default 6 papers).

Read `extraction/RUNBOOK.md` first if anything below is ambiguous. Follow it exactly;
do not improvise a different pipeline.

## Hard rule for this session

**Never read an exam page image yourself.** Every page image goes to an
`exam-extractor` subagent and stays there. If you open one, this session's
context is spent and the batch has to end early. The whole design depends on it.

## Steps

1. **Report the position.** Run:
   `python extraction/scripts/status.py`
   Show the user the one-line summary of where the corpus stands.

2. **If routing or clustering is behind**, say so and stop — those are free local
   passes the user runs directly (RUNBOOK §2). Do not spend tokens on a batch
   that has no pending papers.

3. **Render the batch.** Run:
   `python extraction/scripts/s3_render.py --next <batch size>`
   This prints, per paper, its id, year, booklet reach, and the PNG paths.

4. **Extract in parallel.** Spawn one `exam-extractor` subagent per paper, all in
   a single message so they run concurrently. Give each one only: `paperId`,
   `year`, `groupCodes`, `bookletCount`, source `file`, and the PNG paths.
   Wait for all of them.

5. **Mark them done.** For each paper that produced a file, run:
   `python extraction/scripts/status.py --mark <paperId> extracted`

6. **Cross-check for free.** Run:
   `python extraction/scripts/s5_crosscheck.py`
   Any paper it flags is re-extracted **once**, by a fresh `exam-extractor`
   spawned with `model: opus`, told which questions the check disputed. If it is
   still flagged after that, mark it `needs-owner-review` and move on — never
   loop on one paper.

7. **Fold into the lexicon.** Run:
   `python extraction/scripts/s6_lexicon.py`

8. **Commit.** One commit for the batch, on the current branch, message shaped:
   `content: extract <n> papers (<years>) - <n> words, <n> new`
   Then append one line to `wiki/log.md`:
   `extract | <paperIds> | <n> questions | <n> new words | <n> updated`

9. **Close with a short status**: papers done this batch, papers remaining, new
   words, anything flagged for the owner. Then stop. Do not start another batch
   unless the user asks.

## Cost discipline

- A batch of 6 papers is roughly 25k tokens of images across the subagents, and
  almost nothing in this session.
- If a subagent returns more than its five-line report, do not paste it anywhere.
- If the user's context is already long, suggest they start a fresh session
  rather than running a second batch here.
