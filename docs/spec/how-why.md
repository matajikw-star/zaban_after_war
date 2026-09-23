# HOW and WHY — how the design got this way

The companion to `what.md`. That file says what the system is; this one says how it came to be
and why each shape was chosen over the alternatives. It is a narrative, appended to as decisions
are made, and it never has to be "current" — history does not go stale. When a decision is big
enough to be reversible only at real cost, it also gets an ADR in `docs/adr/`; this file links
to it rather than repeating it.

Reading order for a newcomer: `CLAUDE.md` → `what.md` → this file → the ADRs it points at.

---

## 1. Where it started

A first build (v1, `starting-pwa-on-zaban`) proved that students would use a Leitner app for
konkur vocabulary and that the box metaphor reads well. It also had no spacing, wiped history on
level-up, merged devices by guesswork, shipped the paid content to everyone, loaded React from
foreign CDNs, ran on a free backend that deleted itself, and used a copyrighted book's word
list. `docs/postmortem-v1.md` reads it closely. Every one of those became a rule in v2's
constitution, which is why the constitution exists at all.

The asset of v2 is different in kind: the words that were **actually tested** in the exam,
extracted from the scanned papers, with fresh translations, examples and hints. That extraction
was the first half of the project (`extraction/`, ADR-0006 to ADR-0013) and produced 2,098
entries across 58 papers (1398–1405) before any application code was written. The product's
claim — «این کلمه در کنکور ۱۴۰۲ آمده» — is the reason for that order.

## 2. The design interview (2026-09-14 to 2026-09-17)

`docs/plan/product-brief.md` is the decision log of seven rounds between the owner and Claude.
The decisions that shape the engine and the business, in the order they were forced:

- **One-off permanent purchase**, no subscription — the only model that sits on Zarinpal and
  BazaarPay alike with no extra logic, and the one a student buying a book already understands.
- **PWA first, Bazaar second**, as two builds on two origins — traffic the project earns pays no
  store commission; the store build differs only in payment.
- **Anonymous first, phone at purchase** — the app must feel valuable before it asks for
  anything. The cost is that anonymous progress is not backed up; the mitigation is a gentle
  «ذخیرهٔ پیشرفت» prompt after 50 presentations.
- **The station map was tried and dropped.** A visible finite path of 80–100-word stations was
  designed in full and then reversed when the owner saw the flow it implied. What survived is
  the internal rule that new words are introduced in exam-value order. The user sees boxes,
  a percentage, a streak and a chart — never an algorithm.
- **The app never says "done".** Strict Leitner would empty the queue; the owner's requirement
  is that a student who wants another hour always has cards. Hence the four-pool queue
  (due → new → conquered-due → early) where the last pool is always non-empty.
- **No 30-day floor.** ADR-0003's 10m/1d/3d/7d/21d ladder made conquest take 32 days; a
  candidate with three weeks left would be structurally unable to finish. The ladder became
  10m/1d/2d/4d/8d (7-day floor). Promotion still requires the interval to have elapsed, so a
  7-day conquest is possible but uncommon. ADR-0019 supersedes ADR-0003.
- **Progress never decreases** (high-water-mark box) and is **weighted by exam frequency**
  (`timesTested`, raw). The rule had to fit one sentence for the user, and it does. Measured
  on the real corpus: the bottom half of words carries 34 % of the weight, so the endgame is
  not dead; the top 20 % carries 42 %, so early progress feels fast.
- **Self-graded recall, English → Persian.** A 3–5 second card makes a 100-review goal a
  5–8 minute session; multiple choice would triple it and break the pace model.
- **Two gates.** The server-side content boundary (150 free words) and the client-side soft
  trigger (100 presentations) do different jobs and are deliberately separate.
- **No notifications at launch.** Web push in Iran rides a Google socket that cannot be
  proxied and has been cut before (`wiki/web-push-in-iran.md`). Retention lives inside the app.
- **Word data is sense-shaped** (ADR-0012) and **one spelling is one entry** (ADR-0013),
  because the card's front is just the word.
- **Reports are structured flags, not free text** — a word id and one of three reasons tells the
  content pipeline what to regenerate; a paragraph does not.

## 3. The development plan session (2026-09-17)

The owner handed over the whole technical side with a brief: reliability first, then
correctness, then cost; simple debuggable code; ready-made components wherever possible; a
management panel with user reports and bug logs; discount codes; the app on a subdomain, not the
root; an install prompt on phones; offline from install to the end of life; as native as a PWA
can be, with an APK if possible; and a design that does not look "vibe-coded". Three
corrections arrived during the session: questions are asked in English, the domain is
`konkurleitner.com` (not `konkour…`), and logging must let an AI fix bugs unaided. Two
additions: progress is backed up whenever online and the network must never interrupt the user
outside signup/login/payment; and the word list is delivered exactly twice — free and paid.

What was decided, and why:

### 3.1 Two documents instead of one growing log — ADR-0014

The docs had become a chronological pile: brief, rounds, ADRs, plans, each true at the time.
Adding a feature or debugging meant reading all of it to learn the current state. The owner asked
for a "what" that is always current and a "how/why" that explains it. So: `what.md` is
normative and edited in the same commit as any system change; this file and the ADRs are
history and are appended to. `roadmap.md` and `infrastructure.md` are superseded by
`implementation-plan.md` and `what.md` §14 and carry a banner saying so; they are kept because
their reasoning is still right.

### 3.2 Three origins: landing, app, admin — ADR-0015

The owner wants the app off the root domain. Doing it properly means three origins, not paths:
the service worker's scope and IndexedDB are origin-bound, so a landing page under the app
origin would be inside the SW's cache and the app's storage; Android asset links are declared
per origin; and the PocketBase admin UI must not be reachable from the origin users hit. The
admin subdomain also gives the dashboard and the PB admin UI one place with one login.

### 3.3 The APK is a TWA, built at launch, offered as a download — ADR-0015

The owner asked for an APK "if possible". Three ways exist: TWA (Chrome renders the PWA inside
an Android shell; ~zero app code), Capacitor (a real WebView; our code is bundled; every app
update is a store update), or a native rewrite. TWA wins on every axis the owner ranked —
reliability (Chrome's engine, our tested PWA, one codebase), correctness (identical behaviour to
the web build), cost (a config file) — and it is what Bazaar documents. The cost is Chrome
dependence; `fallbackType: customtabs` degrades gracefully, and the landing page offers the PWA
install as the other path. Offering the APK at launch rather than only in Bazaar costs nothing
extra and reaches users who distrust "add to home screen".

### 3.4 Content ships as two packages — ADR-0016

The earlier plan chunked the paid content into N downloads for resumability. The owner asked for
two deliveries: free and paid. Two packages are simpler in every place that matters — one gated
route, one hash, one atomic swap, one "downloaded or not" state — and the resumability concern
is solved at the transport level with HTTP `Range`, which the client already needs for unstable
connections. The paid package contains the free words too, so the client has one active package
and a content update is one file.

### 3.5 Backup is the event-log sync, presented as backup — ADR-0002, `what.md` §7.4

The owner's requirement — offline everything, back up whenever online, never interrupt — is
exactly what ADR-0002's append-only log was designed for; there is no new mechanism, only the
discipline that the sync state machine never blocks anything and is invisible unless it fails
for a long time. Two consequences were made explicit: anonymous installs are not backed up (no
identity to restore to), and login on a device with local history merges by re-pushing
everything (idempotent by id) rather than by any comparison logic. The word "backup" is used
in the UI and in this doc because it is the user's mental model; "sync" is the implementation.

### 3.6 Logging for an AI debugger — ADR-0017

The owner is not a developer; the log is the bug report. Third-party error services are out
(ADR-0005, and Sentry SaaS is unreachable for the audience; self-hosting GlitchTip is a second
database and a Python process on a small VPS). A first-party record sent through the same
offline outbox as everything else costs one collection and one route. What makes it AI-fixable
is not the stack but the **context**: breadcrumbs of the last 50 actions, a snapshot of the
engine's inputs (last 20 events, package version, goal), and symbolication against source maps
uploaded at deploy. The `pnpm errors` tool turns a record into a readable report in one command,
which is the interface the agent uses. The runbook makes the procedure repeatable.

### 3.7 Admin = PocketBase's UI plus a thin dashboard — ADR-0018

PocketBase already ships a mature admin UI for every CRUD job the owner has (users, grants,
codes, viewing reports and errors, backups, logs). Rebuilding it would be weeks of new code
guarding money. What it lacks is aggregation: sales, funnel, flags per word, errors per
fingerprint. A four-page read-only dashboard over one stats route covers that. Chosen over a
fully custom panel on the owner's priorities (reliability, then cost).

### 3.8 Discount codes are validated and applied on the server — `what.md` §8.3

Every price the client shows is a display; the server computes `payable` from `app_config` and
the code at `request` time and verifies the same amount with Zarinpal. A 100 % code grants
without touching the gateway, which is also the mechanism for gifts and testers. The 30-day
streak referral code from the brief is just a code row created by a cron later.

### 3.9 Parspack, no Umami, Kavenegar

Parspack because the owner already has an account there — the machine spec is identical
elsewhere and one fewer identity verification matters more than marginal price. Umami dropped at
launch because it is a second process and database on the VPS for page-view charts the
first-party beacon already implies; revisit if marketing needs it. Kavenegar for SMS because its
Verify Lookup path needs no dedicated line and its template approval is the fastest known; the
provider is behind one interface so swapping is one file.

### 3.10 Launch scope: core + payment, no real-exam mode

Every feature that is not on the path from install to purchase to offline study was moved after
launch: real-exam mode, per-field views, Bazaar, referral, season summary stays (it is a screen
over existing numbers). Less surface is more reliability, which is the owner's first priority.

### 3.11 Design system deferred to the owner's choice

A list of reference systems was given rather than a mockup, at the owner's request. The tokens
are the only styling until a system is chosen; one mockup screen is approved before app code.
The fixed constraints (mobile-first, RTL, one primary action, no clutter) do not depend on it.

## 4. Things considered and rejected in this session

| Idea | Why not |
|---|---|
| Backing up anonymous progress under the install id | No identity to restore to; adds a server-side merge path for no user benefit. |
| Self-hosted Sentry / GlitchTip | A second database and process on a 4 GB VPS, for a stack trace we can symbolicate ourselves. |
| Capacitor / native Android | Every release becomes an APK release; a second test surface; the owner ranked cost third but reliability first, and one codebase is more reliable. |
| Chunked paid content (N files) | Solved resumability at the wrong layer; the owner asked for two deliveries. |
| Redux / TanStack Query / GraphQL | The app has four stores and one server; ceremony without benefit. |
| Docker on the VPS | One Go binary and Caddy; a container runtime is a larger surface than the app. |
| PocketBase's built-in email OTP for auth | It sends email; phone OTP needs a custom route anyway, so the whole flow is ours and testable with a console provider. |
| Telegram bot from the client for reports | Token in the client (rule 5) and `api.telegram.org` unreachable for the audience. |
| Expiring entitlements / DRM on the paid file | Permanent purchase is the product; a paid user's device holds the content by design (ADR-0004). |

## 5. The build start (2026-09-18)

The owner handed over the whole build in one instruction: take the system in `what.md` from the
scaffold to a downloadable APK, orchestrating cheaper agents for routine code and stronger ones
for the engine and the state machines, testing every part, and keeping the code easy to change
because the product is early. Decisions made at the start:

- **Design system chosen** — ADR-0020: shadcn/ui components with a liquid-glass look, Sonnat
  typography and RTL rules, monochrome palette with colour only on the grading buttons, light
  and dark themes. Vazirmatn stands in for Sonnat's commercial IRANSans.
- **OTP is developed in full but tested with a mock.** Kavenegar cannot send to anyone but the
  owner until identity verification completes, so `SMS_PROVIDER=mock` accepts the fixed code
  `123456` and the real provider is switched on by one environment variable. The mock is never
  the default in production configuration.
- **Hints ship as a placeholder.** No hint data exists yet; the card shows a collapsed
  «راهنمای یادگیری» disclosure that says the hint is coming, so the UI does not change shape
  when hints arrive.
- **Content ships incomplete by design.** Packages include only words with written senses
  (895 of 2,098 on this date) and grow with content updates, as §6.2 already allowed.
- **Dependency versions are pinned to what the registry served on 2026-09-18** and recorded in
  each `package.json`; a line per new dependency is added below as they are introduced.

### 5.1 Dependencies added by the scaffold (ticket dev-foundation/01)

| Dependency | Why |
|---|---|
| `react`, `react-dom` 19 | §4. |
| `vite`, `@vitejs/plugin-react` | §4; Vite is the build for all three apps. |
| `tailwindcss`, `@tailwindcss/vite` v4 | §4; tokens through `@theme`. |
| `vite-plugin-pwa` | Workbox precache and the prompt-style update (§7.7). |
| `react-router` | The one flat route table (§4). |
| `zustand` | Four small stores (§4). |
| `dexie` | IndexedDB (§7.3). |
| `uuid` | UUIDv7 ids (§4). |
| `date-fns`, `date-fns-jalali` | Jalali dates in onboarding and the season summary. |
| `lucide-react` | Icons, tree-shaken. |
| `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge` | The shadcn/ui pattern (§7.9). |
| `fast-check` | Property tests for the engine (§16.1). |
| `@vitest/coverage-v8`, `vitest` (in `packages/core`) | The engine's 100 % line-coverage report (`pnpm --filter @kl/core coverage`). |
| `@playwright/test` | E2E (§16.2). |
| `@types/react`, `@types/react-dom` | Types for React 19; React ships none itself. |

Versions as the registry served them on 2026-09-18, pinned exactly (no `^`) in each
`package.json`: vite 8.3.0, `@vitejs/plugin-react` 6.1.1, react / react-dom 19.3.0,
`@types/react` / `@types/react-dom` 19.3.0, tailwindcss / `@tailwindcss/vite` 4.3.3,
vite-plugin-pwa 1.3.0, react-router 8.4.0, zustand 5.0.15, dexie 4.4.6, uuid 14.0.2,
date-fns 4.4.0, date-fns-jalali 4.4.0-0, lucide-react 1.47.0, radix-ui 1.6.7,
class-variance-authority 0.7.1, clsx 2.1.1, tailwind-merge 3.7.0, `@playwright/test` 1.63.0.
fast-check 4.10.1 is a devDependency of `packages/core` (the only package with property tests);
everything else belongs to the app that uses it, never to the root. TypeScript stays on 5.9.x:
7.0 shipped, and moving the whole workspace onto a rewritten compiler is a change to make on
its own, not inside a scaffold.

### 5.2 Things the scaffold had to decide (2026-09-18)

- **Apps are not `composite`; packages are.** A Vite app emits nothing, so making it a
  `tsc --build` project buys only stale `.tsbuildinfo` files. Root `typecheck` therefore runs
  `tsc --build --force` for `packages/*` and then `pnpm -r --if-present typecheck` for the apps,
  each of which runs `tsc --noEmit -p .`. One command still checks everything.
- **Playwright's Chromium cannot be downloaded from Iran.** `cdn.playwright.dev` answers
  `403 … not available in your location` — the same filtering the product exists to work
  around. CI runs outside Iran and downloads it normally; locally, `KL_E2E_CHANNEL=msedge`
  (or `chrome`) makes Playwright drive the Chromium already installed on the machine. The
  browser under test is Chromium either way, which is what the audience runs.
- **The app name is substituted by a small Vite plugin, not by Vite's `%VITE_*%` mechanism.**
  Vite only substitutes variables that are set, and `VITE_APP_NAME` is deliberately unset until
  the owner picks the name (§19); the plugin applies the fallback from `apps/web/src/strings.ts`
  so the HTML title, the web manifest and the UI can never disagree. `apps/landing` repeats the
  fallback literal because it cannot import from `apps/web`; when the name is decided, setting
  `VITE_APP_NAME` in the environment retires both copies.
- **Vazirmatn is committed, not fetched.** The three woff2 files (400/500/700) and `OFL.txt`
  sit in `packages/design/fonts/`, about 150 KB, from the upstream release `v33.003`. A build
  that can be done offline is worth more than a clean `git` tree here (ADR-0005).
- **The bundle budget counts only `.js` and `.css` under `apps/web/dist/assets`**, excluding
  sourcemaps and any `content/` package: those are not part of the shell a user downloads to
  start. The scaffold measures 69.2 KB gzipped against the 300 KB limit.
- **PocketBase is pinned to 0.40.2**, the version `what.md` §4's floor was written against and
  one that exists upstream; 0.40.4 was the latest on this date. Bumping it is a one-line change
  to `server/POCKETBASE_VERSION`, which CI, the deploy script and a local run all read.
- **`deploy` is invoked as `pnpm run deploy`.** `pnpm deploy` is one of pnpm's own
  subcommands and shadows a workspace script of that name. The script keeps the name the
  spec gives it rather than being renamed around a package manager's namespace; the two
  places that call it say `run`.
- **Biome needed two configuration changes, not source changes**: `css.parser.tailwindDirectives`
  so `@theme` parses, and `!.claude` in `files.includes` so a nested agent worktree does not read
  as a second root configuration.

### 5.3 The content package builder (2026-09-18)

- **`packages/content/ranks.json` freezes rank across builds, not just within one.** The
  builder (`packages/content/src/build/`) only ever appends: an id already in the file keeps
  its rank forever, whatever `stats.priority` says about it on a later run. The alternative —
  recomputing rank from `stats` every build — was rejected because rank is what `ContentItem`
  keys introduction order on (`what.md` §5.1), and a user's Leitner state is keyed by id;
  silently reshuffling introduction order would be the same bug the old app had slicing
  `words[]` by index (`CLAUDE.md`, "Word ids"), just one layer up.
  - **The free-150 boundary can shift by one word as word data completes.** A word ships only
    once it has `senses` (895 of 2,098 as of this date); when a higher-`priority` word gets its
    senses written later, it is still appended to `ranks.json` *after* every word already
    ranked, including lower-priority words that shipped earlier. So the 150 lowest-rank
    shipping words are not guaranteed to be the 150 highest-priority words in the final
    lexicon — only in the limit, once every word has senses. This is accepted rather than
    "fixed" by re-ranking, because progress is keyed by id: nothing is lost when the boundary
    moves, a word just moves from `free` to `paid` or back between content updates.
- **Two lint scoping calls, both because the checklist (`docs/plan/content-pipeline.md`) was
  written before the corpus existed to test it against:**
  - Check 1 ("every `testedWord` resolves to a lexicon file") is scoped to `vocabulary` and
    `cloze` parts. `grammar`-part questions are transcribed into `content/exams/` like the
    others, but CLAUDE.md rule 5 keeps grammar out of the lexicon on purpose — its
    `testedWord` names a grammar point (a preposition, a verb form), not a memorizable word,
    and running the check unscoped reports 358 non-issues for every real one.
  - Check 4 ("every entry has senses, translations, examples, occurrences") only examines the
    `senses`/translations/examples parts for an entry whose `senses` is already non-empty.
    1,203 of 2,098 entries are mid-pipeline (word data not yet written, per
    `extraction/WORD-DATA.md`) and that is not a defect; `occurrences[] ≥ 1` still applies to
    every entry, pipeline stage notwithstanding.
### 5.4 Dependencies added by the app shell (ticket dev-web/01, 2026-09-18)

Two devDependencies of `apps/web`, both only for `vitest`. No runtime dependency was added: the
shell is built entirely from the list in §5.1.

| Dependency | Version | Why |
|---|---|---|
| `happy-dom` | 20.14.5 | The app's unit tests touch the DOM — the theme attribute, the error-capture handlers, `matchMedia`, `navigator` — and `packages/core`'s `node` environment has none of it. Chosen over `jsdom` because it starts in about a third of the time and this suite runs on every commit; nothing here needs jsdom's stricter spec coverage. |
| `fake-indexeddb` | 6.2.5 | `db/repo.ts` is worth testing against a real IndexedDB rather than a mocked Dexie, because the round-trips it gets wrong are index queries (`where('synced').equals(0)`), which a mock would not model. Loaded as `fake-indexeddb/auto` from `apps/web/vitest.setup.ts`, before any module that constructs the Dexie instance. |

Consequence: the root `vitest.config.ts` became a two-project configuration — `packages` in the
`node` environment, `apps/web` in `happy-dom` — so one `pnpm test` still runs everything.

### 5.5 Things the app shell had to decide (2026-09-18)

- **A dev fixture stands in for a missing `free.json`.** `apps/web/public/content/free.json` is
  written by `pnpm content:build` and is git-ignored, so a fresh clone has no content at all and
  every screen would be empty. `apps/web/src/content/sample-package.json` holds twelve words that
  the content store falls back to when the fetch 404s, behind `import.meta.env.DEV` so Vite folds
  the branch away in a production build (verified: neither the fixture nor its strings appear in
  `dist`). The fallback logs a breadcrumb naming itself, so it can never be mistaken for real
  content in a log.
- **A missing content package is reported, not fatal.** Bootstrap catches the content step and
  mounts anyway. Blanking the app would also take away settings, progress and the review log the
  user already has, and a package that failed to load is a broken build, which the error record
  now says plainly.
- **`WordCard` and `ContentPackage` are duplicated into `apps/web/src/content/types.ts`**, copied
  verbatim from §6.1, because `packages/content` was being built in parallel and did not export
  them yet. The file says to delete it and switch to the `@kl/content` export the moment it lands.
- **`net/pocketbase.ts` was dropped from §7.1.** The app calls our own routes (§8.2) and never
  PocketBase's collection API, so the SDK instance the shape diagram promised has no caller.
- **The error fingerprint falls back to djb2 when Web Crypto is absent.** §10.1 asks for
  sha1(kind + message + top stack frame); `crypto.subtle` is missing on an insecure origin and in
  some test environments. The fallback digest is prefixed `djb2-`, so a record built without
  crypto is visible as such in the data rather than passing as a short sha1.
- **`engine/index.ts` is the one `index.ts` in `apps/web/src`.** §17.1 bans barrel files; this is
  not one — it holds the bound engine functions themselves rather than re-exporting other modules.
  Every UI primitive is imported by its own file, with no `ui/index.ts`.
- **The Dexie table fields use `declare`, not `!`.** With `useDefineForClassFields` (ES2022
  target) a definite-assignment field is defined as `undefined` on the instance and shadows the
  table objects Dexie installs. This cost an afternoon in the predecessor project; it is written
  down here so it does not cost a second one.
- **The duplicated `WordCard` is gone.** `packages/content` now exports the §6.1 shapes, so
  `apps/web/src/content/types.ts` was deleted and every importer takes `WordCard`,
  `ContentPackage` and `PackageId` from `@kl/content`. What was left of the file — the
  `/api/content/manifest` response of §8.2, which is about content without being content — moved
  to `apps/web/src/content/manifest.ts` and kept its name honest.
- **Only the first blank of a multi-blank stem is filled.** 75 of the 1,085 transcribed stems
  have two or more `.....` markers, because the paper tested two words in one sentence. The card
  cannot know that its lemma belongs in the second gap, so the later gaps render as empty
  underlines rather than repeating the word in a place it may not go.
- **The card's exam sentence is pinned, not picked.** `primarySentence` takes the answered stem
  with the highest year and breaks a tie on `paperId` then `questionNo`. Any unordered choice
  would mean the same word showing a different sentence on the next review, which reads as a bug
  even when it is not.
- **A sense with no translation sinks to the end.** Word data is 895 of 2,098 words, so a
  half-filled card exists today. Leading with an untranslated sense would show a back with
  nothing on it; `orderedSenses` puts the translated senses first and keeps the build's order
  among them.
- **The paywall count is written to `kv` before the navigation, and the "already shown" flag is
  per session.** The count is durable so a reload cannot buy another hundred words; the flag is
  in the session store so «بعداً» genuinely returns the user to studying (§7.8) instead of
  bouncing them back to the paywall on the next card. A `freePresentationLimit` of 0 disables the
  paywall, which is how server config turns it off without a build.
- **The presentation that triggers the paywall shows no feedback.** It navigates straight to
  `/paywall`. Printing «دفعهٔ بعد» and then moving the screen out from under it was worse than
  losing one box animation.
- **Beacons fire on a crossing, not an equality.** `reviews_10` asks whether the lifetime total
  moved from below 10 to 10 or more. A device that restores a backup folds from 0 to 400 in one
  step, and `total === 10` would have missed every threshold on exactly the devices that earned
  them.
- **`faYear` joins `faNumber` in `ui/format.ts`.** `Intl.NumberFormat('fa-IR')` groups, so a
  Jalali year printed with `faNumber` reads «۱٬۴۰۲». A year is a label, not a quantity.
- **Two new engine files rather than more bound functions.** `engine/fold-reads.ts` (`itemBox`,
  `totalPresentations`) and `engine/goal-sheet.ts` (`todayKey`, `shouldShowGoalSheet`) are
  projections of the cached fold and of `dayKey`, not `@kl/core` calls, so they sit beside
  `engine/index.ts` instead of inside it — and they keep `@kl/core` out of the screen (§17.6).
- **The overflow menu is a dropdown, the other two are sheets.** Opening the flag sheet out of a
  sheet stacks two focus traps; Radix's `DropdownMenu` closes itself first, so there is never
  more than one modal on screen.
- **The toast lives in `screens/review/`.** The review screen is the only place in the app that
  confirms something without changing what is on screen. A shared toast would be a provider, a
  queue and a portal for one caller; it moves to `ui/` when a second screen needs one.
- **`/paywall` ships as a placeholder with a real way out.** The review loop needs somewhere to
  send a free user at the limit, and §7.8 requires «بعداً» to return them to the queue. The
  argument and that button are real from this ticket; the price and «خرید» arrive with Phase 5.

### 5.6 Things ticket dev-web/04 (home, boxes, word, progress, summary, settings, season) had to decide (2026-09-18)

- **The bottom nav is a component the four screens render, not a property of the root layout.**
  `/review`, `/word/:id`, `/session/summary` and the whole onboarding/paywall/login/checkout flow
  do not show it, so `screens/layout/BottomNav.tsx` is a new file each of `Home`, `Boxes`,
  `Progress` and `Settings` imports, rather than an edit to the shared `Layout.tsx`.
- **A new `engine/use-fold.ts` hook, built on `useSyncExternalStore`.** None of the bound
  functions in `engine/index.ts` are React state, so recording a review on `/word/:id` would not
  repaint `/boxes` or `/progress` without something to subscribe to. `fold-cache.ts` already
  replaces its `current` object wholesale on every refold, so identity comparison is exactly the
  right `getSnapshot`. This is the one place `apps/web/src/engine` touches React; `packages/core`
  still does not.
- **`engine/box-items.ts`, `engine/chart-data.ts` and `engine/season.ts` are new, narrow modules**
  rather than additions to `engine/index.ts`: the ticket asked to prefer new files over editing
  shared ones, and each is independently pure and unit-tested (`boxItems`, `chartData`,
  `seasonReached`/`seasonStats`), with a thin `current*`-prefixed wrapper binding it to the live
  cache for the screen to call.
- **`db/dexie.ts` gained one `KvKey`: `seasonShownFor`.** The "show the season screen once" rule
  needs a persisted marker keyed by the exam date, and the `KvKey` union is deliberately closed
  (§7.3) so a typo is a compile error — the smallest edit was adding the key, not opening the
  union up.
- **The word detail screen (`screens/word/WordDetail.tsx`) is built from scratch**, not by reusing
  anything from `screens/review/**`: the review card is built around the front/back reveal flow,
  while this screen shows a full card, a review timeline and a flag sheet all at once. It reads
  the whole cached event log via `engine/fold-cache.ts`'s already-exported `cachedEvents()` and
  filters by `itemId`, rather than adding an indexed Dexie query to `db/repo.ts`.
- **`content/field-codes.json` is imported straight from the repo root** into
  `screens/settings/Settings.tsx` (`../../../../../content/field-codes.json`), because it is
  generated wiki data (CLAUDE.md's Wiki layer), not app source, and duplicating it into `apps/web`
  would be a second copy to keep in sync. Only the `codes` map (named field codes) is shown, per
  the ticket.
- **The exam-date field is a plain text input in `۱۴۰۵/۱۱/۱۵` shape**, parsed and formatted with
  `date-fns-jalali`, rather than a calendar widget — there is no calendar primitive in `ui/` yet
  and the owner-facing format is exactly what the placeholder shows.
- **The theme picker is three `Switch`es, not a new `RadioGroup` primitive.** `ui/` has no radio
  group; three controlled switches (`checked={theme === choice}`) that only ever turn themselves
  on give the same exclusive-choice behaviour without adding a component for one screen.
- **The settings "گزارش مشکل" flow calls `reportError('user_report', new Error('user_report'), …)`**
  rather than adding a dedicated non-`Error` overload — `reportError`'s signature already takes
  `unknown`, and every other call site in the codebase passes a real error, so a placeholder
  `Error` keeps the one function signature instead of adding a case to it.

### 5.4 The server foundation: what PocketBase 0.40 forced (2026-09-18)

Ticket `dev-server/01`. The migrations, `withRoute`, and `config`/`health`/`me`/`me/profile`.
Five things about the runtime shaped the code and would otherwise be rediscovered painfully by
the next session.

- **`review_events.id` is declared as an explicit system field, not "configured".** PocketBase's
  own id is a 15-character autogenerated text primary key; ours has to hold a 36-character UUIDv7
  minted on the device, because that is what makes `sync/push` idempotent (`what.md` §8.2).
  It is widened by passing `id` in the collection's `fields` array with
  `{ primaryKey: true, system: true, min: 36, max: 36, pattern: '^[0-9a-f-]{36}$',
  autogeneratePattern: '' }`. The empty `autogeneratePattern` is the load-bearing part: it stops
  the server from minting an id for an event that arrived without one, which would turn a
  duplicate push into a duplicate event and corrupt the fold.
- **`users` is edited, never created.** A fresh PocketBase install already ships a default `users`
  auth collection, so the migration finds it and changes it — `passwordAuth.enabled = false`, a
  365-day `authToken.duration`, a unique `phone`, and `email` made optional, since the OTP flow
  creates an account from a phone number alone. A blind `new Collection({name: 'users'})` fails
  on a fresh install and would be a silent data loss on an existing one.
- **Every route handler is serialized and run in its own isolated context.** PocketBase's own
  words. A `*.pb.js` file's top-level scope is invisible from inside its handlers, so each one
  re-`require`s what it needs, and does so through the `__hooks` global because relative paths
  resolve against the process CWD rather than `pb_hooks/`. This is why `withRoute` is called
  *inside* the handler rather than wrapping it at registration time, which reads oddly until you
  know why. The runtime is CommonJS-only: no `import`/`export` at file level, ever.
- **`GET /api/health` could not be registered.** PocketBase 0.40 owns that pattern, and a second
  `routerAdd` on it panics the router at startup ("pattern conflicts with pattern") — the server
  does not boot at all. There is no API to unregister a built-in route, so ours is a `routerUse`
  middleware that answers that one path and calls `e.next()` for everything else. If a future
  PocketBase drops its built-in health route, this can go back to being a plain `routerAdd`.
- **A `json` field read with `record.get()` is not a JavaScript object.** It comes back as Go's
  `types.JSONRaw`, which marshals correctly on the way out but whose properties read as
  `undefined` from JS. `profile.updatedAt` was therefore always `undefined`, which silently turned
  the newer-wins rule of `PATCH /api/me/profile` into always-wins — a real bug, caught only
  because the test asserted the *older* write was rejected rather than just that the newer one
  was accepted. `lib/route.js` reads json fields through `readJsonField`, which goes via
  `getString` and `JSON.parse`.

Two smaller choices worth recording. The JSVM exposes `md5`/`sha256`/`sha512` but no sha1, so the
redaction in `withRoute` hashes secrets with a **sha256 prefix** rather than the sha1 prefix the
ticket asked for — same property, equal inputs collide and nothing reads back. And `client_errors`
stores the client's `userId` (§10.1) as a **relation named `user`**, like every other collection
here, rather than a bare text field; the route that writes it (ticket 04) does the mapping.

`_logs` is written on a **3-second debounce**, which is a test-design fact more than a code fact:
any assertion about a log line has to poll for the flush, and has to poll for *its own* line —
polling for "any line for this route" passes on a row an earlier test wrote, which is exactly how
the first version of the harness lied.

### 5.7 The OTP probe: what PocketBase 0.40.2 actually does (2026-09-24)

Ticket `dev-server/02`. Before any OTP code was written, a throwaway hook (`zz_probe.pb.js`,
commit 808fdc2, deleted in the commit that adds this section) exercised every 0.40 API the
routes would lean on, against the pinned binary on an empty `pb_data`. Results:

| API | Result |
|---|---|
| `new Record(users)` + `setPassword(random)` + `$app.save()` on a `passwordAuth`-disabled `users` | **Works.** The password is still required on an auth record; a random 40-char one is set and never used. |
| `record.newAuthToken()` | **Works**, returns the JWT string. Its `exp` is exactly `authToken.duration` (31536000 s = 365 days) after issue. |
| `users.authToken.duration` | **Works**, reads `31536000` — the migration's value took. |
| `$security.randomStringWithAlphabet(5, '0123456789')` | **Works**, e.g. `37617`. |
| `$security.equal(a, b)` | **Works** — PocketBase's constant-time string compare. `$security.hs256(text, secret)` (HMAC-SHA256, hex) also works. |
| `e.response.header().set('Retry-After', '42')` then `e.json(...)` | **Works**, the header reaches the client. |
| `e.realIP()` | **Works**, but see below: it is `127.0.0.1` for everyone behind Caddy unless `trustedProxy` is set. |
| `$app.settings().rateLimits` | **Readable.** Default rules exist (`*:auth` 2/3 s, `*:create` 20/5 s, `/api/batch`, `/api/` 300/10 s) but `enabled: false`. Rules are per IP or per label, never per phone, so the OTP limits are an in-hook count. |
| `$app.settings().trustedProxy` | `{headers: [], useLeftmostIP: false}` by default. |
| `$apis.recordAuthResponse(e, rec, 'otp')` | **Works, but it writes the response itself and returns** — the handler keeps running, and a following `e.json()` appended a second JSON object to the same body. Unusable inside `withRoute`, which always writes its own envelope. |
| JSON-serialising a `Record` (`e.json(200, {record})`) | **Works**, public fields only: no `password`, no `tokenKey`; `email` is left out when `emailVisibility` is false. Same shape `recordAuthResponse` sends. |
| `findRecordsByFilter(col, 'phone = {:phone} && created > {:since}', sort, limit, 0, params)` | **Works** with named params. |
| A date literal in a filter param | **Only PocketBase's own format compares correctly**: `2026-09-23 21:38:00.000Z` (space). A JS ISO string with a `T` silently matched nothing, because dates are stored as text and `' ' < 'T'`. |
| `countRecords(col, $dbx.hashExp({...}))`, `cronAdd` | Both exist and work. |

What the routes do as a result:

- **The verify route builds the auth response itself**: `{ token: record.newAuthToken(), record }`.
  That is the same `{token, record}` shape `recordAuthResponse` writes, it keeps the one
  `withRoute` envelope and log line, and nothing else in this app hooks `onRecordAuthRequest`.
- **Every date handed to a filter goes through one helper** (`lib/otp.js` `pbDate`) that turns an
  ISO string into PocketBase's `YYYY-MM-DD HH:MM:SS.sssZ`. Without it the rate limits count
  nothing and never trip, and no error is raised anywhere.
- **`trustedProxy` is set by a migration** to `X-Forwarded-For`, rightmost value. PocketBase
  listens on `127.0.0.1:8090` only and Caddy is the one hop in front (DNS-only, no CDN proxy,
  §14.3), so the rightmost entry is the address Caddy saw and a client cannot forge it. Without
  it the 10-per-IP-per-hour limit is one global bucket, and the eleventh login of the hour
  across the whole country is refused.

### 5.8 Sync: what the push and pull had to decide (2026-09-24)

Ticket `dev-server/03`. Server half.

- **The pull cursor is safe only because every push stamps `created` itself.** `(created, id)`
  paging silently loses an event whenever a row becomes visible *after* a reader's cursor has
  passed its sort position — two pushes in the same millisecond (a UUIDv7 id from another device
  sorts anywhere), or the server clock stepping back. So `lib/sync.js` inserts with raw
  `INSERT OR IGNORE` and sets `created` to one value per push:
  `max(now, this user's max(created) + 1 ms)`, read inside the write transaction. PocketBase's
  write pool is a single connection, so no other push lands between the read and the commit.
  Every row of a later push therefore sorts strictly after everything a reader could already have
  seen; rows of one push share a stamp and are ordered by id, and a reader sees that
  transaction whole or not at all. Rejected: SQLite `rowid` as the cursor (renumbered by
  `VACUUM` on a table without an integer primary key), a "only return rows older than N
  seconds" lag (still assumes a monotonic clock and a bounded transaction).
- **Raw SQL, not `app.save(record)`.** Insert-ignore is one statement and atomic under
  concurrency; check-then-save would race two devices pushing the same id. The cost is that
  PocketBase's field validation is bypassed, so `cleanEvent` re-checks every field the
  collection declares.
- **One malformed event rejects the whole push.** Skipping it would let the client mark it
  synced and lose it from every other device. Our own client minted it, so it is a bug to fix;
  until then it stays local and unsynced, and the client's fifth consecutive failure files a
  `client_errors` record. The cost: one bad event holds back the backup of the others. Reversing
  it later (a `rejected[]` list) is an additive change to the response.
- **A foreign id is a duplicate, not an error.** A body can never write into another user's log
  (§15), but refusing the batch would block a legitimate login merge on a shared device, whose
  earlier account's events are already on the server under that account. They are counted as
  duplicates and logged `id_conflict`.
- **`withRoute` gained `maxBodyBytes`.** The 32 KB cap of §15 cannot hold 500 events (~170 bytes
  each); `sync/push` takes 256 KB and everything else keeps 32 KB.

## 6. How to extend this file


Append a dated section per decision session. State the decision, the alternatives, and the
reason in the owner's terms. If it changes `what.md`, change `what.md` in the same commit. If it
is expensive to reverse, add an ADR and link it.
