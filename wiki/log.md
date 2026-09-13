# Log

Append-only. Newest at the bottom. One line per entry, prefixed by operation so it stays
greppable: `ingest |`, `decision |`, `query |`, `lint |`, `milestone |`.

```
decision | 2026-09-10 | Project restarted from scratch as konkour-leitner; v1 kept as reference only
decision | 2026-09-10 | Adopted the three-layer wiki pattern (sources / wiki / schema) with CLAUDE.md as schema
```
decision | 2026-09-10 | Zarinpal merchant account already active — removes the longest lead-time risk from M5
decision | 2026-09-10 | Owner places raw exam files in sources/raw/ directly; manifest row required before ingest
milestone | 2026-09-10 | M0 scaffold: pnpm workspace, TS strict + project references, Biome, Vitest, CI workflow
decision | 2026-09-10 | Exam archive is 2241 PDFs / ~7.9 GB across 176 field codes; raw sources stay out of git (ADR-0006)
query | 2026-09-10 | Target content is the زبان عمومی section present in every field's paper, not a single زبان exam
decision | 2026-09-10 | Corpus has no text layer; pdftotext returns only the konkur.in watermark
query | 2026-09-10 | English section sits on pages ~2-6 of every booklet: PART A vocabulary, PART B cloze, PART C reading
decision | 2026-09-10 | Local OCR (RapidOCR, English-only) routes and dedupes for free; the model reads only unique pages
query | 2026-09-10 | 1403 sample: codes 1101/1102/1301 share one English paper, 1103/1501 another — ~120 booklets/year collapse to a few papers
decision | 2026-09-10 | Paper, not booklet, is the unit of ingest (ADR-0007); ids are arshad-<year>-pNN
query | 2026-09-10 | Booklets carry no answer key — keys are model-inferred and marked keySource:"inferred"
decision | 2026-09-10 | Extractor is kept blind to the local OCR so the free cross-check stays an independent second opinion
milestone | 2026-09-10 | extraction/ pipeline built: S0-S6 scripts, exam-extractor subagent, /extract-next command, RUNBOOK
query | 2026-09-10 | The English section is two parts: زبان عمومی (shared across field codes) then زبان تخصصی reading under Part C (per-field)
decision | 2026-09-10 | Dedup fingerprints only the pages before Part C — whole-section fingerprints scored 0.25 and found no duplicates, general-only scored 0.94
query | 2026-09-10 | 1405: 81 routed booklets collapse to 7 papers; arshad-1405-p01 alone covers 29 field codes
decision | 2026-09-10 | Most Part B cloze blanks are grammar (one lemma across all four options); the lexicon skips any question whose options share a lemma
extract | arshad-1405-p01 | 10 questions | 28 new words | 0 updated
extract | arshad-1405-p02,arshad-1405-p03,arshad-1405-p04,arshad-1405-p05,arshad-1405-p06,arshad-1405-p07 | 87 questions | 222 new words | 1 updated
decision | 2026-09-12 | Reading and grammar are located, never transcribed: S1 carries past Part C and records readingPages/grammarPages per booklet, so a later feature never reopens the scans (ADR-0008)
decision | 2026-09-12 | paperIds are pinned to their cluster, not to size rank — arshad-1405-p02/p03 had swapped identities when routing a new year reordered two near-tied clusters (ADR-0009)
decision | 2026-09-13 | Long local passes hold a Windows ES_SYSTEM_REQUIRED request: this machine is Modern Standby (no S3), so the screen timeout can itself suspend a background job. The display request is deliberately not held, so the panel still sleeps.
query | 2026-09-13 | Field code 1121 is English end to end: its reading runs pages 4-28 (1405) to 5-40 (1398), not the 3-4 pages every other code has. It is also the only paper with 30 questions.
extract | section scan | 972 booklets located | 4025 reading pages | 10 standalone grammar blocks
