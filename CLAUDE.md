# CLAUDE.md — Konkour Leitner

The **schema** for this repo: how knowledge is structured, what the conventions are, what
workflows to follow. Read before any work. Keep it current — see `## Maintaining the schema`.

## What this is

A Persian, RTL, offline-first PWA that drills the English vocabulary that actually appeared
in Iranian MA/PhD entrance exams (کنکور ارشد و دکتری) over the last ~10 years, using spaced
repetition. Domain: `konkourleitner.com`. Audience: Iranian users. One owner, working through
Claude Code.

Predecessor: `C:\Users\asus\Desktop\zaban reserection\starting-pwa-on-zaban` — a throwaway
test build. Read it for context; copy nothing without checking `docs/postmortem-v1.md` first,
which lists what it got wrong.

## The three layers

| Layer | Path | Writes |
|---|---|---|
| **Sources** — raw exam papers, immutable | `sources/`, `raw_konkour_files/` | Human only. Read them; never edit them. The 7.7 GB scan corpus stays out of git (ADR-0006). |
| **Wiki** — everything derived: the lexicon, hints, project knowledge | `content/`, `wiki/`, `docs/` | Claude, continuously |
| **Schema** — conventions and workflows | `CLAUDE.md`, `CONTEXT.md` | Both, deliberately |

The wiki is the product's real asset and it **compounds**. A finding that lives only in a chat
reply is lost work: when you learn something durable, write it into the layer above, then
append one line to `wiki/log.md`.

## Operations

Three named operations. The user invokes them by name ("ingest 1402 arshad", "lint the lexicon").

### ingest `<source>`

Turn raw exam papers into lexicon entries.

The archive is 2,241 scanned booklets (7.7 GB, 52,467 pages, no text layer), so ingest is a
**pipeline, not a chat task**: `extraction/`. Free local passes route and dedupe; a model reads
only the surviving unique pages. Never open exam page images in the main session — they go to
`exam-extractor` subagents. **A year is the unit of work: `/complete-year 1404` takes one year
from scans to lexicon and commits it**, and a fresh session can run it cold because the state
lives in `extraction/state/`. `/extract-next` runs a single smaller batch when that is what you
want. The procedure is `extraction/RUNBOOK.md`; the reasoning is `extraction/PIPELINE.md`.

The unit of ingest is the **paper** (`arshad-<year>-pNN`), not the booklet: within a year many
field codes sit the same English test. See `docs/adr/0007-paper-as-the-unit-of-ingest.md`.

The rules that do not change, whatever runs them:

1. Transcribe verbatim; never repair the English. An unreadable field is `null` plus a note in
   `uncertain[]`. Never guess.
2. These papers carry **no answer key**. The model infers it and records
   `keySource: "inferred"` with a confidence. Nothing is ever labelled as coming from a key.
3. For each tested word, create or update `content/lexicon/<word-id>.json`. A word already in
   the lexicon gains an entry in `occurrences[]` — it does not get a second file. Every
   occurrence records `isAnswer`, and `stats.byYear` carries the per-year frequency.
4. **The stem is data, not decoration.** A question's sentence is transcribed verbatim and
   cross-checked word by word, like its options — it is the example the product shows, and the
   pool a later pass picks context vocabulary from. **Which stem words earn a lexicon entry is
   never decided during extraction**; that runs afterwards over every year at once, from
   `content/exams/`, never from the scans — S7 sieves, S8 judges, and the criterion is
   importance to the sentence crossed with difficulty, never frequency. See
   `docs/adr/0010-context-vocabulary-is-a-later-pass.md`,
   `docs/adr/0011-context-vocabulary-is-selected-by-importance-not-frequency.md` and
   `extraction/JUDGING.md`. A word selected this way joins the lexicon with
   `occurrenceType: "context"` occurrences, counted by `stats.timesAsContext` and deliberately
   kept out of `stats.priority`.
5. **Reading and grammar are located, never transcribed.** Part C is out of scope for the
   lexicon, but S1 writes its page range into `extraction/state/routes.jsonl`
   (`readingPages`, `grammarPages`) so a later feature never reopens the scans. Never send a
   reading page to a model. See `docs/adr/0008-locate-reading-and-grammar-without-transcribing.md`.
6. Report the counts and every `uncertain[]` item to the user before moving on.
7. Append to `wiki/log.md`: `extract | <paperIds> | <n> questions | <n> new words | <n> updated`.

Generating hints is a separate operation from ingest — see `docs/plan/content-pipeline.md`.

### query `<question>`

Answer from the wiki, not from memory. Search `content/`, `wiki/`, `docs/` first; cite the
files you used. When the answer took real work and will be asked again, write it as a wiki page
and add it to `wiki/index.md`.

### lint

Health-check the wiki and report findings ranked by severity. Full checklist:
`docs/plan/content-pipeline.md` → "Lint checklist". Run it after any bulk change.

## Constitution

Non-negotiable. Violating one of these is worse than shipping late.

1. **Git for everything.** Every change lands as a commit on a branch, with a message that says
   why. No uncommitted work at the end of a session. Never force-push `main`.
2. **The review log is the source of truth for user progress.** State is a fold over an
   append-only event log — never a mutable blob. See `docs/adr/0002-review-event-log.md`.
3. **Entitlement is decided server-side.** The client asks; the server answers. Paid content
   never ships to an unpaid client. See `docs/adr/0004-server-side-entitlement.md`.
4. **No runtime third-party CDNs.** Every asset is bundled and self-hosted, because the users
   are behind filtering and the app must run offline. See `docs/adr/0005-no-runtime-cdn.md`.
5. **Secrets live in env vars**, never in source. `.env.example` documents each one.
6. **Word ids are stable forever.** A user's progress is keyed by them. See `## Word ids`.

## Word ids

A word id is a slug of the lemma: `attribute`, `distinct`, `set-off`. Lowercase, ASCII,
hyphen-separated. It is derived once, at first ingest, and then **frozen** — renaming one
orphans every user's progress for that word. Homographs with genuinely different meanings get
a numeric suffix: `bear-1` (verb, tolerate), `bear-2` (noun, animal).

Never key anything user-facing on array position. The old app sliced `words[]` by index to
build its curriculum, so adding a word silently rewrote what every user was studying.

**Paper ids follow the same rule.** `arshad-1405-p02` names a cluster of booklets, not the
second-biggest cluster of 1405 — it used to mean the latter, and two papers swapped identities
when a new year was routed. Re-clustering keeps every id on the cluster it already named. See
`docs/adr/0009-paper-ids-are-stable.md`.

## Stack

Decided in `docs/adr/`. Summary: pnpm workspace; Vite + React + TypeScript + Tailwind (as
dependencies, self-hosted); `vite-plugin-pwa`; Dexie/IndexedDB locally; PocketBase on an
Iranian VPS for auth, sync, and payment. Verify versions in `package.json` rather than trusting
this line.

## Working agreements

- **Plan before building.** Anything past a single file gets a ticket first — see
  `docs/agents/issue-tracker.md`.
- **The SRS engine is pure.** `packages/core` imports nothing from React, the network, or the
  clock — the current time is always a parameter. It is the one part of this codebase that is
  unit-tested exhaustively.
- **Persian is the product language, English is the code language.** UI strings, hints, and
  translations are Persian; identifiers, comments, commits, and these docs are English.
- **Say what is uncertain.** Extraction from bad scans and Iranian infra pricing both invite
  confident guessing. Mark unknowns as unknown.

## Maintaining the schema

When a decision changes how work is done, update this file in the same commit that acts on it,
and record the reasoning as an ADR in `docs/adr/`. This file states the current rules; ADRs hold
the history of why. Keep it short enough that reading it costs nothing — push detail down into
`docs/` and point at it from here.

## Agent skills

### Issue tracker

Issues live as markdown files under `.scratch/<feature-slug>/` in this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, used verbatim as the label strings. See `docs/agents/triage-labels.md`.

### Extraction pipeline

The scan corpus is processed by `extraction/`, not by hand. Entry point:
`extraction/RUNBOOK.md`. One year: `/complete-year <year>`. One batch: `/extract-next`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
