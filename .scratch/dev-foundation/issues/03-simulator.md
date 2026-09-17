# 03 — The schedule simulator

Status: ready-for-agent
Type: task
Phase: 1
Blocked by: 02

## Goal

`tools/simulate`: replay a synthetic user through the real engine and print, per day:
presentations, new words introduced, conquests, accuracy, due-pool size, and the pace estimate
versus the actual finish. Inputs: minutes/day, accuracy profile (constant or per-box), days,
content size and weight distribution (default: the real distribution from `content/lexicon`,
computed at run time — never hard-coded).

## Done when

`pnpm simulate --minutes 20 --days 90 --accuracy 0.85` prints a table; a snapshot test pins the
output for a fixed seed; the run shows a 7-day conquest is possible and the median conquest is
2–3 weeks; findings written to `docs/spec/how-why.md` as a dated note if any parameter changes.
