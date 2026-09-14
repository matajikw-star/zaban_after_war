# Product brief — v2

The owner's product statement for the real build, captured 2026-09-14, plus the decoded
requirements and the decisions it forces. This is the input to the build specification that a
coding agent will execute. It supersedes nothing in `docs/adr/`; where it conflicts with an ADR,
the conflict is called out here and resolved by a new ADR, not silently.

Status: **brief captured, decisions open.** Do not start building against this file until
`## Open decisions` is empty or explicitly deferred.

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

## 4. What this becomes

1. ADRs for D1–D7 as each is answered.
2. `docs/plan/enrichment-pipeline.md` — the R8 pipeline, modelled on `extraction/`.
3. `docs/spec/` — the agent-executable build specification pack (R12), written only after the
   decisions are closed.
