# 02 — Map field codes to field names

Status: open
Type: task

## Goal

`content/exams/*.json` carries `groupCodes` — the کد رشته that sat each paper —
and `extraction/state/routes.jsonl` carries one per booklet. 918 code entries
across 58 papers. **Nothing in the repo says what any of them mean.** `1121` is
a number.

## Why it matters now

Two things need the mapping, and neither can be finished without it:

- **Domain-term attribution** (ADR-0011). The judging pass flags a stem word as a
  domain term and records the field codes it belongs to. Machine-readable today,
  unreadable by a human — and unshowable in a UI that must say
  «اصطلاح تخصصی رشتهٔ ...» in Persian.
- **Onboarding** asks the candidate for their field code (product-brief R7, Q25).
  A picker needs names, not a number the candidate must know by heart.

## What is already known from the corpus

Three codes sit their own English paper in almost every year, so they are the
only ones a per-field view can serve with real content:

| code | own paper in | papers |
|---|---|---|
| 1110 | 1398, 1399, 1400, and on | 8 |
| 1121 | 1398, 1399, 1400, and on | 8 |
| 1148 | 1398, 1399, 1400, and on | 6 |

The rest share general papers of up to 60 codes.

## Left to do

1. Source the code → name mapping. It is public (Sanjesh publishes the دفترچه
   with codes and field names each year); the owner may also know the three
   above by heart, which would unblock the domain-term work immediately.
2. Store it as `content/field-codes.json` — `{ "1121": "..." }`, Persian names,
   English keys. Content, not extraction state: the app ships it.
3. Note that codes are not stable across years in general. Record the year each
   name was read from, and check the three above against more than one year
   before trusting them.

## Watch out

- Do not infer a field name from the vocabulary of its paper. That is guessing
  dressed as evidence — the same error ADR-0011 exists to correct.
