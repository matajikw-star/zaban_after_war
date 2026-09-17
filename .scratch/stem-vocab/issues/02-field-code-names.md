# 02 — Map field codes to field names

Status: partly resolved — 57 of 132 named, 3 contradictory
Type: task

## Goal

`content/exams/*.json` carries `groupCodes` — the کد رشته that sat each paper —
and `extraction/state/routes.jsonl` carries one per booklet. 918 code entries
across 58 papers. Nothing in the repo said what any of them meant.

## What changed (2026-09-17)

The owner supplied a workbook, now at `sources/reference/field-codes.xlsx`, and
named one further code by hand. `extraction/scripts/field_codes.py` converts it
to **`content/field-codes.json`**. Re-run that script when a fuller sheet
arrives; do not hand-edit the JSON.

| | count |
|---|---|
| codes named | 57 of the 132 in the corpus |
| names in the sheet the corpus never uses | 22 |
| codes still unnamed | 75 |
| codes the sheet contradicts itself on | 3 |

**The three codes the domain-term work needed are all named now:**

| code | name | source | domain-block words |
|---|---|---|---|
| 1110 | زبان‌شناسی | sheet | 20 |
| 1121 | زبان انگلیسی | owner, by hand — not in the sheet | 14 |
| 1148 | مدیریت کسب و کار و امور شهری | sheet | 6 |

## The finding that came out of it

**A field code names the paper a word sat in, not the word's discipline** —
JUDGING.md rule 6 said so from the judging side, and naming the codes confirms
it from the other end:

- `1121` is **زبان انگلیسی**, the field this product exists for. Its paper is a
  general English test, so its stems range over every subject. That is why
  `zooxanthellae`, `pituitary`, `keratin` and `covariance` all attribute to it.
  A 1121 tag carries **no disciplinary signal at all**.
- `1148` is مدیریت کسب و کار, yet carries `hypothalamus` and `planetesimal`.
  Same story.
- Only `1110` (زبان‌شناسی) mostly coincides with its words.

Recorded in `extraction/WORD-DATA.md` → "Domain terms", because the generating
agent is the consumer that would otherwise have trusted the code.

This also settles the `covariance` question that was open against this ticket:
1121 cannot decide between «کوواریانس» (statistics) and «هم‌وردایی» (physics),
because 1121 is not a physics field or a statistics field. «کوواریانس» stands on
the word's own merits.

## Left to do

1. **Name the remaining 75 codes.** Public — Sanjesh publishes the دفترچه with
   codes and field names each year. Not blocking: no word data depends on a code
   being named. Onboarding's field picker (product-brief R7, Q25) does.
2. **Resolve the three contradictions.** Parked in `needsReview` in the JSON so
   nothing wrong ships:
   - `1361` — the sheet gives both «حسابداری» and «هنرهای ساخت و معماری».
   - `1363` — «فرش انگل شناسی», which is «فرش» with the next row run into it.
   - `1503` — «قارچ شناسی دامپزشکی مهندسی ایمنی», two names in one cell.
   All three appear in 7 papers each, so they are worth fixing eventually.
3. **Codes are not stable across years.** The sheet records no year. Check the
   three named codes above against more than one year's دفترچه before trusting
   them beyond the domain-term use they have now.

## Watch out

- Do not infer a field name from the vocabulary of its paper. That is guessing
  dressed as evidence — the same error ADR-0011 exists to correct, and the
  finding above is exactly why it would have gone wrong: the vocabulary of the
  1121 paper would have suggested biology.
