# Product brief — v2

The owner's product statement for the real build, captured 2026-09-14, plus the decoded
requirements and the decisions it forces. This is the input to the build specification that a
coding agent will execute. It supersedes nothing in `docs/adr/`; where it conflicts with an ADR,
the conflict is called out here and resolved by a new ADR, not silently.

Status (2026-09-16): **decisions substantially closed.** Rounds 1-6 below settle D1-D12 and
Q13-Q38; five product questions (Q33-Q37) and two owner-action items (SMS provider, VPS) remain.
This file is a *decision log*, not a build specification. **The build specification now exists:
`docs/spec/what.md`** (2026-09-17), with the history in `docs/spec/how-why.md`. Where this file
and `what.md` differ, `what.md` wins. ADR-0019 records the interval ladder and queue; ADR-0016
the two packages; CONTEXT.md now carries conquered / weight / high-water mark / presentation.
`packages/core/src/types.ts` still holds the superseded ladder until Phase 1 rewrites it.

---

## 1. The brief, verbatim (fa)

Recorded as written, in the owner's words, because paraphrase loses intent.

> همون طور که قبلا توضیح دادم من قبلا یه ورژن دمو با اشکالات بسیار زیاد تولید کردم که فقط
> فیزیبیلیتی استادی رو انجام بدم.
>
> میخوام توی این سشن مثل یه پروداکت منیجر که دانش فنی خیلی زیادی هم داره فکر کنی و بگی به نظرت
> چه فیچرهایی توسعه بدیم خوبه. به علاوه بگو اصلا معماریمون چی باشه دیتامون به چه شکل باشه؟ چه
> جوری بکند رو جوری توسعه بدیم که زحمت توسعه‌ش برامون خیلی کم باشه؟ (مثلا baas اوپن سورس بیاریم
> بالا به نظرت.) مثلا اپ اندروید یا سایت با pwa.
>
> لازمه کاربر پیشرفت رو حس کنه و از درست گفتن کلمه لذت ببره. پراگرسش رو بتونه بفهمه. با یه مسیر
> تموم نشدنی طرف نباشه و بفهمه دقیقا کجای مسیره. در صورت قطعی اینترنت بتونه کار رو ادامه بده.
> اگر برنامه رو پاک کرد بتونه دوباره پراگرسش رو به دست بیاره. استفاده ساده‌ای داشته‌باشه. یه
> تعداد اولیه‌ای از لغات رو به صورت رایگان دریافت کنه و برای ادامه لازم باشه خریداری کنه.
>
> به نظرم اون مدلی که قبلا زده‌بودیم دیتای خیلی خوبی داشت. هم معنی انگلیسی و ترجمه فارسی و مثال
> استفاده از لغت در جمله و ترجمه‌ش. به علاوه راهنمای یادگیری. یه آنبوردنیگ اولیه هم از
> اپلیکیشن میخوایم.
>
> من حتی فکر کردم در آینده اگر خود لغات جواب داد بریم سمت گرامر یا ریدینگ. لازمه بررسی کنی و
> بگی کاستومایز کردن اپلیکیشن برای هر رشته چه‌جوری ممکنه و چه آورده‌ای ممکنه داشته‌باشه. من از
> نظر بیزنسی هم نگرانم که سودی نداشته‌باشه. چون داوطلبان هر کد رشته اونقدر زیاد نیستن که کار
> مجزا براشون آورده داشته باشه. شاید ولی از منظر مارکتنینگی مفید باشه که داریم یه چیز کاستومایز
> نشون میدیم (مثلا ریدینگ‌ها یا ...)
>
> میخوام در این گفت‌وگو به یه دستورالعمل برای یه ایجنت برنامه‌نویسی برسیم که بدم و بتونه عملا کل
> کار رو one shot در بیاره.

---

## 2. Decoded requirements

Each is stated as a testable product requirement plus the architectural consequence. `R*` ids are
referenced from tickets and from the build spec.

### Learning experience

- **R1 — Felt progress.** The user must feel they are advancing, per session and across weeks.
  *Consequence:* the app needs a progress model with a **finite, visible denominator**, not just
  a box histogram. Streaks, session summaries, and per-word history all read from the fold
  (ADR-0002), so this is presentation, not new state.
- **R2 — Reward for a correct answer.** Answering correctly must feel good.
  *Consequence:* immediate, legible feedback — box promotion shown, "next time in N days" shown,
  micro-celebration on reaching box 5. No new persistence.
- **R3 — A finite path with a known position.** "کجای مسیرم" must have an exact answer. The path
  must not feel endless.
  *Consequence:* **this is the hardest requirement to satisfy without repeating v1's mistake.**
  v1 gave a finite path (7 levels × 7 sub-levels) by slicing the word array by index, which is
  postmortem finding #4. The replacement must give a finite, ordered path whose units are derived
  from *content properties* (exam frequency / priority tier), are stable when new words are added,
  and are keyed by word id, never by array position. See `## Open decisions` D1.
  Note the tension with CONTEXT.md's retired terms: "سطح/خوان" are retired as an *implementation*;
  a finite path is still required as an *experience*. The resolution is an ADR, not a preference.
- **R4 — Works with the internet down.** Study must continue through an outage.
  *Consequence:* already constitutional — offline-first PWA, Dexie, cached chunks (ADR-0005).
  Adds: the *purchase* and *sync* paths must degrade gracefully, not block study.
- **R5 — Progress survives deleting the app.** Reinstall must restore progress.
  *Consequence:* requires a server-side identity and the event-log sync of M4 (ADR-0002).
  Forces a decision about *when* the user is asked to create that identity — see D3.
- **R6 — Simple to use.** Low-friction, few concepts, no manuals.
  *Consequence:* argues against per-field configuration screens, against multiple study modes at
  launch, and for a single primary action on the home screen.
- **R7 — Onboarding.** A first-run flow that explains the app.
  *Consequence:* it must also *collect* the little the app needs (field code, daily goal, exam
  date) and must be skippable. Onboarding is where personalization input is captured (R11).

### Content

- **R8 — Rich word data, at v1's quality bar.** Per word: English definition, Persian
  translation, an example sentence, the example's Persian translation, and a learning hint
  (راهنما).
  *Consequence:* the current lexicon has *none* of these — `translations`, `examples`, `pos`,
  `synonyms` are empty arrays on all 250 entries, and `content/hints/` is empty. Extraction
  produced identity and frequency only. **Enrichment is a second pipeline, comparable in size to
  extraction, and it is on the critical path to a shippable product.** It also carries the
  postmortem's legal constraint: every translation, example and hint is authored fresh, never
  copied from a book. The verbatim exam stem is a separate field with a separate provenance —
  see `.scratch/stem-vocab/spec.md`.
- **R9 — Future: grammar and reading.** If vocabulary works commercially, extend to grammar and
  reading comprehension.
  *Consequence:* ADR-0008 already banked the page ranges for 4,025 reading pages and 10 grammar
  blocks without transcribing them, so this is a content job later, not a re-scan. The *data
  model* should not assume every studyable item is a word — see D2.

### Commercial

- **R10 — Free sample, then payment.** A starter set of words is free; continuing requires a
  purchase.
  *Consequence:* ADR-0004 (server-side entitlement) plus chunked content. The size and the
  *shape* of the free slice is an open product decision (D1 answers it as a side effect if the
  path is tiered).
- **R11 — Per-field customization: evaluate, don't assume.** The owner wants to know whether
  customizing per رشته is feasible and worth it, and is explicitly worried it is not
  commercially viable because each field code's candidate pool is small — while suspecting it
  has marketing value.
  *Consequence:* this is answered by data already in the repo, not by opinion. `extraction/state/routes.jsonl`
  maps every field code to the paper it sat; 1405 collapsed 81 booklets into 7 papers, one of
  which (`p01`) covers 29 field codes. The زبان عمومی section is *shared*; only Part C reading is
  per-field. So per-field vocabulary content does not exist to be built — but a per-field *view*
  over shared content does, at near-zero content cost. Written up as an ADR before it is built.

### Process

- **R12 — The output of this conversation is an agent-executable build specification.** The owner
  wants a document he can hand to a coding agent that builds the product in one pass.
  *Consequence:* the spec must be self-contained about contracts (types, schemas, API shapes,
  screen list, acceptance tests) and must not depend on chat history. Realistically it is a
  *pack* of specs with a stated build order, not one prompt — an agent can one-shot a client
  against a frozen contract, but content enrichment and infrastructure provisioning are not
  one-shot work. Stated plainly here so the expectation is set before the spec is written.

---

## 3. Open decisions

Blocking the build spec. Each becomes an ADR when answered.

- **D1 — The shape of the finite path (R3).** What is the unit the user progresses through, how
  many units are there, and how does adding next year's exam change the picture a returning user
  already has?
- **D2 — Is the studyable item a word, or a generic "item"?** Deciding now costs nothing;
  deciding after launch costs a migration of the review log (R9).
- **D3 — When is an account required (R5 vs R6)?** Account-first is simple to build and adds
  friction before any value is felt. Anonymous-first is kinder but needs a defined upgrade path
  that does not lose the local log.
- **D4 — Auth method.** Phone + SMS OTP costs money per message, needs pattern approval, and is
  the Iranian norm. Email is free and worse for this audience. A third option is an account
  identified by a recovery code with no personal data.
- **D5 — Price model.** One-off purchase, or time-bounded access sold against the konkour date.
- **D6 — Distribution.** PWA only, or PWA plus an Android package on Cafe Bazaar / Myket. The
  second reaches Iranian users where they look for apps, but store policy on selling digital
  content in-app has a direct effect on D5 and on ADR-0004.
- **D7 — Free-slice definition (R10).** Word count, and chosen by what rule.

## 3a. Decisions settled (2026-09-14)

Answered by the owner during the design interview. Each still needs an ADR before it is built.

- **D5 — Price model: one-off purchase, permanent access.** No expiry, no renewal, no
  subscription machinery. Content added in later years reaches existing buyers free, and is
  treated as a retention asset rather than a lost sale. It is also the only model that sits on
  both Zarinpal and BazaarPay without extra logic.
- **D6 — Distribution: two channels, sequenced.** Ship the PWA on `konkurleitner.com` with
  Zarinpal first, shake out the early defects against real users, then publish a **second build**
  to Cafe Bazaar as a TWA whose only difference is that it pays through BazaarPay. Rationale from
  the owner: traffic the project earns itself (Telegram, Instagram) then pays no store
  commission, while Bazaar's own search still works as an acquisition channel. Myket is out of
  scope for launch.
  - Store facts this rests on: in-app payment is mandatory in both stores for unlocking content;
    developer share is 85% under 1bn toman/year (≈77% take-home after VAT and the Shaparak fee);
    Bazaar requires the in-app price to be **equal to or lower than** the website price and
    forbids in-app links to a website for purchase; both stores document TWA support; both
    require a free portion before anything may be sold, and a free app may never later become
    paid; review takes 1-3 working days.
  - New legal lead-time item: both stores' contracts require the **شناسه الکترونیکی محتوای
    دیجیتال** from وزارت ارشاد. It joins the content-rights question as a launch gate.
- **D11 (new) — Entitlement has a pluggable source.** ADR-0004 assumed Zarinpal alone. The
  entitlement record gains `source: "zarinpal" | "bazaar-iab" | "manual"` with a verifier per
  source, from the first commit. A purchase made in the Bazaar build must be honoured in the web
  build, which makes an account a hard prerequisite for a Bazaar buyer — this constrains D3.

### Settled in round 2 (2026-09-14)

- **Deadline: konkour 1406.** The owner wants development finished early and the product selling
  in this exam season. Everything below is scoped against that.
- **D1 — ~~The path is fixed stations over a monotonic map.~~ SUPERSEDED — see round 3 below.** Words are ordered by exam value and
  cut into fixed stations whose membership is frozen in the content manifest at build time; the
  client never slices an array. **The map and the schedule are separate objects**: the schedule is
  real Leitner and may go backwards, the map is a monotonic high-water mark folded from the same
  event log and never regresses. Station size is **80-100**, not 40 (owner) — a station must not
  be exhaustible in one sitting.
  - **New requirement from the owner:** a way to revisit already-conquered words, and when the
    user discovers they have forgotten one, to put it back into learning. This costs no new state
    — a review of a conquered word is an ordinary `ReviewEvent`, and a grade of 0 drops it to box
    1 in the schedule while the map keeps it conquered.
- **D2 — The review log is keyed by `itemId`**, an opaque globally-unique id with no `type`
  field. Word ids are unchanged. New constitutional rule: ids are unique across the whole
  product, so a future grammar item cannot collide with `bear` (ADR-0013 retired the
  `bear-1` / `bear-2` form: one spelling is one entry).
- **D3/D4 — Anonymous first, phone + OTP at purchase or at an explicit "save my progress".** The
  anonymous→account upgrade **migrates the local log into the account** and never replaces it.
  The owner flagged implementation risk here; it gets its own spec section and its own tests.
- **D8 — Enrichment is an LLM pipeline with a verification pass, not a human review queue.**
  The owner's design: generate each field in isolation (one question at a time, blank context),
  tag every generated field with a confidence signal, then run a second pass over the low-
  confidence tail with a model, and hand-check only what survives that. Written up as
  `docs/plan/enrichment-pipeline.md` before it is built.
- **D7 — Launch corpus is the 8 routed years, 1398-1405.** Older years become a free content
  update later if the product earns one.
- **Content volume is deliberately late-bound.** The spec is written as far as it can go now and
  finalised after the initial scope is extracted; how many words the product covers is a product
  decision that will come from feedback. **The architecture must therefore absorb adding or
  removing several hundred words without breaking.** Consequence: the station map is regenerable
  freely until first public release and append-only afterwards.
- **D6 refinement — two builds, two origins.** The Bazaar TWA points at a separate subdomain
  (e.g. `bazaar.konkurleitner.com`) serving a build from which the Zarinpal checkout is absent.
  Not a path on the main origin: Digital Asset Links, service-worker scope and browser storage are
  all origin-scoped, and a path split leaves the web checkout reachable inside the reviewed
  package.
- **Legal — the content-rights question is resolved (owner, 2026-09-14).** Recorded as closed; the
  owner holds the detail.

### Settled in round 3 (2026-09-14) — the station map is dropped

The owner reversed D1 after seeing what it implied for the user flow. The station concept
survives **only as an internal batching rule for introducing new words**; it is never shown.

- **Nothing about stages, stations or algorithms is surfaced.** The pitch is "we fill your Leitner
  boxes intelligently; you just hit your daily goal."
- **What the user sees:** the Leitner box state on the review screen (and can browse the words
  inside each box), the count of conquered words, the percentage of the learning path completed,
  the streak in days, today's reviewed count, and a chart of daily reviews over time.
- **The daily goal is a number of word presentations (reviews), not new words**, estimated from an
  onboarding question about how many hours a day the user intends to study.
- **Introduction rate is a control law:** on average, words must enter box 1 at the same rate they
  leave into the last box, so the queue neither starves nor floods.
- **Two new hard requirements that conflict with ADR-0003 as written:**
  1. **The app must never tell the user to stop.** If they want to study for another hour, there
     must always be something to show. "You have finished today's reviews" is forbidden.
  2. **No 30-day floor.** The current ladder (10m/1d/3d/7d/21d) makes mastering a word take at
     least 32 days. A candidate with three weeks left must not be structurally unable to finish.
     This needs a replacement design, not a parameter change.
- **A skip-ahead control:** a button that sends a word the user already knows straight to the last
  box.
- **Free slice is usage-shaped, not content-shaped (owner):** the paywall appears after **100 word
  presentations**, independent of how many distinct words those covered.
- **Later feature, recorded so it stops competing for attention:** a 30-day streak earns a 50%
  discount code the user can give to someone else.
- **The ارشاد digital-content identifier is deferred**, not dropped — it blocks only the Bazaar
  build, which is phase two. Revisit when Bazaar development starts.
- **Still live despite the map being dropped:** the percentage metric needs a denominator, so the
  question of what happens to a user's percentage when the corpus grows is unchanged.

### Settled in round 4 (2026-09-14)

- **Q21 accepted — one unlimited queue, promotion requires the interval to have elapsed.** Due
  words first, then not-yet-due soonest-due first, then conquered words. Every answer is logged;
  the fold decides. A correct answer given early does not promote; a wrong answer always demotes.
- **Q22 accepted — "I already know this" sends a word straight to the last box**, plus a bulk
  placement pass over the ~100 highest-frequency words during onboarding (first thing to cut if
  the schedule tightens).
- **Q23 accepted — two gates with different jobs.** The free content chunk (~150 highest-value
  words) is the hard, server-side boundary per ADR-0004; the 100-presentation counter is the soft,
  client-side trigger that decides when the paywall screen appears.
- **Q25 accepted — onboarding asks hours/day, exam date, field code (skippable), and offers the
  placement pass (skippable).**
- **Hitting the daily goal congratulates and *suggests* a break** — "برای یادگیری بهتر بهتره وقفه
  بندازی" — and then lets the user carry on. It never blocks.
- **The minimum time to conquer a word is one week, not a month (owner).** The gamification must
  not be broken by making the user wait. Strict Leitner is a model to follow as far as it is
  useful, *not* a commitment to honour at the cost of stalling the user. Making a fast conquest
  *possible* is required; making it *likely* is not — display priority should make it uncommon in
  practice.
- **Progress is weighted by exam frequency (owner).** The denominator is the total number of exam
  occurrences across the corpus, not the number of words: a word that appeared 5 times is worth 5
  toward the total. A word's own contribution is earned in fifths, one per Leitner box, so box 5
  pays its full weight. The rule is shown to the user rather than hidden, and it makes early
  progress visibly faster because the corpus is ordered by exam value.

### Settled in round 5 (2026-09-14)

- **Q29 — selection is weighted random among words that are already due.** Eligibility always
  comes from the clock; randomness only orders the eligible set. Weight rises with how overdue a
  word is and slightly favours lower boxes, with a hard suppression window that never repeats a
  word within the last N cards. Two rules carried from the v1 read: **weight per word, never per
  box** (v1's weights were per box and unnormalised, so its intended 8.5:1 gradient was actually
  1.5:1), and the suppression window must not switch itself off when the pool is small, which is
  where v1's thin-box rule failed. This is also what makes a 7-day conquest reachable but
  uncommon: the word must be drawn promptly on all four occasions it comes due.
- **Q30 — the app shows a pace estimate against the exam date.** Remaining box-steps divided by
  the daily goal, compared with days remaining until the exam, nudging the goal when the estimate
  overshoots. Two fixes to v1's version: use the user's observed accuracy rather than assuming no
  future errors, and smooth over a rolling window so one bad day does not spike it. This is also
  the paywall's strongest argument.

### Settled in round 6 (2026-09-14)

- **Q26 — displayed progress never decreases.** The percentage is computed from each word's
  **high-water mark box**, so a lapse re-queues the word for review without taking progress away.
  The live box state stays visible in the Leitner view, which is where the honest picture lives.
  "فتح‌شده" means *has ever reached the last box*.
- **Q27 — decided by Claude on the owner's instruction.** Weight is `stats.timesTested` — tested
  occurrences only, answers and distractors alike — at **raw count**, so a word that appeared five
  times is worth five. Stem-context occurrences are excluded: they carry no answer-key signal and
  would inflate the denominator with words the exam never tested. Progress is
  `Σ(highWaterBox / 5 × weight) / Σ weight`.
  - Raw count wins because the rule has to be stated to the user in one sentence, and "هر بار که
    یک کلمه در کنکور آمده، یک امتیاز" is that sentence. Answer-weighting and dampening both cost
    that.
  - Implemented as a single pure function `wordWeight(stats)` in `packages/core`, so the shape can
    change without touching anything else. **Decision rule for later:** once the real frequency
    distribution exists, check whether the bottom half of words by weight carries less than ~25% of
    the total. If it does, the endgame will feel dead and the weight switches to a dampened form
    (`√n` or `1+log n`). This is a measurement, not a preference.
- **Q28 — one interval ladder for everyone**: 10 min → 1 day → 2 days → 4 days → 8 days, giving a
  7.0-day floor to conquer a word. The exam date is collected **only** to suggest how much time
  per day the user should commit; it never changes intervals.
- **Q31 — a review is self-graded recall, English→Persian.** Show the English word, the user
  recalls, reveals, and taps بلد بودم / بلد نبودم. Multiple choice exists only in real-exam mode.
  Rationale is throughput: a self-graded card is 3-5 seconds, so a 100-review goal is 5-8 minutes;
  a multiple-choice card is 10-15 seconds and the pace model from Q30 stops working.
- **Q32 — no notifications at launch.** Retention runs entirely on in-app state (streak, daily
  goal, pace estimate), all of which work offline. **Architectural rule: notifications are a bonus,
  never a mechanism** — nothing the retention model depends on may live outside the device. See
  `wiki/web-push-in-iran.md`.

### Price (owner, 2026-09-14)

**290,000 toman, one-off, permanent access.** List price 450,000 with 290,000 as the launch price,
following the local norm where a page without a visible discount looks broken. Anchored below the
price of a single vocabulary book (450,000-550,000 after discount, and candidates buy two or
three), and against an exam registration fee of 705,000 the same candidate has already paid. See
`wiki/market-and-pricing.md`.

Rough first-season shape at that price: ~520k candidates, 1-3% reaching an install for an unknown
first-year app, 3-6% of those converting — on the order of 150-900 sales, 40-260 million toman. A
real return for one season, not a living. Season two is where the number moves, which is the
argument for shipping in Aban rather than waiting for 1407.

### Settled in round 7 (2026-09-16)

- **Q33 — measure the funnel.** Cohort queries over synced review events for registered users,
  self-hosted Umami on the same VPS for the site, and a **first-party milestone beacon** from the
  app: a fixed, documented event list (`first_open`, `onboarding_done`, `first_review`,
  `reviews_10`, `paywall_shown`, `purchase_started`, `purchase_done`), sent to our own origin with
  a random install id and queued while offline. The event list is fixed in the repo, never
  free-form. It stays inside ADR-0005 because no third party is involved. Without it the pre-paywall
  drop-off is invisible, which is the number that separates "wrong product" from "wrong price".
- **Q34 — real-exam mode ships in the demo as specified** (one complete past paper, free, timed,
  scored, with missed words offered into the deck), but **where and when it sits in the product is
  deferred**. Inferred answer keys are not a concern for the owner — they will be reconciled
  against Sanjesh's published keys later.
  - **Later feature, recorded now:** a test unlocks once the user has reviewed all of its words,
    and the app tells them «یک آزمون جدید داری که بلدی». Note this must be an in-app signal, not a
    push notification, per Q32.
- **Q35 — every word gets a generated example sentence; the verbatim exam stem is an addition, not
  a replacement.** The reasoning, from the owner and confirmed against the corpus: a distractor
  never appears in a sentence — the stem's blank takes the key — so for a distractor-only word
  there is no exam sentence to show. **185 of the current 250 lexicon entries (74%) are
  distractor-only.** Even for the quarter that were answers, a freshly authored example is still
  generated, so every word has a sentence of the same provenance and quality.
  - This **enlarges** the enrichment pipeline rather than shrinking it, and it sharpens CLAUDE.md
    rule 4: the stem is the example *for answer-words*, alongside the authored one.
  - Card layout: reveal shows translation plus a sentence; definition, hint and exam history behind
    one tap; the exam badge («۴ بار در کنکور، آخرین بار ۱۴۰۳») on the front, under the word.
  - **v1's hint template (`قالب / تداعی / جمله کمکی`) is kept verbatim** — proven, and a fixed set
    of slots is what makes the two-pass agreement check from Q16 possible at all.
- **Q36 — error reports and support live in PocketBase.** A collection carrying word id, field,
  the user's note and the app version, reviewed in the admin UI, with a manual entitlement-grant
  screen built at the same time.
- **Q37 — the exam date passing triggers a season summary**, not silence and not a reset: a prompt
  to update the date, the season's numbers (words conquered, days studied, reviews done), and at
  that moment the referral code and a request for a Bazaar review. Every figure already exists.
- **Q41 — the app's Persian name is deferred** (owner, 2026-09-16). The spec pack uses a
  placeholder and must name the exact set of places it appears — manifest, TWA package id,
  onboarding copy, store listing — so renaming later is a single mechanical change.
- **Q36 (revised, settled 2026-09-17) — a report is a structured flag, not a form.** The user taps
  «این کلمه اشکال داره» and picks one of three reasons (ترجمه اشتباهه / مثال اشتباهه / راهنما
  بی‌ربطه). The flag rides **the same outbox as review events** — no new transport, no second
  offline queue, no free text to moderate, no abuse surface beyond what sync already carries. The
  owner reads it as a query.
  - *Why not Telegram from the client:* a bot token in the app violates constitution rule 5, and
    `api.telegram.org` is a foreign host most Iranian users cannot reach (ADR-0005's reasoning), so
    reports would fail silently for exactly the target audience. Any Telegram path still has the
    client talking to PocketBase first, which makes Telegram a *notification* layer rather than a
    storage decision.
  - *Why structured beats prose:* "eleven people say this translation is wrong" tells the enrichment
    pipeline which word to regenerate; a paragraph does not. And the flag carries a **word id**,
    which a screenshot in a chat never does.
  - *Why it matters at all:* the Q5 answer ships words whose only quality gate is an automated
    agreement check, in a product people paid 290,000 toman for. The flag is the safety net under
    that decision.
  - **Owner notification is deliberately deferred.** At launch scale the flags will trickle; a
    nightly digest or a `pb_hook` Telegram relay is an isolated addition later, by which time we
    will know whether the VPS can reach Telegram at all.
- **Q39 — the owner is starting the SMS panel purchase now; the VPS follows shortly.**
- **Q40 — the ADRs and the spec pack are written before any production session starts.** A
  decision log records what was chosen; a builder needs type signatures, JSON schemas, screen
  states and acceptance tests. The gap between the two is where an agent improvises, and
  improvisation is what produced v1.

### Measured, 2026-09-17 — the deferred unknowns are now known

Extraction completed years 1398-1405. **58 papers, 1,776 distinct lexicon entries.** The estimates
that several decisions were made against can now be replaced with counts.

- **Corpus size: ~1,776 words**, at the low end of the 1,500-2,700 band projected from a single
  year. The denominator the user sees is effectively settled.
- **Cross-year repetition is low.** `distinctYears` is 1 for 1,518 entries (85%), 2 for 207, 3 for
  44, 4 for 6, and 5 for exactly one word. **Only 15% of words were tested in more than one year.**
  - *Product consequence:* «این کلمه ۴ بار در کنکور آمده» is a rare claim, not the usual one. The
    exam badge must be designed for the common case — «۱ بار در کنکور، سال ۱۴۰۲» — which is still
    specific and true, and still something no competitor can say. Copy written for the rare case
    will look thin on 85% of cards.
- **The Q27 decision rule fires, and raw weight survives it.** The rule was: switch to a dampened
  weight if the bottom half of words by weight carries under ~25% of the total. Measured, the
  bottom half carries **34.3%**, so the endgame will not feel dead and **raw `timesTested` stands**.
- **Weighting still does the job the owner wanted, roughly doubling early progress.** `timesTested`
  is 1 for 1,341 entries (75%) with a thin tail out to 11, total weight 2,586. Because the corpus
  is ordered by exam value, the **top 20% of words carry 42% of the total weight** — so a user a
  fifth of the way through the ordering is 42% of the way through the percentage, against 20% under
  a plain count. Front-loaded, as intended, without a dampening function.

## 4. What this becomes

1. ADRs for D1–D7 as each is answered.
2. `docs/plan/enrichment-pipeline.md` — the R8 pipeline, modelled on `extraction/`.
3. `docs/spec/` — the agent-executable build specification pack (R12), written only after the
   decisions are closed.
