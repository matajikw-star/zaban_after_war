# CONTEXT.md — Domain glossary

The vocabulary this project speaks. Use these terms exactly; when a concept is missing here,
that is a signal to add it rather than to invent a synonym.

## Content domain

- **Source** — one raw exam paper as the owner received it, in `sources/raw/`. Immutable.
- **Exam** — one sitting, identified by `<degree>-<year>-<field>` (e.g. `arshad-1402-zaban`).
  `degree` ∈ `arshad` | `doctora`. Year is the Persian (Jalali) year.
- **Paper** — one distinct English test of one year, `arshad-<year>-pNN`, sat by every field
  code in its `groupCodes`. The unit of ingest (ADR-0007); its id is permanent (ADR-0009). A
  question counts once per paper, however many booklets carried it.
- **Retired paper** — a paper id that turned out to hold another paper's test again. It keeps
  its file and id and names the **kept paper** in `duplicateOf`; it adds no count (ADR-0021).
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
- **Item id** — the opaque, globally unique key of anything studyable. Today every item is a
  word and the item id is the word id; the review log is keyed by `itemId` so a future grammar
  item cannot collide with a word.
- **Presentation** — one card shown to the user, whatever the outcome. The daily goal and the
  free-tier soft limit (100) count presentations.
- **Box** (**جعبه**) — Leitner box 1–5, and the interval that comes with it (10 min, 1 d, 2 d,
  4 d, 8 d). A word moves up one box on *remembered* **only if its interval has elapsed**, and
  falls to box 1 on *forgot*.
- **Conquered** (**فتح‌شده**) — a word whose **high-water mark** box has ever reached 5. Box 5
  words keep cycling every 8 days; "conquered" is permanent.
- **High-water mark** — the highest box a word has ever reached. Drives progress; never
  decreases. The live box may be lower after a lapse.
- **Weight** — a word's contribution to progress: `stats.timesTested` (raw). Context-only
  words weigh 0. Progress = Σ(highWaterBox/5 × weight) / Σ weight.
- **Due** — a word whose last review plus its box interval is in the past. The queue draws
  weighted-random among due words, then introduces new words, then conquered-due words, then
  not-yet-due words soonest first. It is never empty.
- **Know** («این را بلدم») — an event that sends a word straight to box 5.
- **Suppression window** — the last N (8) cards shown are never drawn again immediately, even
  when the pool is small.
- **Introduction budget** — how many new words may enter box 1 in a Tehran day: a floor of
  `ceil(goal/6)` plus today's conquests, capped at twice the floor.
- **Streak / daily goal** — the goal is presentations per day, from the minutes the user said
  they would study. A day counts toward the streak at ≥ 30 % of the goal (min 10), in Tehran
  local time.
- **Pace estimate** — remaining box-steps divided by expected steps per day, against the days
  to the exam date. The only thing the exam date is used for.
- **Placement** — the optional onboarding pass over the top 100 words, emitting *know* events.

## Commercial domain

- **Entitlement** — what a given account is allowed to fetch. Decided server-side; the client
  caches the answer but never authors it.
- **Free tier** — the sample the app gives away: the **free package** (first 150 words by
  rank) plus 100 presentations before the paywall appears.
- **Package** — one of exactly two content deliveries: `free` (bundled with the app) and `paid`
  (all words, one entitlement-gated file downloaded once after purchase). "Chunk" is retired.
- **Entitlement source** — where a grant came from: `zarinpal`, `manual` (owner), `bazaar`.
- **Discount code** — a server-side row that changes the payable amount at purchase time;
  percent or fixed, with a use cap, an expiry, and an optional once-per-user rule.
- **Install id** — the per-device id minted on first launch; tags every event and log record.
- **Backup** — the user-facing name for syncing the review log to the server whenever the
  device is online. Restore = log in with the phone number on any device.
- **Outbox** — the local queue of things to upload when online: review events, flags,
  beacons, error records.
- **Flag** (**گزارش اشکال کلمه**) — a structured report on one word: one of three reasons.
- **Beacon** — one of a fixed list of funnel milestones sent to our own server.
- **Error record** — a structured client error with breadcrumbs and a state snapshot, built
  so an agent can debug from it.

## Retired terms

Present in v1, deliberately abandoned. Do not reintroduce.

- **سطح / Level (7) and خوان / Sub-level (7)** — a fixed 49-step curriculum built by slicing the
  word array by index. Replaced by due-driven scheduling plus introduction rate.
- **Ban / security check** — client-side banning of users whose progress looked "too far".
  Replaced by server-side entitlement. See `docs/adr/0004-server-side-entitlement.md`.
- **Mastered (مسلط)** — replaced by *conquered*, which is a high-water-mark property, not a live
  box.
- **Station / map** — a visible finite path of word stations, designed and dropped in round 3
  of the product brief. Survives only as introduction order by rank.
- **Chunk** — replaced by *package* (ADR-0016).
