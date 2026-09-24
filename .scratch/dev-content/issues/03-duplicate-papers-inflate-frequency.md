# 03 — Duplicate papers in 1399 and 1400 inflate every frequency count

Status: needs-triage
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
