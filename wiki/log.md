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
