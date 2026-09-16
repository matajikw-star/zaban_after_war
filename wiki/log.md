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
decision | 2026-09-14 | Owner product brief captured verbatim in docs/plan/product-brief.md: felt progress, a finite path, offline study, restorable progress, free slice then payment, v1-grade word data, onboarding, and per-field customisation as an open question. R1-R12 + D1-D7.
decision | 2026-09-14 | Context vocabulary is chosen after extraction, not inside S4: the stem is already stored verbatim, and a pass over all ~830 stems can use cross-year repetition as evidence that a single paper cannot supply. Extraction is therefore unblocked (ADR-0010)
decision | 2026-09-14 | Question stems are first-class data and are now cross-checked word by word against the local OCR at the same 0.9 floor as options - 97-100% corroborated across the seven 1405 papers (ADR-0010)
decision | 2026-09-14 | A year is the unit of work: /complete-year <year> routes, clusters, renders, extracts, cross-checks, folds and commits one year, so a cold session finishes a year with one line
decision | 2026-09-14 | Sales model is a one-off permanent purchase; distribution is PWA+Zarinpal first, then a second Cafe Bazaar TWA build differing only in payment (BazaarPay); Myket out of scope. Entitlement gains a pluggable source from day one.
decision | 2026-09-14 | Round 2: target konkour 1406; path = fixed 80-100 word stations over a monotonic map, map and schedule separate; review log keyed by itemId; anonymous-first + OTP with local-log migration; enrichment is an LLM pipeline with a confidence-driven second pass; launch corpus 1398-1405; Bazaar TWA gets its own subdomain; content-rights question resolved by the owner.
decision | 2026-09-14 | Round 3: the station map is dropped as a user-facing concept and survives only as an internal new-word batching rule. Visible state is Leitner boxes, conquered count, percent of path, streak, daily reviews. Daily goal is reviews, estimated from an onboarding hours question. Two new constraints conflict with ADR-0003: the app must never say "done for today", and there must be no 30-day floor to mastering a word.
decision | 2026-09-14 | Round 4: minimum time to conquer a word drops from ~32 days to 7 - strict Leitner is a guide, not a commitment, and must never stall the user. Progress percentage is weighted by exam frequency (denominator = total occurrences, earned one fifth per box). Unlimited queue with elapsed-interval promotion, know-it-already skip, placement pass, two-gate paywall, and a suggested-not-enforced break at the daily goal.
query | 2026-09-14 | v1 scheduler read in full: weighted random over boxes + a thin-box exclusion rule + uniform-within-box over a frequency-ordered cumulative slice. Four ideas worth carrying (data-side frequency ordering, thin-box anti-repetition, cumulative mastery-ratio gate, box-histogram ETA) and three defects not to (box weights unnormalised by population so the gradient was 1.5:1 not 8.5:1, box wipe on level advance, streak counting app-opens). Written up in docs/postmortem-v1.md.
decision | 2026-09-14 | Round 5: selection is weighted-random among due words only (weight per word, not per box, with a recently-seen suppression window); the app shows a pace estimate against the exam date using observed accuracy, smoothed.
query | 2026-09-14 | Web push for Iranian users rides Google Play Services (mtalk.google.com, ports 5228-5230, not proxyable) and the browser fixes the endpoint, so no Iranian vendor can move it - Pushe/Chabok/Najva are all FCM shells. OONI shows fcm.googleapis.com ~99% reachable but has zero coverage of the actual delivery port. Notification Triggers API is dead, and SMS at ~150 toman costs ~4.5M toman/month per 1000 DAU. Notifications are a bonus, never a mechanism. wiki/web-push-in-iran.md
decision | 2026-09-14 | Round 6: progress never decreases (high-water-mark box); weight = raw stats.timesTested with a pluggable wordWeight() in packages/core and a measured switch to a dampened form if the bottom half of words carries under 25% of total weight; one ladder 10m/1d/2d/4d/8d with a 7-day floor and the exam date used only to suggest daily time; reviews are self-graded recall EN-to-FA; no notifications at launch.
query | 2026-09-14 | Market sized: 521k arshad participants in 1404 and 651k registrations for 1405, all sitting the same zaban-e omumi paper - which kills the per-field market worry outright. Books run 450-550k toman after discount and candidates buy 2-3; the exam fee alone is 705k. Bazaar 1402: 5.5M of 55.8M accounts paid for anything (~10%). Every konkour-vocabulary app on Bazaar is under 20k installs and abandoned. No current Iranian app IAP price is published anywhere. wiki/market-and-pricing.md
decision | 2026-09-14 | Price is 290,000 toman one-off for permanent access, listed at 450,000 - below a single vocabulary book and ~40% of the arshad registration fee.
extract | arshad-1404-p01, arshad-1404-p02, arshad-1404-p03, arshad-1404-p04, arshad-1404-p05, arshad-1404-p06 | 94 questions | 207 new words | 11 updated
extract | arshad-1403-p01, arshad-1403-p02, arshad-1403-p03, arshad-1403-p04, arshad-1403-p05 | 100 questions | 194 new words | 20 updated
extract | arshad-1402-p01, arshad-1402-p02, arshad-1402-p03, arshad-1402-p04, arshad-1402-p05, arshad-1402-p06 | 103 questions | 195 new words | 25 updated
extract | arshad-1401-p01, arshad-1401-p02, arshad-1401-p03, arshad-1401-p04, arshad-1401-p05 | 96 questions | 174 new words | 42 updated
extract | arshad-1400-p01, arshad-1400-p02, arshad-1400-p03, arshad-1400-p04, arshad-1400-p05, arshad-1400-p06, arshad-1400-p07, arshad-1400-p08, arshad-1400-p09, arshad-1400-p10, arshad-1400-p11, arshad-1400-p12, arshad-1400-p13 | 247 questions | 260 new words | 54 updated
extract | arshad-1399-p01, arshad-1399-p02, arshad-1399-p03, arshad-1399-p04, arshad-1399-p05, arshad-1399-p06, arshad-1399-p07, arshad-1399-p08, arshad-1399-p10, arshad-1399-p11 | 201 questions | 147 new words | 53 updated
decision | 2026-09-16 | Round 7: every word gets a generated example because 74% of lexicon entries are distractor-only and a distractor never appears in a sentence - the verbatim exam stem is an addition for answer-words, not a replacement, so enrichment grows rather than shrinks. Also: first-party milestone beacon plus self-hosted Umami for funnel measurement; real-exam mode ships as specified but its placement is deferred; v1 hint template kept verbatim; error reports and manual grants live in PocketBase; ADRs and spec pack precede any production session.
extract | arshad-1398-p01, arshad-1398-p02, arshad-1398-p03, arshad-1398-p04, arshad-1398-p05, arshad-1398-p07 | 151 questions | 258 new words | 83 updated
decision | 2026-09-17 | Q36 settled: a content report is a structured three-reason flag riding the review-event outbox, not a free-text form - no new transport, no moderation surface, and it carries a word id. Telegram from the client is ruled out by constitution rule 5 and by api.telegram.org being unreachable for the target audience; owner notification is deferred.
query | 2026-09-17 | Corpus measured after 1398-1405 extraction: 58 papers, 1776 distinct lemmas - the low end of the projected band. Cross-year repetition is low: 85% of words appear in only one year, so the exam badge must be written for "1 time, year 1402" rather than for repeats. Q27 decision rule checked and passed: the bottom half of words by weight carries 34.3% (over the 25% floor) so raw timesTested stands, and the top 20% of words carry 42% of total weight, roughly doubling early progress as intended.
