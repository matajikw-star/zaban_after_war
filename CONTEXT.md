# CONTEXT.md — Domain glossary

The vocabulary this project speaks. Use these terms exactly; when a concept is missing here,
that is a signal to add it rather than to invent a synonym.

## Content domain

- **Source** — one raw exam paper as the owner received it, in `sources/raw/`. Immutable.
- **Exam** — one sitting, identified by `<degree>-<year>-<field>` (e.g. `arshad-1402-zaban`).
  `degree` ∈ `arshad` | `doctora`. Year is the Persian (Jalali) year.
- **Question** — one extracted multiple-choice item: stem, four options, key, and the exam it
  came from. Reproduced verbatim, including its flaws.
- **Word** (also **lexicon entry**) — one vocabulary item the exams test. Carries the lemma,
  part of speech, Persian translation(s), synonyms, and `occurrences[]`.
- **Occurrence** — one appearance of a word in one exam. This is the product's core claim:
  "این کلمه در کنکور ۱۴۰۱ و ۱۳۹۸ آمده". Every occurrence cites a real question.
- **Hint** (**راهنما**) — a Persian mnemonic for one word, usually a sound-alike association
  (تداعی صوتی). LLM-drafted, human-approved, revisable. Separate from the word entry because
  hints get rewritten and word data does not.
- **Lexicon** — the whole set of word entries. The asset the business is built on.

## Learning domain

- **Review** — one presentation of one word to one user, answered **remembered** or **forgot**.
- **Review event** — the immutable record of a review: `{id, wordId, at, grade, device}`.
  Append-only. See `docs/adr/0002-review-event-log.md`.
- **Fold** — deriving current state from the event log. State is never stored as truth; it is
  recomputed. Two devices merge by taking the union of their events.
- **Box** (**جعبه**) — Leitner box 1–5, and the interval that comes with it. Box 5 is
  **mastered** (مسلط). A word moves up one box on *remembered* and falls to box 1 on *forgot*.
- **Due** — a word whose last review plus its box interval is in the past. The session queue is
  due words first; the naive "weighted random" of v1 is retired.
- **Deck** — the set of words a user is currently studying, grown by **introducing** new words
  as the due queue empties.
- **Streak / daily goal** — retained from v1, but computed in Tehran local time, not UTC.

## Commercial domain

- **Entitlement** — what a given account is allowed to fetch. Decided server-side; the client
  caches the answer but never authors it.
- **Free tier** — the sample the app gives away. A deliberate slice of the lexicon, served as
  its own chunk so the paid content is never present on an unpaid device.
- **Chunk** — a downloadable slice of the lexicon (words + hints), cached in IndexedDB after
  first fetch so the app runs offline afterwards.

## Retired terms

Present in v1, deliberately abandoned. Do not reintroduce.

- **سطح / Level (7) and خوان / Sub-level (7)** — a fixed 49-step curriculum built by slicing the
  word array by index. Replaced by due-driven scheduling plus introduction rate.
- **Ban / security check** — client-side banning of users whose progress looked "too far".
  Replaced by server-side entitlement. See `docs/adr/0004-server-side-entitlement.md`.
