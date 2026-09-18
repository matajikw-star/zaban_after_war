# WHAT — the system as it is

The single current description of the Konkur Leitner product: what exists, what is being built,
and the exact contracts between the parts. **This file is always true of `main`.** Any change to
the system — a new field, a renamed route, a changed interval — lands in this file in the same
commit. The reasoning behind any of it is not here: it is in `how-why.md` and in `docs/adr/`.

How to read the status marks: `[planned]` = specified, no code yet · `[building]` = a ticket is
open · `[live]` = on `main` and deployed. A builder session flips the mark when it ships.

Last full revision: 2026-09-17 (the development plan). Design system: decided 2026-09-18 — see §7.9.

---

## 0. Ground rules that shape everything below

The constitution in `CLAUDE.md` applies. Four product rules from the owner sit on top of it:

1. **Reliability over everything, then correctness, then cost.** The app must never lose a
   user's progress and never block them because of the network.
2. **The internet is required for exactly three things: signing up (OTP), logging in, and
   paying.** Everything else — studying, seeing progress, the paywall screen, the settings, the
   error report — works with the network off, from first launch to the end of the user's life
   with the app.
3. **Progress is backed up whenever the device is online, silently.** The user never has to do
   anything for it, and can restore it on any device with their phone number.
4. **Simple, ready-made, debuggable.** Prefer a mature library to hand-written code. Prefer a
   flat function to an abstraction. Every failure leaves a structured log record that an AI
   agent can diagnose from without the owner's help (§10).

---

## 1. The product in one paragraph

A Persian, RTL, mobile-first PWA (and a TWA-wrapped Android APK of the same app) that drills the
English vocabulary that appeared in the Iranian MA entrance exam (کنکور ارشد) 1398–1405, using a
five-box Leitner schedule. 2,098 words, each citing the real exam questions it appeared in. The
first ~150 words by exam value are free; after 100 card presentations a paywall offers permanent
access to everything for a one-off payment (290,000 toman list-discounted from 450,000) through
Zarinpal, with discount codes. Progress is an append-only review log, kept locally and backed up
to a PocketBase server on an Iranian VPS whenever the device is online. No third-party runtime
dependency of any kind.

---

## 2. System overview

```
konkurleitner.com            app.konkurleitner.com                admin.konkurleitner.com
(landing, static)            (the PWA + its API)                  (owner dashboard + PB admin UI)
      │                             │                                     │
      └──────────────┬──────────────┴──────────────────┬──────────────────┘
                     ▼                                 ▼
             Caddy :443 (automatic TLS)  ── one Iranian VPS (Parspack) ──
               ├─ konkurleitner.com     → /opt/kl/landing   (static; /downloads/*.apk)
               ├─ app.konkurleitner.com → PocketBase :8090   (serves pb_public = the PWA, /api/*)
               │                          └─ /_/* blocked here
               └─ admin.konkurleitner.com
                     ├─ /            → /opt/kl/admin (static dashboard)
                     └─ /api/*, /_/* → PocketBase :8090

             PocketBase (one binary, systemd, pinned version)
               ├─ pb_data/        SQLite — the only state on the machine
               ├─ pb_hooks/       our routes: otp, sync, pay, content, flags, beacon, errors, admin
               ├─ pb_migrations/  collections + rules, versioned in git
               ├─ pb_public/      the built PWA (+ free content package)
               └─ /opt/kl/content/paid.json   the paid content package (entitlement-gated)

             Backups: PocketBase → nightly → S3-compatible bucket, plus a weekly owner copy.
```

Phone side:

```
Browser / TWA
  ├─ Service worker (Workbox via vite-plugin-pwa): app shell + free package precached
  ├─ IndexedDB (Dexie): events, outbox, packages, kv
  └─ React app: fold(events) in memory → screens
        ├─ study loop        offline
        ├─ backup (sync)     when online, never blocking
        ├─ content download  after purchase, resumable
        └─ OTP / payment     online only, by design
```

Three origins on purpose: storage, service-worker scope and Android asset links are all
origin-scoped, the landing page must never be inside the app's SW scope, and the admin UI must
not be reachable on the app origin.

---

## 3. Repository layout

```
apps/
  web/            the PWA (Vite + React + TS + Tailwind)                     [building — scaffold]
  landing/        the one-page marketing site (Vite, static)                [building — placeholder]
  admin/          the owner's stats dashboard (Vite + React, tiny)          [building — scaffold]
packages/
  core/           the SRS engine: pure functions, exhaustively tested       [live]
  content/        JSON schemas, lint, package builder                       [live]
  design/         design tokens (CSS variables), fonts, shared base styles  [building — tokens + Vazirmatn]
server/
  pb_hooks/       PocketBase JS hooks (routes, crons)                        [building]
  pb_migrations/  collections and API rules                                  [live]
  Caddyfile, systemd/, deploy/   VPS configuration and deploy scripts       [building]
  POCKETBASE_VERSION            the pinned binary version                    [building — 0.40.2]
android/          Bubblewrap TWA project (twa-manifest.json); keystore NOT in git [building — README]
tools/            simulator, error/log readers, deploy, backup pull, budget  [building — budget works, rest stubs]
content/          the lexicon, exams, hints (the asset)                      [live]
extraction/       the scan → lexicon pipeline (Python)                       [live]
docs/spec/        this file and how-why.md
docs/runbooks/    operational procedures (deploy, debug-from-log, restore)
```

Workspace: pnpm, Node ≥ 22, TypeScript strict, Biome, Vitest, Playwright. Root scripts, all
registered: `test`, `test:watch`, `lint`, `format`, `typecheck` (`tsc --build` for the composite
packages, then `pnpm -r typecheck` for the apps, which are `noEmit`), `build`, `budget`, `e2e`,
`content:lint`, `content:build` (§6, real), and the `tools/` entry points `simulate`, `errors`,
`logs`, `flags`, `deploy` — those five are still stubs that print `not implemented` and exit 1.
`deploy` must be run as `pnpm run deploy`: bare `pnpm deploy` is pnpm's own subcommand.

---

## 4. Stack

Exact versions live in `package.json` files and `server/POCKETBASE_VERSION`; this table says
what and why. Every runtime asset is bundled and served from our origin (ADR-0005).

| Concern | Choice | Notes |
|---|---|---|
| UI | React 19, TypeScript | Function components, no class components, no HOCs. |
| Build / PWA | Vite, `vite-plugin-pwa` (Workbox) | Precache app shell + free package. |
| Styling | Tailwind v4 + CSS variables from `packages/design` | Logical properties only (`ps-`, `ms-`, `start-`), `dir="rtl"` on `<html>`. |
| Components | shadcn/ui pattern (Radix primitives copied into `apps/web/src/ui/`) | Accessible sheets, dialogs, tabs. We own the code, no CDN. |
| Routing | `react-router` (data-less, `createBrowserRouter`) | Flat route table in one file. |
| State | Zustand stores, one per concern (`session`, `sync`, `content`, `auth`) | No Redux, no context trees. |
| Local DB | Dexie (IndexedDB) | Schema in §7.3. |
| Ids | `uuid` v7 | Time-sortable, no coordination. |
| Dates | `date-fns` + `date-fns-jalali` | Tehran is fixed UTC+03:30 (no DST since 2022). |
| Icons | `lucide-react` (tree-shaken) | |
| Charts | one hand-written SVG bar chart component | The only chart is "reviews per day". |
| Backend | PocketBase (Go binary, SQLite, JS hooks) | ADR-0001. Minimum 0.23 (superusers collection, rate limits, editable id field, batch API). |
| Reverse proxy | Caddy | Automatic TLS via Let's Encrypt with ZeroSSL fallback. |
| SMS | Kavenegar Verify Lookup | Provider behind one interface; `console` provider for dev. |
| Payment | Zarinpal REST v4 (`/pg/v4/payment/{request,verify,unverified}.json`) | Sandbox for tests. |
| Android | Bubblewrap (TWA) | Same PWA, Chrome-backed. |
| Tests | Vitest, fast-check, Playwright | §16. |
| CI | GitHub Actions | Lint, typecheck, test, build, budget, e2e against a real PocketBase. |

Explicitly not used: Sentry/GlitchTip (foreign or heavy), Umami (dropped at launch), Firebase,
any CDN, any analytics SaaS, Redux, GraphQL, Docker on the VPS (one binary is simpler).

---

## 5. Domain model and the SRS engine (`packages/core`)

Pure TypeScript. No imports from React, the DOM, the network or the clock. `now` is always a
parameter. This is the one package with exhaustive tests (§16.1).

### 5.1 Types

```ts
export type ItemId = string;          // today always a word id (lemma slug); opaque, globally unique
export type Grade = 0 | 1;            // 0 = forgot, 1 = remembered
export type Box = 1 | 2 | 3 | 4 | 5;  // 5 = conquered (فتح‌شده)

export type ReviewEventKind = 'review' | 'know';
// review: the user saw the card, revealed, and graded themselves
// know:   "I already know this" — the word goes straight to box 5 (grade is always 1)

export interface ReviewEvent {
  readonly id: string;        // UUIDv7, minted on the device
  readonly itemId: ItemId;
  readonly at: number;        // epoch ms, device clock
  readonly kind: ReviewEventKind;
  readonly grade: Grade;
  readonly device: string;    // installId of the device that recorded it
}

export interface ItemState {
  readonly itemId: ItemId;
  readonly box: Box;               // live schedule box
  readonly highWaterBox: Box;      // never decreases; drives progress
  readonly lastReviewedAt: number;
  readonly dueAt: number;          // lastReviewedAt + params.intervalsMs[box]
  readonly reviewCount: number;
  readonly lapseCount: number;
}

export interface DayStats {
  readonly presentations: number;   // every event, whatever its kind or grade
  readonly correct: number;         // events with grade 1, `know` included
  readonly conquered: number;       // highWaterBox first reached 5 today, through a `review` only
  readonly introduced: number;      // items whose first event ever fell today
}

export interface Fold {
  readonly items: ReadonlyMap<ItemId, ItemState>;
  readonly byDay: ReadonlyMap<DayKey, DayStats>;   // Tehran-local day → DayStats
  readonly lastEventAt: number;                    // 0 for an empty log
}

export type DayKey = number; // floor((at + TEHRAN_OFFSET_MS) / DAY_MS), in day.ts

export interface ContentItem {            // the engine's view of a word; the card has more
  readonly id: ItemId;
  readonly rank: number;                  // introduction order, frozen in the package
  readonly weight: number;                // stats.timesTested (0 for context-only words)
}

export interface Params {                 // one object, one file: params.ts. Tunable, versioned.
  intervalsMs: Record<Box, number>;       // 10 min, 1 d, 2 d, 4 d, 8 d
  suppressionWindow: number;              // 8 — never show a card seen within the last N draws
  boxDrawFactor: Record<Box, number>;     // 1.5, 1.3, 1.15, 1.0, 0.6
  newWordsFloorDivisor: number;           // floor = ceil(dailyGoal / 6)
  newWordsCapMultiplier: number;          // cap = 2 × floor
  minDuePool: number;                     // 10 — introduce when the due pool is thinner than this
  streakMinFraction: number;              // 0.3 of the goal (min 10 presentations) counts as a study day
  accuracyWindowDays: number;             // 7
  defaultAccuracy: number;                // 0.8 until there is data
  freePresentationLimit: number;          // 100 — soft paywall trigger (server config can override)
}
```

### 5.2 The fold

`fold(events: readonly ReviewEvent[], params: Params): Fold` — `fold.ts`, with
`isConquered(state)` alongside it.

- Sort by `(at, id)`; ignore exact-duplicate ids (sync can deliver the same event twice). The
  array it is given is never mutated.
- An item with no events yet is treated as box 1 and already due, so its first `review` with
  grade 1 promotes it to box 2. That is what makes the seven-day minimum (1 + 2 + 4 days)
  reachable.
- `review` grade 1 → `box = min(box+1, 5)` **only if** `at ≥ dueAt` (interval elapsed); an
  early correct answer leaves the box unchanged. Grade 0 → `box = 1`, `lapseCount++`, always.
- `know` → `box = 5`, whatever the grade recorded on it, and it never counts a lapse.
- `highWaterBox = max(highWaterBox, box)` after every event.
- `dueAt = at + intervalsMs[box]` after every event — an early answer therefore postpones the
  next due date without promoting the card.
- `reviewCount` counts every event for the item, `know` included.
- A word is **conquered** when `highWaterBox === 5`. It keeps being scheduled (box 5 every 8
  days) but its progress contribution is already full.
- `byDay` counts presentations (every event), correct answers (grade 1), words conquered that
  day (first time `highWaterBox` reaches 5 **through a `review`**; a `know` never counts, since
  this number feeds the introduction budget), words introduced that day (first event for the id).
- Property: folding a shuffled log gives the same `Fold` (tested with fast-check).

### 5.3 Progress, streak, pace

```ts
progress(fold, content): { percent: number; conquered: number; total: number; weightEarned: number; weightTotal: number }
//   Σ over content items of (highWaterBox/5 × weight) / Σ weight, as a percentage (0..100, and 0
//   when the content carries no weight at all). Unseen items contribute 0.
//   weight = timesTested; context-only words (weight 0) never move the percentage. Never decreases.
//   `conquered` and `total` count content items, context words included.

streak(fold, dailyGoal, now, params): { days: number; todayCounts: boolean }
//   A day counts when presentations ≥ max(STREAK_MIN_PRESENTATIONS, ceil(goal × streakMinFraction)).
//   The floor of 10 is a constant in streak.ts, not a tunable. Consecutive Tehran-local days ending
//   today or yesterday. Yesterday-only keeps the streak alive; today not yet counted.

paceEstimate(fold, content, dailyGoal, examDate, now, params):
  { remainingSteps: number; stepsPerDay: number; daysNeeded: number; daysLeft: number; verdict: 'ahead' | 'ok' | 'behind' }
//   remainingSteps = Σ (5 − highWaterBox) over seen items + 5 × unseen items (weight > 0 only).
//   stepsPerDay = goal × accuracy(last 7 days, default 0.8) × EARLY_ANSWER_FACTOR = 0.9 (the 0.9
//   covers early answers that do not promote). `recentAccuracy(fold, now, params)` is exported too.
//   daysLeft = max(0, whole Tehran days from now to examDate); daysNeeded = ceil(remainingSteps / stepsPerDay),
//   0 when nothing is left and Infinity when the goal is 0.
//   verdict 'behind' when daysNeeded > daysLeft × 1.1, 'ahead' when < daysLeft × 0.7, else 'ok';
//   the UI nudges the goal up on 'behind'.
```

### 5.4 Queue: what card comes next

`nextCard(fold, content, recent: readonly ItemId[], now, dailyGoal, rng: () => number, params): { itemId; source: 'due' | 'new' | 'conquered' | 'early' } | null`

`recent` is **most-recent-first**: `recent[0]` is the card the user just saw. `rng` returns a
number in [0, 1).

Order of pools, first non-empty wins — except that pool 2 is tested **before** pool 1, because its
own guard is "pool 1 is thin": reading the order literally would leave `minDuePool` dead, since a
non-empty due pool would always win and an empty one is thinner than any threshold.

1. **Due, not conquered** — `box < 5`, `dueAt ≤ now`. Weighted random: weight
   `(1 + overdueDays) × boxDrawFactor[box]`, computed **per word** (never per box). The
   suppression window excludes the last `suppressionWindow` shown ids; if the pool is smaller
   than the window, the least-recently-shown card is chosen instead of disabling the window.
2. **New** — when pool 1 is thinner than `minDuePool` and today's introduction budget is not
   spent: the next unseen word by `rank`. Budget per Tehran day =
   `clamp(floor + conqueredToday, floor, cap)` with `floor = ceil(goal/6)`, `cap = 2 × floor`.
   This is the control law: words enter box 1 at roughly the rate they leave into box 5, with a
   floor so the first days are not dead. `know` events do not count as conquered-today.
3. **Due, conquered** — box 5 words whose 8 days elapsed, oldest-due first.
4. **Early** — not-yet-due words, soonest-due first. Grade 1 does not promote; grade 0 demotes.
   This pool is why the app can never say "you are done".

Every pool is drawn from the content package: an item the fold knows but the package does not
carry has no card, so it is ignored. Pools 3 and 4 break a tie on `itemId`, so the queue is
reproducible from the same fold.

`null` only when no content item can be shown at all — empty content, or content that the fold has
never touched and the budget cannot introduce. The UI never shows an empty-queue state.

Three helpers ship with it, all pure: `introductionBudget(fold, dailyGoal, now, params)` returning
`{ floor, cap, budget, introduced, remaining }`, and, for the boxes screen,
`dueCounts(fold, now): Record<Box, number>` and
`boxCounts(fold, content): { byBox: Record<Box, number>; unseen: number }`.

### 5.5 Daily goal from onboarding

`goalFromMinutes(minutes) = max(50, minutes × 10)` presentations; onboarding offers 10 / 20 / 30 /
45 minutes (`ONBOARDING_MINUTES`). The exam date only feeds `paceEstimate`; it never changes intervals.

### 5.6 Placement

Onboarding offers the top 100 words by rank as a swipe list: «بلدم» emits a `know` event,
«بلد نیستم» emits nothing (the word will be introduced normally). Skippable, and the first thing
cut if time is short.

### 5.7 Simulator (`tools/simulate`) `[live]`

Replays a synthetic user (accuracy profile, minutes/day, days) through the real engine and prints
the schedule, introductions, conquests per day, and the pace estimate versus reality. Parameter
tuning is a conversation about its output, never about vibes.

`pnpm simulate --minutes M --days D --accuracy A` (`A` a constant or five comma-separated
per-box values); `--words N` caps to the top N words by the §6.2 rank order, `--seed`, `--exam-days`
and `--json` round it out. The default word set and its weights are read from `content/lexicon`
at run time, never hard-coded.

**Measured, 2026-09-18** — seed 20260918, the full lexicon (1,776 words with `timesTested > 0`),
90 days, constant accuracy 0.85:

| minutes/day | conquest days (min · p25 · median · p75 · max) | all conquered by | pace estimate at day 0 | error |
|---|---|---|---|---|
| 10 | 7 · 8 · 8 · 11 · 44 | not within 90 days (1,321/1,776) | day 124 | n/a |
| 20 | 7 · 7 · 8 · 11 · 36 | day 81 | day 62 | −19 days |
| 45 | 7 · 7 · 8 · 11 · 51 | day 68 | day 28 | −40 days |

The seven-day floor holds in every run. The median does not — it lands at 8 days, not the
2–3 weeks the simulator's own ticket assumed before it was built: with 200+ presentations/day
against 1,776 words, review capacity so outstrips due-load that most words are reviewed almost
exactly on the day they come due, so most words ride the ladder's 7-day minimum (1 + 2 + 4 days)
with barely any slack. This is a real finding, not a bug, and no parameter in `params.ts` was
changed to produce it — the fast median is a property of this content size and these goals, and
whether it is desirable (fast wins keep motivation up) or not (the app should feel more like a
multi-week course) is a product call for the owner, not an engine one.

The pace estimate is a **lower bound**, not a forecast: it counts remaining box-steps against a
naive `goal × accuracy × 0.9` throughput and ignores the ladder's fixed wait times, so it always
finishes optimistic — the gap widens as the daily goal grows (−19 days at 20 min, −40 at 45),
since a bigger goal buys speed only up to the point where the ladder's own intervals become the
bottleneck instead of review capacity. This is a property of the estimate's definition (§5.3),
not a bug; no parameter was changed here either. If a tighter exam-readiness estimate is wanted,
that is a `paceEstimate` formula change, to be made from this data, not from vibes.

---

## 6. Content packages

Content ships as **exactly two packages**, built by `packages/content` in CI from `content/`:

| Package | Contents | Delivery |
|---|---|---|
| `free` | the 150 lowest-rank shipping words, with hints where approved | Part of the PWA build, precached by the service worker. Offline from first launch. |
| `paid` | **all** words (the free 150 included), with hints where approved | One file, entitlement-gated, downloaded once after purchase into IndexedDB. Replaces `free` as the active package. |

A content update is a new version of the same two files; the client swaps a package atomically
only after the whole file is downloaded and its hash verified.

### 6.1 Package format

```ts
interface ContentPackage {
  packageId: 'free' | 'paid';
  version: string;          // content build id, e.g. "2026-09-30.1"
  builtAt: string;          // ISO
  schemaVersion: 1;
  hash: string;             // sha256 of the canonical JSON of `items`
  items: WordCard[];        // ordered by rank
}

interface WordCard {
  id: ItemId; lemma: string; rank: number; weight: number; level: 'A1'|'A2'|'B1'|'B2'|'C1'|'C2';
  senses: Array<{ pos: string; ipa: string | null; definition: string; translations: string[];
                  synonyms: string[]; antonyms: string[]; examples: Array<{ en: string; fa: string }> }>;
  confusables: Array<{ word: string; note: string }>;
  homograph: { suspected: boolean; note: string | null };
  hint: { template: 'تداعی صوتی'|'طنز'|'ریشه‌شناسی'|'تصویری'; association: string; sentence: string } | null;
  exam: { timesTested: number; timesAsAnswer: number; years: number[]; lastYear: number | null;
          stems: Array<{ paperId: string; year: number; questionNo: number; stem: string;
                         options: string[]; key: number | null; isAnswer: boolean }> };
}
```

### 6.2 Build rules

- **Rank is frozen forever, not just per version.** `packages/content/ranks.json` maps id →
  rank, committed. A word not yet in the file — because it just gained a first sense, or was
  never excluded before — gets the next rank by `stats.priority` desc, then `timesTested` desc,
  then `firstYear` desc, then id asc, appended after the current maximum. An id already in the
  file keeps its rank whatever the build recomputes for it. Existing users' progress is keyed
  by id, so re-ranking never touches their state. One caveat this creates: a higher-priority
  word that gains senses later is appended after words that shipped earlier at lower priority,
  so the free-150 boundary can shift by one word as word data completes — no progress is lost,
  since it is keyed by id (`how-why.md` §5).
- `packages/content/exclusions.json` lists ids that never ship (non-words such as `as-like`,
  see `.scratch/word-data/issues/04-non-words-and-latin-phrases.md`). Ids stay frozen; only
  shipping is decided here.
- A word ships without `hint` when its hint file is missing or unapproved. **The free 150 must
  all have approved hints before launch**; the rest may ship without and gain hints in updates.
- Words with empty `senses` are **excluded from both packages** until their word data is
  written (895 of 2,098 done on 2026-09-17). The paid package therefore grows with content
  updates until the lexicon is complete; the build prints `shipping N of M words`.
- The exam stem is joined from `content/exams/`, never duplicated into `examples`.
- The blank marker in stems is normalised to `.....` at build time (34 stems use a run of
  hyphens instead of dots, measured 2026-09-18 — this ticket's own count; the earlier figure of
  17 was never re-verified against the full corpus).
- `pnpm content:build` writes `apps/web/public/content/free.json` and `server/content/paid.json`
  plain (Vite does not hash or rename either — see §7.7), plus `manifest.json`
  `{ free: {version, hash, bytes}, paid: {version, hash, bytes} }`. `packages/content/versions.json`
  holds the last-written `{version, hash}` per package so the version string
  (`YYYY-MM-DD.N`) is reproducible: unchanged content keeps its version; changed content mints
  `N+1` the same day or `.1` on a new day.

### 6.3 Size

Measured 2026-09-18, 893 of 2,098 words shipping (word data incomplete — see above): `paid`
is 1.36 MB raw, 352 KB gzipped; `free` (150 words) is 303 KB raw, 74 KB gzipped. Both scale
roughly linearly with word count, so the full 2,098-word `paid` package is projected at
≈ 3.2 MB raw, ≈ 830 KB gzipped once word data is complete — still well inside IndexedDB norms.
Caddy gzips in production; the numbers above are measured with `node:zlib`, not a live server.

---

## 7. The client app (`apps/web`)

### 7.1 Shape [live]

```
src/
  main.tsx            bootstrap: register SW, open DB, load package, fold, mount
  routes.tsx          one flat route table
  screens/            one folder per screen (§7.8); each screen is one file plus its parts
  ui/                 shadcn-style primitives (Button, Sheet, Dialog, Progress, ...)
  stores/             zustand: auth.ts, content.ts, session.ts, sync.ts, settings.ts
  db/                 dexie.ts (schema), repo.ts (typed reads/writes; the only file that touches Dexie)
  engine/             thin adapters over @kl/core (fold cache, rng, clock) + index.ts, the bound API
  net/                api.ts (typed fetch wrappers for every route in §8)
  sync/               backup.ts (state machine), download.ts (state machine)
  log/                breadcrumbs.ts, errors.ts (capture + report), snapshot.ts
  content/            manifest.ts — the §8.2 manifest shape (the package shape is @kl/content)
  errors.ts           AppError (§17.4)
  strings.ts          every Persian UI string, keyed; no string literals in components
  version.ts          APP_VERSION + BUILD_SHA injected by Vite
```

Rules: a screen reads stores and calls repo/net functions; it never touches Dexie or fetch
directly. Every async operation is a named state machine with its states listed in this file.

`net/pocketbase.ts` was planned and is not built: the app talks to our own routes (§8.2) and
never to PocketBase's generic collection API, so the SDK would be a dependency with no caller.

Bootstrap order in `main.tsx`: install error capture → open the database → mint or read the
`installId` → load auth and settings from `kv` → load the content package the entitlement allows
→ fold the review log → mount. A content package that cannot be loaded is reported and **not**
fatal: the shell, the settings and the existing review log all still work without it.

### 7.2 Identity on the device [live]

- `installId` — UUIDv7 minted on first launch, stored in `kv`. Tags every event as `device`.
- `userId` + auth token — only after OTP login; stored in `kv` (not localStorage, so one place
  to clear). Token duration is set to 365 days server-side and refreshed on every online contact.
  An expired token never blocks study; it only pauses backup until the next successful refresh
  or re-login, and the settings screen shows that quietly.

### 7.3 Dexie schema (`db/dexie.ts`, version 1) [live]

| Table | Key | Indexes | Purpose |
|---|---|---|---|
| `events` | `id` | `synced`, `itemId`, `at` | Every `ReviewEvent`, local and pulled. `synced: 0|1`. |
| `outbox` | `seq` (auto) | `kind`, `createdAt` | Non-progress uploads: `flag`, `beacon`, `error`. `{kind, payload, attempts, lastError}`. |
| `packages` | `packageId` | | `{packageId, version, hash, bytes, json}` — the whole package as one record. |
| `kv` | `key` | | `installId`, `auth`, `profile`, `entitlement`, `syncCursor`, `lastBackupAt`, `onboarding`, `pendingPayment`, `presentationsBeforePaywall`, `goalSheetShownDay`, `swUpdateAvailable`, `theme`, `downloadReceivedBytes`. |

Schema changes are Dexie versions with upgrade functions; never delete `events`.

The `kv` keys are a TypeScript union in `db/dexie.ts`, so a typo is a compile error and the set
above is enumerable. `theme` (§7.9's manual override) and `downloadReceivedBytes` (§7.5's resume
point) were added in the app-shell ticket; `goalSheetShownDay` (the Tehran `dayKey` the
goal-reached sheet last appeared on) in the review ticket.

### 7.4 Backup (sync) state machine — `sync/backup.ts` [building]

The owner's word for this is **backup**; the mechanism is ADR-0002's event-log union.

States: `idle → pushing → pulling → idle` with `error(reason)` returning to `idle` after a backoff
(1 min, 5 min, 15 min, then hourly). Runs only when `navigator.onLine` and logged in.

Triggers: app start; `online` event; end of a study session; every 5 minutes while the app is
open; immediately after login; a manual button in settings.

- **Push:** `events where synced = 0`, batches of 500, `POST /api/sync/push`. Server inserts,
  ignoring ids it already has. On `200`, mark those ids `synced = 1`. Also drains `outbox`
  (each kind to its route; an item is deleted only on `2xx`; `4xx` other than 429 drops it
  with a breadcrumb — the record is malformed and retrying will not help).
- **Pull:** `GET /api/sync/pull?since=<cursor>` in pages; insert unknown ids with `synced = 1`;
  store the cursor. A pull that brings new events triggers a re-fold.
- Never blocks UI. Never shows an error to the user beyond «پشتیبان‌گیری در انتظار اینترنت»
  in settings. Failures log a breadcrumb; repeated failures (≥ 5) log one `client_errors` record
  of kind `sync`.
- **Login merge:** after OTP succeeds on a device that already has local events, set every local
  event to `synced = 0` and run push then pull. Push is idempotent by id, so re-sending is safe;
  nothing local is ever deleted. Profile: local wins if newer (`updatedAt`).
- **Restore on a fresh device:** login → pull everything → fold → progress is back. If the
  server says entitled, the paid download (§7.5) starts immediately.

Anonymous installs are not backed up (there is no identity to restore to). The app asks the user
to «ذخیرهٔ پیشرفت با شمارهٔ موبایل» once after 50 presentations and always from settings.

Built so far: the state union, the pure `transition(state, event)` (total — every state answers
every event — and tested as a full table) and the backoff ladder. `run()` is a stub that logs one
breadcrumb; the push, the outbox drain and the pull are wired in Phase 4. Two transitions the
spec did not name, decided here: a `START` while a run is in flight is ignored rather than
restarting it, and a `START` from `error` **does** run immediately, because it is the manual
button in settings and a user who taps it should not wait out an hour's backoff.

### 7.5 Content download state machine — `sync/download.ts` [building]

States: `none → checking → downloading(progress) → verifying → installed` and `error(reason)`
with the same backoff as backup. Runs when online and entitled and `packages.paid` is missing or
older than the manifest's version.

- `GET /api/content/manifest` → compare versions.
- `GET /api/content/paid` with `Range` resumption: the response is written into an in-memory
  buffer as it streams; on interruption, the received byte count is kept in `kv` and the next
  attempt asks `Range: bytes=<n>-`. On completion: sha256 of the canonical `items` JSON must equal
  `manifest.paid.hash`, else discard and retry.
- Swap: write `packages.paid`, set `content.active = 'paid'`, keep `free` (harmless).
- The paywall-result screen and settings show progress («دانلود واژه‌ها ۶۳٪ — با اینترنت ادامه
  پیدا می‌کند»). Study continues on whatever package is active during the download.

Built so far: the state union and the pure `transition(state, event)`, total over six states and
eight events and tested as a full 48-cell table; `run()` is a stub until Phase 5. `installed`
carries the version it installed, and `error → RETRY` returns to `none` rather than to the
interrupted step, so the next attempt re-reads the manifest — the received byte count is in `kv`
and the `Range` header makes restarting from the top nearly free.

### 7.6 Entitlement on the device [building]

`kv.entitlement = { status: 'none' | 'full', source, grantedAt, checkedAt }`. Written only from a
server response (`/api/me` or the purchase result). Read offline forever; never expires. An online
check that says `none` while the cache says `full` is logged as a `client_errors` record and the
cache is **kept** until the owner acts — the app never revokes on its own.

### 7.7 Service worker and updates

- Precache: app shell, fonts, `content/free.json` — Workbox revisions it by its own content
  hash (computed at `generateSW` time from the file's bytes); Vite does not rename or hash the
  file itself, since it ships from `apps/web/public/` untouched. Navigation fallback to
  `index.html`.
- `registerType: 'prompt'`. A new version is downloaded in the background; the app shows a small
  «نسخهٔ جدید آماده است — اعمال» chip on the home screen and applies on tap or on the next cold
  start. Never mid-session.
- Runtime caching: none for `/api/*` (the app has its own DB). Network-only.
- `navigator.storage.persist()` is requested at the end of onboarding; the result is kept in the
  error snapshot. Storage estimate is checked before a paid download.
- The SW never serves a partially updated shell: Workbox precache is atomic per version.

### 7.8 Screens

All screens work offline unless marked **online**. Persian copy lives in `strings.ts`.

**Every route below exists as of the app-shell ticket**, in one flat `createBrowserRouter` table
in `routes.tsx`, inside a root layout that owns the theme attribute and the React error boundary.
The rows marked **[live]** are built; the rest are placeholders that render their Persian title,
each waiting on its own ticket. A path that matches nothing renders a Persian not-found screen inside the same layout,
because the service worker answers every navigation with `index.html` (§7.7).

| Route | Screen | States / notes |
|---|---|---|
| `/onboarding` | 3 slides (what it is, the exam-frequency claim, Leitner in one picture) → minutes/day → exam date (Jalali picker, skippable) → field (skippable, from `content/field-codes.json`) → placement (skippable) → install nudge | Writes `profile`; `beacon onboarding_done`. |
| `/` | Home `[live]` | Goal ring (today's presentations / goal), streak, progress %, conquered count, one primary button «شروع مرور», the update chip (renders when `kv.swUpdateAvailable`; wired in ticket 05), backup status dot (from `stores/sync`, hidden when anonymous), bottom nav to `/boxes`, `/progress`, `/settings`. Also owns the once-only redirect to `/season` (`kv.seasonShownFor`). |
| `/review` **[live]** | Card | Front: word, exam badge («۱ بار در کنکور، سال ۱۴۰۲»), tap to reveal. Back: translations + one sentence (the exam stem for answer-words, else the authored example); «بیشتر» expands definition, other senses, confusables, exam history, and «راهنمای یادگیری» is its own collapsed disclosure. Buttons: «بلد نبودم» / «بلد بودم»; overflow (⋯): «این را بلدم» (know), «این کلمه اشکال دارد» (flag sheet with 3 reasons → `outbox` `flag`). Feedback: box change and «دفعهٔ بعد: ۲ روز دیگر», ~900 ms or a tap. Goal reached → congratulation sheet, once per Tehran day (`kv.goalSheetShownDay`), never blocking. `kv.presentationsBeforePaywall` counts up while the entitlement is `none`; at `freePresentationLimit` → `/paywall`, once per session, `beacon paywall_shown`. Beacons `first_review`, `reviews_10`, `reviews_100` on crossing. «پایان» → `/session/summary`. |
| `/session/summary` | End of session `[live]` | Presentations, accuracy, conquered today (from `stores/session`), streak (from `engine.streak`); «ادامه» or «خانه». |
| `/boxes` | Leitner boxes `[live]` | Five columns with counts (`boxCounts`) plus «دیده‌نشده»; tap a box → inline list of words in it with next-due relative time (`ui/relative-time.ts`); tap a word → `/word/:id`. Bottom nav. |
| `/word/:id` | Word detail `[live]` | `screens/word/WordDetail.tsx`: every sense, confusables, exam history, a review timeline (one dot per event, grade 1 filled), «این را بلدم», a flag sheet (3 reasons → `outbox` kind `flag`). |
| `/progress` | Progress `[live]` | Percent with the one-sentence rule («هر بار که یک کلمه در کنکور آمده، یک امتیاز»), conquered/total, a hand-rolled SVG 30-day bar chart (`engine/chart-data.ts`, pure), pace estimate vs exam date with a goal nudge when `verdict === 'behind'`. Bottom nav. |
| `/paywall` | Paywall | The pace argument, what is included, price with strike-through, «خرید» → login if anonymous → `/checkout`. «بعداً» returns to study (early-pool cards keep the app usable). **Placeholder until Phase 5:** the argument and «بعداً» are live; the price and «خرید» arrive with payment. |
| `/login` | Phone + OTP — **online** | States: `enterPhone → sending → enterCode → verifying → done`; errors: rate-limited (shows retry-after), wrong code (attempts left), network (retry). Explains why the number is needed (restore + purchase). |
| `/checkout` | Price, discount code — **online** | `quote` on code entry; «پرداخت» → `pay/request` → redirect to Zarinpal. |
| `/purchase/result` | Callback landing — **online** | `?status=ok|failed`; on ok: fetch `/api/me`, cache entitlement, start download, show progress; on failed: reason + retry. If a `pendingPayment` exists on next launch, ask `/api/pay/status/:id` before assuming failure. |
| `/settings` | Settings `[live]`* | Account (phone or «ورود» → `/login`), goal (minutes → `goalFromMinutes`), exam date (Jalali text input via `date-fns-jalali`), field (`content/field-codes.json`, named codes only), theme, backup row + manual button (calls `sync/backup.ts`'s `run()`), download row (state only), «نصب برنامه» (placeholder, ticket 05), «گزارش مشکل» → `reportError('user_report', …)`, about + version + support link. *Local parts are fully wired; account/backup/download show live store state but `run()` is still a stub until Phase 4/5. |
| `/season` | Season summary `[live]` | Shown once when the exam date passes (`engine/season.ts`, pure): conquered, days studied, presentations; «تاریخ جدید» → `/settings`. |

Install prompt: on Android Chrome, `beforeinstallprompt` is captured and offered as a sheet at
the end of onboarding and from settings. In-app browsers (Telegram, Instagram) do not fire it —
the app detects them (UA sniff) and shows «در Chrome باز کنید» with a copy-link button. iOS shows
the Share → Add to Home Screen instruction. The landing page also offers the APK.

### 7.9 Design system — **decided 2026-09-18** (ADR-0020)

- **Components:** the shadcn/ui pattern — Radix primitives copied into `apps/web/src/ui/`,
  styled with Tailwind v4 utilities and the tokens below. No component library at runtime.
- **Look:** "liquid glass" in the shadcn idiom — translucent surfaces (`backdrop-filter: blur`),
  large radius (24 px cards, 12 px controls, full-round pills), soft one-pixel borders, no drop
  shadows heavier than `shadow-sm`, dark cards allowed on a light ground for emphasis.
- **Palette:** monochrome. One neutral gray scale (50–950) plus pure black and white; a light
  theme and a dark theme (`prefers-color-scheme` with a manual override in settings). **Colour
  is reserved for the two grading buttons** («بلد بودم» green, «بلد نبودم» red) and destructive
  confirmations. Everything else, including progress rings and charts, is gray-scale.
- **Typography:** Sonnat's type scale — 16 px base; h1 56/1.29, h2 48/1.33, h3 32/1.5,
  h4 24/1.67, h5 20/1.8, h6 18/1.78, subtitle 16/1.75, subtitle-sm 14/1.71, body 16/1.63,
  body-sm 14/1.57, caption 12/1.67, caption-sm 10/1.8; headings and subtitles weight 500, body
  400. Persian face: **Vazirmatn** (self-hosted woff2, weights 400/500/700, SIL OFL) with the
  fallback stack `Vazirmatn, Tahoma, Arial, sans-serif`. Sonnat's own face is IRANSans, which is
  commercial; if the owner buys a web licence the swap is one `@font-face` block in
  `packages/design/fonts.css`. Latin (the English word on the card) uses the same face.
- **Tokens:** `packages/design/tokens.css` defines every colour, radius, spacing and type step
  as CSS variables on `:root` and `[data-theme="dark"]`; Tailwind v4 reads them through
  `@theme`. Motion 150–250 ms, `prefers-reduced-motion` respected.
- **Hints on the card** are collapsed by default behind «راهنمای یادگیری»; a word without a
  hint shows «راهنمای این کلمه به‌زودی اضافه می‌شود» inside the same disclosure.

Fixed regardless of choice: mobile-first at 360–430 px, RTL, minimum tap target 44 px, Persian
digits via `Intl.NumberFormat('fa-IR')`, no more than one primary action per screen, no
decorative illustration on the review card.

---

## 8. The server (PocketBase)

### 8.1 Collections (`pb_migrations/`) `[live]`

`users` is the auth collection; every other collection is ours. API rules are the security
boundary; hooks add behaviour.

| Collection | Fields | Rules |
|---|---|---|
| `users` (auth) | `phone` (text, unique, E.164), `profile` (json: minutes, goal, examDate, fieldCode, updatedAt), `lastSeenAt` | list/view: `@request.auth.id = id`; create/update via hooks only. |
| `review_events` | `id` (text, 36 chars, UUIDv7 — the id field's pattern is widened), `user` (rel), `itemId`, `at` (number), `kind`, `grade`, `device` | No direct API access; only the sync routes. |
| `entitlements` | `user` (rel), `product` (`full`), `source` (`zarinpal` / `manual` / `bazaar`), `payment` (rel, optional), `grantedAt`, `note` | view: own; write: hooks/superuser only. |
| `payments` | `user`, `listPrice`, `salePrice`, `discountCode` (text), `discountAmount`, `payable`, `authority`, `refId`, `cardPan`, `status` (`pending`/`verified`/`failed`/`expired`), `verifiedAt`, `raw` (json) | view: own; write: hooks only. |
| `discount_codes` | `code` (unique, uppercase), `type` (`percent`/`fixed`), `value`, `maxUses`, `usedCount`, `perUserOnce` (bool), `expiresAt`, `active`, `note` | superuser only. Managed in the PB admin UI. |
| `otp_codes` | `phone`, `codeHash`, `expiresAt`, `attempts`, `ip` | hooks only. Purged by cron. |
| `word_flags` | `user` (optional), `installId`, `itemId`, `reason` (`translation`/`example`/`hint`), `appVersion`, `at` | create via route; read superuser. |
| `beacons` | `installId`, `user` (optional), `name` (enum, §8.4), `at`, `appVersion` | create via route; read superuser. |
| `client_errors` | see §10.1 | create via route; read superuser. |
| `app_config` | single record: `listPrice`, `salePrice`, `freePresentationLimit`, `minAppVersion`, `supportUrl`, `notice` | public read; superuser write. |

In `pb_migrations/1758000000_init.js` a rule of `""` means anyone and `null` means nobody through
the REST API — only a hook (which writes with `app.save()`, bypassing rules) or a superuser. The
`users` collection is PocketBase's default one, edited rather than created: `passwordAuth` off,
`authToken.duration` 365 days, `email` made optional because the OTP flow creates an account from
a phone number alone. `app_config` is seeded by the same migration with 450000 / 290000 / 100.

### 8.2 Routes (`pb_hooks/`)

Every route is registered through `lib/route.js` → `withRoute(name, handler, opts)`, which
authenticates (`opts.auth` is `none` / `user` / `superuser` / `optional`), validates the body
against `opts.schema`, caps it at 32 KB, catches everything, logs one structured record (§10.2)
and answers `{ error: { code, message } }` with a stable `code` — one of `BAD_INPUT`,
`UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`, `INTERNAL`. Bodies are JSON. Auth is the
PocketBase bearer token. Because PocketBase serializes each handler into its own isolated context,
`withRoute` is required and applied *inside* the handler, not around it (see how-why §5.4).

| Route | Auth | Body → Response | |
|---|---|---|---|
| `GET /api/config` | none | `app_config` fields. | `[live]` |
| `POST /api/otp/request` | none | `{phone}` → `{ok, retryAfter}`. Limits: 3 per phone / 10 min, 10 per IP / hour. 5-digit code, 3-minute expiry, sent with the SMS provider's OTP template. | `[planned]` |
| `POST /api/otp/verify` | none | `{phone, code}` → PocketBase auth response `{token, record}`. ≤ 5 attempts per code. Finds or creates the user by phone. | `[planned]` |
| `GET /api/me` | user | `{user, entitlement, profileUpdatedAt}`; also refreshes `lastSeenAt`. | `[live]` |
| `PATCH /api/me/profile` | user | `{profile}` → stored if `updatedAt` is newer. Equal is not newer. | `[live]` |
| `POST /api/sync/push` | user | `{events: ReviewEvent[]}` (≤ 500) → `{accepted, duplicates}`. Insert-ignore by id; `user` set from auth, never from the body. | `[planned]` |
| `GET /api/sync/pull?since=&limit=` | user | `{events, cursor, more}`. Cursor = `created` + id. | `[planned]` |
| `GET /api/content/manifest` | none | `{free: {version, hash, bytes}, paid: {version, hash, bytes}}`. | `[planned]` |
| `GET /api/content/paid` | user + entitled | The file, with `Range` support. 20 per user per day. | `[planned]` |
| `POST /api/pay/quote` | user | `{code?}` → `{listPrice, salePrice, discountAmount, payable, codeStatus: 'ok'|'invalid'|'expired'|'exhausted'|'used'}`. | `[planned]` |
| `POST /api/pay/request` | user | `{code?}` → `{paymentId, gatewayUrl}`. Creates the pending payment, applies the code, calls Zarinpal `request`. A `payable` of 0 (100 % code) grants directly and returns `{paymentId, granted: true}`. | `[planned]` |
| `GET /api/pay/callback` | none (Zarinpal) | `?Authority=&Status=` → verifies with Zarinpal using the stored `payable`, flips the payment, creates the entitlement, increments the code's `usedCount`, then `302` to `/purchase/result?status=ok&ref=`, or `…?status=failed&reason=`. Idempotent (Zarinpal code 101 = already verified). | `[planned]` |
| `GET /api/pay/status/:id` | user (own) | `{status, refId}`. | `[planned]` |
| `POST /api/flags` | optional | `{installId, itemId, reason, appVersion, at}` → `{ok}`. 50 per install per day. | `[planned]` |
| `POST /api/beacon` | optional | `{installId, events: [{name, at, appVersion}]}` → `{ok}`. Unknown names rejected. | `[planned]` |
| `POST /api/client-errors` | optional | one record (§10.1) → `{ok, deduped}`. 30 per install per day; same fingerprint within an hour increments `count` instead of inserting. | `[planned]` |
| `GET /api/health` | none | `{ok, version, time}`. `version` is `<pocketbase>+hooks.<n>`. Registered as a middleware, not a route: PocketBase owns this path (how-why §5.4). | `[live]` |
| `GET /api/admin/stats?range=` | superuser | Aggregates for the dashboard (§11.2). | `[planned]` |
| `POST /api/admin/grant` | superuser | `{phone, note}` → creates the user if missing and an entitlement with `source: manual`. | `[planned]` |
| `GET /api/admin/sourcemap/:sha/:file` | superuser | Serves a source map from `/opt/kl/sourcemaps/` for symbolication. | `[planned]` |

Crons (`pb_hooks/cron.pb.js`): purge expired `otp_codes` hourly; `reconcileUnverified` every 15
minutes (Zarinpal `unverified` → verify any successful-but-unverified authority we own; this is
the safety net for a user who closed the browser during the redirect); mark `pending` payments
older than 2 hours `expired`.

Rate limits use PocketBase's built-in rate-limit rules where they fit (per route, per IP) and an
in-hook counter where the key is a phone number or install id.

### 8.3 Payment rules

- Prices are read from `app_config` on the server at request time; the client only displays.
- Amounts are toman everywhere; Zarinpal v4 is called with `currency: "IRT"` on both `request`
  and `verify`, so no merchant-panel setting is involved. Verified once in Phase 5 with a real
  1,000-toman payment and recorded here.
- Verification compares the amount; a mismatch fails the payment and logs an error.
- A user who already holds an entitlement gets `codeStatus: 'already-entitled'` from `quote` and
  `request` refuses to charge twice.
- Discount code validation order: exists → active → not expired → `usedCount < maxUses` → not
  already used by this user when `perUserOnce` → compute. All on the server; the client never
  computes a price.
- Refunds are manual (owner, in the Zarinpal panel); the owner then deletes the entitlement in
  the PB admin UI. The client keeps its cache until the next online `/api/me` — see §7.6.

### 8.4 Beacon names (fixed list)

`first_open`, `onboarding_done`, `first_review`, `reviews_10`, `reviews_100`, `paywall_shown`,
`login_done`, `purchase_started`, `purchase_done`, `download_done`, `install_prompt_shown`,
`install_prompt_accepted`, `season_shown`. Adding a name is a change to this file and to the
server's allow-list in the same commit.

---

## 9. Sequences

### 9.1 First launch to paywall (offline-capable after the first paint)

1. Landing or direct link → `app.konkurleitner.com` → shell + free package precached.
2. Onboarding (all local) → `profile` written → placement (optional) → install sheet.
3. Study: `nextCard` → reveal → grade → event appended (`synced: 0`) → re-fold → next.
   Network state is irrelevant to this loop.
4. `presentationsBeforePaywall` reaches `freePresentationLimit` → `/paywall` (offline too; it
   just explains and offers «بعداً»).

### 9.2 Purchase

`/paywall` → «خرید» → `/login` (OTP, online) → merge local events into the account →
`/checkout` → optional code → `pay/request` → Zarinpal page → callback → server verify →
`/purchase/result` → entitlement cached → paid package download (resumable) → done.
From here on, no network is ever required again.

### 9.3 Reinstall / new device

Install → onboarding offers «قبلاً حساب داشتم» → `/login` → pull all events → fold → home shows
the old progress → if entitled, paid download starts → done.

---

## 10. Logging and debuggability

Goal: any bug is fixable by an agent from the log record alone. Three layers.

### 10.1 Client error record (`client_errors`) [live] (client side)

Captured by `log/errors.ts` from `window.onerror`, `unhandledrejection`, a top-level React error
boundary, service-worker errors, and explicit `reportError(kind, err, data)` calls in the state
machines. Queued in `outbox` (so it survives offline) and sent through `POST /api/client-errors`.

```ts
interface ClientErrorRecord {
  kind: 'error' | 'unhandledrejection' | 'react' | 'sw' | 'sync' | 'download' | 'payment' | 'user_report';
  fingerprint: string;          // sha1(kind + message + top stack frame)
  message: string;
  stack: string | null;         // minified; symbolicated by tools/errors
  appVersion: string; buildSha: string;
  route: string;
  installId: string; userId: string | null;
  at: number; online: boolean;
  device: { ua: string; platform: string; screen: string; memory: number | null; standalone: boolean; twa: boolean };
  breadcrumbs: Array<{ at: number; type: 'nav' | 'tap' | 'sync' | 'download' | 'sw' | 'net' | 'engine' | 'log'; msg: string; data?: unknown }>; // last 50
  snapshot: {
    eventCount: number; unsyncedCount: number; lastBackupAt: number | null; syncState: string;
    entitlement: string; activePackage: string | null; packageVersions: Record<string, string>;
    downloadState: string; swVersion: string | null; storage: { persisted: boolean; usage: number; quota: number };
    goal: number; streak: number; presentationsToday: number; lastEvents: ReviewEvent[] /* last 20 */;
  };
  userNote: string | null;      // only for user_report
  count: number;                // server-side dedupe within an hour
}
```

Breadcrumbs are recorded by every store action, every route change, every state-machine
transition and every network call (method, route, status, ms) — never bodies, never phone numbers.

### 10.2 Server logs

Every hook route runs inside `withRoute`, which logs to PocketBase's logger with structured
attributes: `route`, `userId`, `installId`, `ms`, `status`, and on failure `code`, `err`,
`input` (redacted: phone masked, codes hashed). PocketBase stores these in its `_logs` table,
visible in the admin UI and readable through `/api/logs` as superuser. Payment and OTP routes
additionally log one line per external call (`zarinpal.request`, `sms.send`) with the provider's
status and reference, never the secret.

### 10.3 Tools that turn logs into a fix

- `pnpm errors --since 24h [--kind payment] [--fingerprint X] [--user PHONE]` — pulls
  `client_errors` as superuser, **symbolicates** stacks against the source maps for that
  `buildSha` (uploaded at deploy to `/opt/kl/sourcemaps/<sha>/`, fetched via
  `/api/admin/sourcemap`), and prints each record as a readable report: message, resolved
  frames, breadcrumbs, snapshot. Group mode: `--group` prints fingerprints by count.
- `pnpm logs --since 24h [--route pay.callback] [--level error]` — the server side.
- `pnpm flags` — word flags grouped by word and reason.
- Credentials for these come from `.env.local` (`KL_API_ORIGIN`, `KL_ADMIN_EMAIL`,
  `KL_ADMIN_PASSWORD`) — the tools log in as superuser and never store a token in git.

The procedure an agent follows is `docs/runbooks/debug-from-log.md`: run `pnpm errors`, read the
symbolicated frame, reproduce with the snapshot (the last 20 events and the package version are
enough to reconstruct the fold), fix, add the regression test, ship.

### 10.4 User-initiated report

Settings → «گزارش مشکل» → optional short note → sends a `user_report` record with the full
snapshot. Works offline (queued). The owner sees it in the dashboard within a minute of the
device being online.

### 10.5 Deploy log

Every deploy appends `sha, version, who, when, what` to `/opt/kl/deploys.log` on the server and a
line to `wiki/log.md`. `APP_VERSION` and `BUILD_SHA` are shown in settings, so a screenshot from
a user identifies the build.

---

## 11. Admin

### 11.1 PocketBase admin UI (`admin.konkurleitner.com/_/`)

Used as-is for: users (search by phone), entitlements (grant / delete), payments, discount codes
(create, disable), word flags, client errors (raw), beacons, app config, logs, backups, and
settings. Superuser account: the owner, strong password, MFA via PocketBase's OTP once an SMTP
route exists (later).

### 11.2 Dashboard (`apps/admin`, at `admin.konkurleitner.com/`)

One small React app, superuser login, four pages, read-only except «grant»:

| Page | Shows |
|---|---|
| Overview | Sales today / 7 d / 30 d (count, toman), verified vs failed, active installs (beacons), funnel counts for the fixed beacon list, unsynced-error count. |
| Reports | `word_flags` grouped by word and reason, sorted by count, link to the word's lexicon file path. |
| Errors | `client_errors` grouped by fingerprint (count, last seen, app version), expand → symbolicated stack + breadcrumbs + snapshot, «Export JSON». |
| Users | Phone search → entitlement, payments, event count, last seen; «Grant access» with a note. |

Data comes from `GET /api/admin/stats` and direct PocketBase list calls as superuser. No writes
except `admin/grant`.

---

## 12. Landing page (`apps/landing`, `konkurleitner.com`)

One static page, same tokens as the app: what it is, the exam-frequency claim with real numbers,
how the boxes work in one picture, price with the launch discount, «نصب نسخهٔ وب» (→ app origin),
«دانلود اپ اندروید» (→ `/downloads/konkurleitner-<version>.apk`), support link, privacy line.
Detects in-app browsers and tells the user to open in Chrome. No JavaScript beyond that check.
`www.` redirects to the apex.

---

## 13. Android APK (TWA)

- `android/` holds a Bubblewrap project: `applicationId com.konkurleitner.app`, host
  `app.konkurleitner.com`, full-screen, portrait, splash from the app icon, `fallbackType:
  customtabs` for devices without Chrome.
- `https://app.konkurleitner.com/.well-known/assetlinks.json` carries the SHA-256 of the signing
  key; served from `pb_public`.
- Signing key: generated once by the builder, stored by the owner in a password manager and as a
  GitHub secret (`ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`).
  **Losing it means a new package id forever.**
- CI job `android` (manual trigger or a `v*` tag): JDK 17 + Android SDK, `bubblewrap build`,
  upload `konkurleitner-<version>.apk` to `/opt/kl/landing/downloads/` and as a GitHub Release
  asset. The APK updates itself only when the PWA updates (the shell is the web app); the APK
  file needs rebuilding only when the manifest, icon or package config changes.
- Bazaar (phase two): a second origin `bazaar.konkurleitner.com` serving a build with the Zarinpal
  checkout removed and BazaarPay in its place; `applicationId com.konkurleitner.app.bazaar`.

---

## 14. Infrastructure and deployment

### 14.1 The machine `[building]`

One Parspack **VPS2**: 1 vCPU, 2 GB RAM, 40 GB SSD, Ubuntu 24.04 LTS, Iran location (100 GB/month
traffic, which is ~150,000 paid-package downloads). PocketBase and Caddy idle under 200 MB; this
tier carries thousands of users, and Parspack resizes in place if it ever does not. Setup is
`docs/runbooks/server-setup.md` (planned) and is scripted in `server/deploy/bootstrap.sh`:

- user `kl` (no root login, SSH keys only, password auth off), `ufw` allowing 22/80/443,
  unattended security upgrades, `fail2ban` on SSH.
- Caddy from the official apt repo. PocketBase binary at the pinned version under
  `/opt/kl/pocketbase`, `pb_data` at `/opt/kl/pb_data`, systemd unit `kl-pocketbase.service`
  with `EnvironmentFile=/opt/kl/.env` (mode 600, owner `kl`).
- Directories: `/opt/kl/{pb_public,pb_hooks,pb_migrations,content,landing,admin,sourcemaps,backups}`.

### 14.2 Caddyfile (shape) `[building]`

```
konkurleitner.com, www.konkurleitner.com {
  redir https://konkurleitner.com{uri} 308   # on www only
  root * /opt/kl/landing
  encode zstd gzip
  file_server
}
app.konkurleitner.com {
  encode zstd gzip
  @admin path /_/*
  respond @admin 404
  reverse_proxy 127.0.0.1:8090
}
admin.konkurleitner.com {
  encode zstd gzip
  handle /api/* { reverse_proxy 127.0.0.1:8090 }
  handle /_/*   { reverse_proxy 127.0.0.1:8090 }
  handle        { root * /opt/kl/admin  file_server }
}
```

TLS: Caddy's automatic Let's Encrypt with ZeroSSL fallback. If neither CA is reachable from the
Iranian IP (verified on day one of Phase 4), the fallback is ArvanCloud's free CDN in front with
its edge certificate — recorded here if it happens.

### 14.3 DNS

`A` records for the apex, `www`, `app`, `admin` → the VPS IP, hosted on **Parspack's CDN
product** (free plan, DNS-only — proxying off), nameservers `hail.parspack.net` /
`star.parspack.net`. Done 2026-09-18; procedure and the two problems hit along the way are in
`docs/runbooks/server-setup.md`.

### 14.4 Deploy procedure

`pnpm deploy <target>` with targets `web`, `server`, `content`, `landing`, `admin`, `all`
(`tools/deploy/*.sh`, rsync over SSH as `kl`):

1. Refuses unless the working tree is clean and `HEAD` equals `origin/main`.
2. `web`: build → rsync `apps/web/dist/` → `/opt/kl/pb_public/` (atomic: rsync to
   `pb_public.new`, then `mv`) → upload `*.map` to `/opt/kl/sourcemaps/<sha>/` and delete them
   from `pb_public`.
3. `server`: rsync `pb_hooks/`, `pb_migrations/` → `systemctl restart kl-pocketbase` (migrations
   run on start) → `curl /api/health`.
4. `content`: `pnpm content:build` → rsync `server/content/` (the paid package + manifest).
5. Append to `/opt/kl/deploys.log` and print the line for `wiki/log.md`.

The same scripts run from GitHub Actions on push to `main` **if** the runner can reach the VPS
over SSH (tested in Phase 4). If it cannot, deploys run from the owner's machine through Claude
Code with the same scripts; CI still gates every PR. Either way the deployed artefact is a
clean build of `main`.

### 14.5 Server-state backups

`pb_data/` is the whole business. PocketBase's built-in backup: nightly at 03:30 Tehran to
`/opt/kl/backups` and to an S3-compatible bucket (Parspack object storage if offered, otherwise
ArvanCloud storage), keep 14. `tools/backup-pull.sh` copies the newest backup to the owner's
disk weekly. A restore into a scratch PocketBase is rehearsed monthly and logged in
`wiki/log.md`. Before any PocketBase upgrade or migration: a manual backup first.

### 14.6 Monitoring

`GET /api/health` polled by a systemd timer on the VPS that writes to the journal; Caddy access
logs in JSON at `/var/log/caddy/`; disk-space check in the same timer (alert threshold 80 %,
written to the dashboard's overview as a warning). External uptime monitoring is a later add.

---

## 15. Security and abuse

- Secrets only in `/opt/kl/.env` and GitHub secrets; names in `.env.example`.
- OTP: limits in §8.2; codes hashed at rest; 3-minute expiry; 5 attempts.
- Payment: verification is server-to-server with the amount; entitlement never written from a
  client request; callback idempotent.
- Content: the paid file only through the gated route, 20 fetches per user per day; the free
  file is public by design.
- Sync: `user` always from the auth token; a body cannot write another user's events; 500 events
  per push; a wildly out-of-range `at` (± 1 year) is stored but flagged in server logs.
- Client errors / flags / beacons: per-install daily caps; bodies capped at 32 KB; no free text
  except the optional `userNote` (500 chars), which is only ever read by the owner.
- Admin: PB admin UI reachable only on the admin origin; superuser password ≥ 20 chars; PB's
  built-in rate limit on `/api/collections/_superusers/auth-with-password`.
- No PII beyond the phone number is collected. The privacy line on the landing page says so.

---

## 16. Testing and CI

### 16.1 `packages/core`

Vitest + fast-check. Required cases: empty log; single event per kind; promotion only when due;
early correct answer does not promote; forgot always demotes and bumps lapses; `know` reaches 5;
high-water mark never decreases; duplicate ids ignored; shuffled log folds identical (property);
Tehran day boundary at 00:00 +03:30; streak edge cases (yesterday counts, two-day gap breaks);
progress with weight 0 items; pace estimate with no history; queue pool order; suppression window
with a pool smaller than the window; introduction budget floor and cap; 90-day simulated user
produces a schedule where a word can be conquered in exactly 7 days but the median is longer.

### 16.2 `apps/web`

- Unit: state machines (`backup`, `download`) with a fake API and fake clock — every state and
  every transition, including interrupted downloads and 429s.
- E2E (Playwright, Android-sized viewport, against a real PocketBase started by the test runner
  with `SMS_PROVIDER=console` and a Zarinpal mock route): onboarding → 10 reviews → **offline**
  (`context.setOffline(true)`) → 10 more reviews → back online → backup happens → paywall at the
  limit → login with the console OTP → checkout with a discount code → mock gateway → result →
  paid download → offline → study from the paid package → reload → state intact. Second spec:
  restore on a fresh context. Third: an error is captured and symbolicates.
- Bundle budget: app shell ≤ 300 KB gzipped, checked in CI (ADR-0005).

### 16.3 Server

`server/test/` (Vitest, `pnpm test:server`) starts the pinned PocketBase binary on a random port
against an empty temp `pb_data` with this repo's hooks and migrations, creates a superuser through
the CLI, and exercises the routes over real HTTP — API rules, goja semantics and the error
envelope do not exist in a mock. It is a separate job from `ci`, because the root `pnpm test` must
stay runnable without the binary. `users` has password auth disabled, so a test gets a user token
through the superuser-only `POST /api/collections/users/impersonate/:id`.

Covered today: the migrations apply from empty and every collection has the rules of §8.1;
`config`, `health`, `me` and `me/profile` including newer-wins; the `withRoute` envelope, its codes
and its structured log line with the phone masked and secrets hashed. Still to cover as the routes
land: OTP rate limits, push idempotency, pull paging, content gate refusing an unentitled user,
quote/request for each `codeStatus`, callback with a wrong amount, callback replay,
`reconcileUnverified`. The e2e job exercises every route end to end.

### 16.4 CI jobs

`ci` (lint, typecheck, unit, build, budget) on every PR; `server` on every PR (the API suite,
§16.3); `e2e` on every PR; `deploy` on `main` if SSH works; `android` on tags. `server` and `e2e`
download the pinned PocketBase binary into `server/.pb/` and share one cache key. Branch
protection requires `ci`, `server` and `e2e`.

---

## 17. Code conventions (so an agent can debug it)

1. **One concept, one file, one name.** No barrel files except package roots. No `utils.ts`.
2. **State machines are explicit.** A union of string states, one `transition(state, event)`
   function, a breadcrumb on every transition. No booleans like `isLoading && !hasError`.
3. **No clever types.** Interfaces and unions; no conditional/mapped-type gymnastics in app code.
4. **Errors carry codes.** `class AppError extends Error { code: string; data?: unknown }`.
   Every `catch` either handles a named code or reports and rethrows. Never swallow.
5. **Persian only in `strings.ts`.** Components reference keys.
6. **The engine is called through `engine/`**, never imported into components directly.
7. **No `Date.now()` outside `engine/clock.ts`.** Tests inject the clock.
8. **Every network call goes through `net/api.ts`**, which logs a breadcrumb and maps HTTP
   errors to codes.
9. **Dependencies are boring and few.** Adding one requires a line in `how-why.md` saying why.
10. **A ticket before code, a test with every fix, this file updated in the same commit.**

---

## 18. Configuration and secrets

`.env.example` is the list of record. Server (`/opt/kl/.env`): `SMS_PROVIDER`
(`kavenegar`|`console`), `SMS_API_KEY`, `SMS_OTP_TEMPLATE`, `ZARINPAL_MERCHANT_ID`,
`ZARINPAL_SANDBOX` (`0`|`1`), `ZARINPAL_CALLBACK_URL`, `PUBLIC_APP_ORIGIN`, `CONTENT_DIR`,
`SOURCEMAP_DIR`, `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_KEY`, `BACKUP_S3_SECRET`.
Local bootstrap (`.env.local`, git-ignored, used once): `VPS_IP`, `VPS_ROOT_PASSWORD`. DNS is
done (§14.3) and needs no key — it is managed by hand in Parspack's CDN panel.
GitHub: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `ANDROID_KEYSTORE_B64`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`. Build: `VITE_API_ORIGIN`, `VITE_APP_NAME`
(the deferred Persian name — one constant). Local tools (`.env.local`, git-ignored):
`KL_API_ORIGIN`, `KL_ADMIN_EMAIL`, `KL_ADMIN_PASSWORD`.

---

## 19. Known limitations and open items

- The **Persian app name** is pending the owner (`VITE_APP_NAME`); the design system is decided (§7.9).
- **Hints do not exist yet** (0 of 2,098); the free 150 need approved hints before launch.
- **Word data is 895 of 2,098**; the paid package grows with content updates until complete.
- iOS: no install prompt API; storage for a home-screen PWA is persistent in practice but not
  guaranteed by Apple. The audience is overwhelmingly Android; iOS is supported, not optimised.
- Anonymous progress is not backed up until the user gives a phone number — a deliberate trade
  against asking for a number on first launch.
- Push notifications: none (see `wiki/web-push-in-iran.md`).
- Real-exam mode, per-field views, Bazaar build, referral codes: after launch.
