# ADR-0013 — One entry per spelling; homographs are not split

Date: 2026-09-17
Status: accepted

Supersedes the homograph rule in `CLAUDE.md` → "Word ids" and amends
`docs/adr/0012-word-data-is-sense-shaped-and-generated-once.md`.

## Context

`CLAUDE.md` has said since the schema was written that "homographs with
genuinely different meanings get a numeric suffix: `bear-1` (verb, tolerate),
`bear-2` (noun, animal)", and the lint checklist tells us to split such a word
"before users have progress on it". ADR-0012 added `homograph.suspected` so the
generation pass could raise candidates while the senses were being written,
since word ids are frozen forever (constitution rule 6) and the last cheap
moment to split is now.

The 25-word calibration batch produced three candidates: `content` (noun
/ˈkɒntent/ محتوا versus adjective /kənˈtent/ راضی — different stress, different
part of speech), `bear` (the verb versus the animal — the case `CLAUDE.md` names
itself) and `bolt` (the fastener versus "to dash away").

## Decision

**Never split. One spelling is one lexicon entry, however far apart its
meanings.** A word with unrelated senses carries them as multiple entries in
`senses[]`, and the card shows all of them.

The numeric-suffix rule is retired. No `word-1` / `word-2` id exists or will be
minted.

## Why

The decision came from the owner (2026-09-17), and the argument is about what
the user sees rather than about how the data is shaped:

> اگر این کار رو بکنیم یوزر نمیدونه توی هر باری که نشونش میدیم کدوم معنی رو
> میخوایم. اشکالی نداره که کارت دو معنایی باشه.

**The front of a flashcard is just the word.** Split `content` into `content-1`
and `content-2` and the user is shown the bare string `content` twice, with no
way to tell which of the two meanings is being asked for — and the SRS grades
them on a guess about our intent. One card carrying both meanings asks an
unambiguous question: *what does this word mean?* The split solves a tidiness
problem in the data and creates a real problem on the card.

A second argument points the same way, and it is the one that would have blocked
two of the three splits regardless. **A lexicon entry must have at least one real
exam occurrence** (`docs/plan/content-pipeline.md`, and lint blocking rule 4).
Of the three candidates, only `content` has an occurrence for each half — the
noun at `arshad-1402-p06` q24, the adjective at `arshad-1404-p01` q3. `bear` and
`bolt` have exactly one occurrence each, both belonging to a single sense.
Splitting either would have minted `bear-2` (خرس) and `bolt-2` (رم کردن) with
empty `occurrences[]`: entries that fail lint and that put words in front of
candidates that no exam ever tested.

So the rule the schema has carried since the beginning was never actually
applicable to the corpus we have.

## What `homograph` means now

The field stays, because the observation it records is still worth having. It no
longer proposes a split:

> `homograph.suspected` is true when the entry's senses are far enough apart that
> a reader would not guess one from another — different stress, different part of
> speech, unrelated etymology.

Two consumers use it. The card renderer shows such senses as visibly separate
blocks rather than a comma-joined list. The hint pass (`content/hints/`) must
name which sense a mnemonic targets when it is true, because a `تداعی صوتی` hint
built for خرس teaches nothing about تحمل کردن.

`homograph.note` explains the distance, in English — it is a note to the owner
and to later passes, and never reaches the user.

## Consequences

- `CLAUDE.md` → "Word ids" loses the numeric-suffix sentence, in the same commit
  as this ADR.
- Lint checklist item 8 stops meaning "this probably needs splitting" and starts
  meaning "check the senses really belong to one spelling".
- The three calibration entries keep `homograph.suspected: true` under the new
  reading, with their notes rewritten to describe the distance instead of
  proposing a split.
- Constitution rule 6 gets easier to hold, not harder: with no suffixes, an id is
  always exactly the slug of its lemma, and there is no second way to name a
  word.
- A word whose senses are genuinely unrelated now makes a longer card. If that
  turns out to hurt review quality, the fix is in presentation — showing one
  sense at a time — and not in the ids, which stay frozen.
