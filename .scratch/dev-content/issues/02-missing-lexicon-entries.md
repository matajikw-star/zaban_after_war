# 02 — 12 tested words have no lexicon entry

Status: open — content work
Type: content
Found by: `pnpm content:lint` (check 1), 2026-09-18

Vocabulary/cloze questions whose `testedWord` resolves to no file in `content/lexicon/`:
`out`, `reclamation`, `make`, `stressed out`, `called off`, `slightly`, `wallowing`,
`disaffected`, `formulate`, `be`, `seek` (across 6 papers; run the lint for paper ids).

Several are phrasal/particle forms (`out`, `be`, `make`, `stressed out`, `called off`) that
S7's lemmatiser probably folded into another id; others (`reclamation`, `disaffected`,
`formulate`, `seek`, `wallowing`) look like genuine misses. Resolve through the extraction
pipeline (`extraction/RUNBOOK.md`), never by hand-editing `content/`. Until then the build
ships without them and the lint keeps reporting them — that is the intended behaviour.
