# WHAT — the system as it is

The single current description of the Konkur Leitner product: what exists, what is being built,
and the exact contracts between the parts. **This file is always true of `main`.** Any change to
the system — a new field, a renamed route, a changed interval — lands in this file in the same
commit. The reasoning behind any of it is not here: it is in `how-why.md` and in `docs/adr/`.

How to read the status marks: `[planned]` = specified, no code yet · `[building]` = a ticket is
open · `[live]` = on `main` and deployed. A builder session flips the mark when it ships.

Last full revision: 2026-09-17 (the development plan). Design system: decided 2026-09-18, live on every screen 2026-09-24 — see §7.9.

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
  Caddyfile, systemd/, deploy/   VPS configuration; bootstrap.sh (run), install.sh + superuser.sh [built, not yet run]
  POCKETBASE_VERSION            the pinned binary version                    [building — 0.40.2]
android/          Bubblewrap TWA project (twa-manifest.json); keystore NOT in git [building — README]
tools/            simulator, error/log readers, deploy + provision, budget   [live; deploy/provision never run against the VPS; backup pull planned]
content/          the lexicon, exams, hints (the asset)                      [live]
extraction/       the scan → lexicon pipeline (Python)                       [live]
docs/spec/        this file and how-why.md
docs/runbooks/    operational procedures (deploy, debug-from-log, restore)
```

Workspace: pnpm, Node ≥ 22, TypeScript strict, Biome, Vitest, Playwright. Root scripts, all
registered: `test`, `test:watch`, `lint`, `format`, `typecheck` (`tsc --build` for the composite
packages, then `pnpm -r typecheck` for the apps, which are `noEmit`), `build`, `budget`, `e2e`,
`content:lint`, `content:build` (§6, real), and the `tools/` entry points `simulate` (§5.7),
`errors`, `logs`, `flags` (§10.3), `deploy` and `provision` (§14.4) — all implemented (none is a
stub any more; `tools/README.md` has the table). `deploy` and `provision` have never been run
against the real VPS. `deploy` must be run as `pnpm run deploy`: bare `pnpm deploy` is pnpm's own subcommand. On this
repo's pinned pnpm (`12.3.4`) a `--` separator before the script's own arguments is not stripped
and reaches the script as a literal token — pass targets/flags straight after `deploy`, e.g.
`pnpm run deploy web --dry-run`, never `pnpm run deploy -- web`.

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
  sync/               backup.ts (machine + runner), backup-live.ts (real deps + triggers), download.ts (machine + runner),
                      download-live.ts, package-hash.ts (verify), entitlement.ts (+ -live), payment-status.ts (+ payment-live.ts),
                      login-merge.ts
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
| `kv` | `key` | | `installId`, `auth`, `profile`, `entitlement`, `syncCursor`, `lastBackupAt`, `onboarding`, `pendingPayment`, `presentationsBeforePaywall`, `goalSheetShownDay`, `swUpdateAvailable`, `theme`, `downloadReceivedBytes`, `seasonShownFor`, `saveProgressPromptShown`. |

Schema changes are Dexie versions with upgrade functions; never delete `events`.

The `kv` keys are a TypeScript union in `db/dexie.ts`, so a typo is a compile error and the set
above is enumerable. `theme` (§7.9's manual override) and `downloadReceivedBytes` (§7.5's resume
point) were added in the app-shell ticket; `goalSheetShownDay` (the Tehran `dayKey` the
goal-reached sheet last appeared on) in the review ticket; `saveProgressPromptShown` (§7.4's
once-only prompt) in the sync ticket, which also fixed `syncCursor`'s value as `{userId, cursor}`.
The payment ticket fixed two more values: `downloadReceivedBytes` is `{hash, version, bytes}` —
the received bytes themselves, not only their count, because a resume after a reload needs
them — and `pendingPayment` is `{paymentId, userId, startedAt}`. Its lead review fixed
`entitlement` as `{byUser: {[userId]: Entitlement}}`, one record per account (§7.6); a
pre-account `{status, …}` value reads as belonging to nobody.

### 7.4 Backup (sync) state machine — `sync/backup.ts` [live]

The owner's word for this is **backup**; the mechanism is ADR-0002's event-log union.
`sync/backup.ts` holds the pure machine and `createBackupRunner(deps)`, which performs a run with
every effect injected (database, network, clock, timers) and is unit-tested with a fake server
and a fake clock; `sync/backup-live.ts` binds the real dependencies and the triggers, and exports
`startBackup()` (called once from `main.tsx`, after the fold, not awaited) and
`requestBackup(trigger)` (fire and forget, never throws).

States: `idle → pushing → pulling → idle`. A failure goes to `error(reason, attempt, retryAt)`;
a retry is a `START` from `error`, so the count of consecutive failures survives it and the
backoff climbs 1 min, 5 min, 15 min, then hourly. `pushing`/`pulling` carry `failures` (the
count so far, 0 unless retrying); a completed run resets it. A 429's `retryAfter` is honoured:
the wait is the longer of it and the ladder's step. Runs only when `navigator.onLine` and logged
in; offline or anonymous, a trigger is a breadcrumb and nothing else.

Triggers (`BackupTrigger`): `start` (app start); `online` (the window event); `session-end`
(`/session/summary` mounting, and the page going `hidden` — on a phone that is how a session
usually ends); `interval` (every 5 minutes while the app is open); `login` (the login merge);
`manual` (the settings button); `retry` (the backoff timer). **One run at a time:** a trigger
during a run is remembered (the latest wins) and runs once after it. During a backoff only
`manual`, `online` and `login` jump the wait; nothing jumps a 429; after a 401 only `login` or
`manual` try again (retrying cannot fix a token the server refuses).

- **Push:** `events where synced = 0`, batches of 500, `POST /api/sync/push`. An id is marked
  `synced = 1` only after the server answered for its whole batch (`accepted + duplicates` must
  equal the batch size, else `SYNC_PUSH_MISMATCH` and nothing is marked). A crash between the push
  and the mark re-sends the batch next run, and the server's insert-ignore keeps one copy. Then
  the `outbox` drains, oldest first: each kind to its route; `2xx` deletes; a non-429, non-401
  `4xx` drops the item with a breadcrumb (the record is malformed and retrying will not help);
  anything else records the failure on the item and stops the drain until the next run. The
  outbox never fails the progress backup. Kinds whose route does not exist yet stay queued with a
  `backup.outbox.kept` breadcrumb: `OUTBOX_ROUTES_LIVE` in `backup-live.ts` is all `false` until
  ticket dev-server/04 ships `/api/flags`, `/api/beacon`, `/api/client-errors`.
- **Pull:** `GET /api/sync/pull?since=<cursor>` in pages of 500; unknown ids are inserted with
  `synced = 1` (one Dexie transaction, `repo.insertPulled`, which returns exactly the new ones),
  handed to `engine/fold-cache.ts` `mergeIntoFold` — additive and synchronous, so a review
  recorded while the pull was in flight is never dropped — and only then is the cursor stored.
  A crash in between re-pulls the page harmlessly. `kv.syncCursor` is `{userId, cursor}`: a
  cursor belonging to another account is ignored and the pull starts from the beginning. A page
  that says `more` without moving the cursor fails the run (`SYNC_PULL_STALLED`) rather than
  looping. A device pulls its own pushed events back once; they are already known and cost ~40
  bytes each.
- A completed run writes `kv.lastBackupAt` and `stores/sync.ts`; the unsynced count in the store
  is refreshed after every run and every recorded review (the home screen's backup dot).
- Never blocks UI. The user sees no error beyond «پشتیبان‌گیری در انتظار اینترنت» in settings
  (for any `error`, or offline with unsynced events); a 401 shows «برای ادامهٔ پشتیبان‌گیری دوباره
  وارد شوید» with a login button instead, quietly (§7.2). Every trigger, transition, batch and
  failure is a breadcrumb; the **fifth** consecutive failure files one `client_errors` record of
  kind `sync` (the session dedupe of §10.1 keeps it to one).
- **Login merge** (`sync/login-merge.ts`, called by `/login` after the token is in `kv`): every
  local event goes back to `synced = 0` (`repo.markAllUnsynced`), then the profile, then a
  `login` backup run that is **fired, not awaited** — a slow network never holds the login
  screen. Push is idempotent by id, so re-sending is safe; nothing local is ever deleted. Profile:
  `GET /api/me`; the side with the newer `updatedAt` wins (equal is not newer) — the server's is
  adopted whole with `settings.replaceProfile`, or the local one is sent with
  `PATCH /api/me/profile`. A malformed server profile is ignored. A failure here is a breadcrumb,
  never a failed login. Ongoing profile changes after login are not yet backed up (§19).
- **Restore on a fresh device:** login → the merge adopts the server's profile (so the user lands
  on home, not onboarding) → the pull brings every event back → re-fold → progress is back. If
  the server says entitled, the paid download (§7.5) starts immediately: `/login` asks `/api/me`
  after the merge (`sync/entitlement-live.ts`), and a cached `full` starts the download.

Anonymous installs are not backed up (there is no identity to restore to). The review screen
offers «ذخیرهٔ پیشرفت با شمارهٔ موبایل» once (`kv.saveProgressPromptShown`) after 50
presentations on an anonymous install, never on top of the goal sheet
(`engine/save-progress-prompt.ts`, `screens/review/SaveProgressSheet.tsx`); settings offers it
always, as the account row's button.

### 7.5 Content download state machine — `sync/download.ts` [building]

States: `none → checking → downloading(received, total, percent) → verifying → installed` and
`error(reason, attempt, retryAt)` on the same ladder as backup (1 min, 5 min, 15 min, then
hourly; a 429's `retryAfter` when longer). `transition(state, event)` is pure and total — six
states × seven events (`CHECK`, `UP_TO_DATE`, `NEEDED`, `PROGRESS`, `COMPLETE`, `VERIFIED`,
`FAILED`), tested as a full table — with a breadcrumb on every change of state name, never per
chunk. `checking`/`downloading`/`verifying` carry `failures`, so a retry that fails again climbs
the ladder; `error → CHECK` restarts from the manifest, since the stored bytes make that nearly
free. `createDownloadRunner(deps)` performs a run with every effect injected;
`sync/download-live.ts` binds the real ones.

A run happens only when logged in, online and the cached entitlement (§7.6) is `full`; one at a
time, a trigger during a run runs once after it. Triggers: app start, `online`, `entitled` (an
`/api/me` refresh or a purchase result cached `full`), the settings retry (`manual`), the backoff
timer. At start, a stored `packages.paid` puts the machine in `installed` before any network, so
the settings row is right offline.

1. `GET /api/content/manifest`. The stored paid package already has `manifest.paid.hash` →
   `installed`, nothing fetched.
2. `kv.downloadReceivedBytes` holds bytes for *this* hash → resume with `Range: bytes=<n>-` and
   `If-Range: "<hash>"`. Bytes for another hash are dropped first. A 206 must start exactly at
   `n` (`Content-Range`), else `DOWNLOAD_RANGE_MISMATCH`; a 200 to a Range request is the whole
   file, and the count restarts at 0; a 416 drops the stored bytes and fetches the file whole,
   once, in the same run. A response whose `ETag` is not the manifest hash (the file moved on
   before the manifest did) is refused as `DOWNLOAD_CONTENT_CHANGED` and its bytes dropped; the
   next run reads the new manifest and fetches whole. "Names the manifest hash" means
   `"<hash>"`, `W/"<hash>"` or `"<hash>-gzip|zstd|br|deflate"`: Caddy's `encode` (§14.2) appends
   the encoding to a strong tag whenever it compresses, which it does for every browser (checked
   on staging 2026-09-25; a compressed 206 still carries the uncompressed `Content-Range`).
3. The body streams into memory; every 256 KB, and whenever the stream breaks, what arrived is
   written to `kv.downloadReceivedBytes`, so neither a dropped connection nor a killed tab loses
   it. No headers within 30 s, or no body bytes for 30 s, abandons the request
   (`DOWNLOAD_STALLED`), keeping the bytes. Fewer bytes than the manifest promised is
   `DOWNLOAD_TRUNCATED`. Refused to start with less free storage than 3× the package
   (`STORAGE_FULL`).
4. Verify (`sync/package-hash.ts`): UTF-8 JSON, shaped like the paid package, and sha256 of the
   canonical JSON of `items` equal to `manifest.paid.hash` (the builder's `canonicalJson`, checked
   byte for byte against it in a test). A mismatch (`HASH_MISMATCH`) drops the stored bytes, so
   the retry starts from byte 0.
5. **Atomic swap:** `stores/content.ts` `install` writes `packages.paid` in one IndexedDB `put`
   — committed whole or not at all — and only then switches the content store to it; the stored
   bytes are cleared after. Nothing before this step touches the package the user studies from,
   so every failure (offline, 403, a bad hash, a full disk, a crash) leaves the previous package
   intact and in use. A crash after the last byte and before the swap installs from `kv` on the
   next run with no fetch; a crash after the swap finds the hash already installed. At load,
   `paid` is active when the entitlement is `full` and `packages.paid` exists. `free` is kept.
   `download_done` is queued.

Reported (`client_errors`, kind `download`) the first time: `HASH_MISMATCH`,
`DOWNLOAD_CORRUPT`, `DOWNLOAD_RANGE_MISMATCH`, `SERVER_NOT_FOUND` (a server older than the
client), `SERVER_NOT_ENTITLED`, `INSTALL_FAILED`; anything else at the fifth consecutive failure.
503 `PAYMENT_DISABLED_MOCK_SMS` is never reported — on staging it is the server working as
designed. A 401 or 403 waits for a login, a fresh entitlement or a tap rather than a timer; a 429
waits out `retryAfter` and nothing jumps it. The purchase result and settings show the state
through `ui/download-status.ts` («دانلود واژه‌ها ۶۳٪ — با اینترنت ادامه پیدا می‌کند», a progress
bar, a retry where a tap can help). Study continues on whatever package is active meanwhile.

The server half is `[live]` (§8.2 `content/manifest`, `content/paid`): a resume gets 206 with
`Content-Range`; `ETag` is the manifest's paid hash, so sending `If-Range` makes a resume across a
content update come back as a whole-file 200; a range at or past the end is 416; 20 fetches per
user per day, each Range fetch counting; 503 `PAYMENT_DISABLED_MOCK_SMS` while SMS is mock.

### 7.6 Entitlement on the device [building]

`kv.entitlement = { byUser: { [userId]: { status: 'none' | 'full', source, grantedAt, checkedAt } } }`
— `source` is `zarinpal` | `discount` | `manual`, `grantedAt` PocketBase's datetime text,
verbatim.

**Per account.** A record counts only while the account it belongs to is signed in:
`stores/auth.ts`'s `entitlement` is `byUser[userId]`, or `none` when signed out or when the
account has no record. So on a shared phone — A buys, signs out, B signs in — B gets the free
package, no download runs, and nothing is reported. `signIn`/`signOut` rescope it at once, and
`sync/entitlement-live.ts` `followEntitlementNow` (subscribed in `main.tsx`) reloads the content
store on every change of the effective status — free ↔ paid without a reload, the loads run in
turn so the last one always matches the current account — and on becoming `full` asks the
download to check the package (it fetches nothing when the stored hash is current). The stored
`packages.paid` is never deleted, so A signing back in has it offline, with no network call. A
download that finishes after a sign-out stores the package but does not load it. The records sit
side by side in one small map rather than one record tagged with a `userId`, so B's `none` can
never overwrite A's `full`. A value without `byUser` (written by pre-account staging builds)
belongs to nobody; the next `/api/me` fills the account in.

Written only from a server response, through `stores/auth.ts`
`adoptServerEntitlement(server, userId)`, which applies `sync/entitlement.ts` `mergeEntitlement`
to that account's record — `userId` is the account the request was made as, captured before it
was sent, so an answer that arrives after a sign-out or an account switch lands in the right
record; with no account it is dropped. There is deliberately no plain setter. The responses:
`/api/me` (at launch when logged in, after a login, on a purchase result of `ok`), and
`GET /api/pay/status/:id` answering `entitled: true` (cached as `full`, then `/api/me` fills in
`source` and `grantedAt`). A 100 % code's `granted: true` lands on `/purchase/result?status=ok`,
which asks `/api/me`. Read offline forever; never expires.

**Never revoked by the device, within one account.** A network error, a 401, a 5xx, the 503 gate
or a malformed body changes nothing (`refreshEntitlement` never throws; a failed cache write is
reported, and the answer holds in memory for the session). An online `/api/me` that says `none`
while that account's record says `full` keeps the record and files one `client_errors` record
(`ENTITLEMENT_MISMATCH`, kind `payment`) — a refund is the owner's act (§8.3). Another account's
`none` is not a mismatch: it is that account's own record. A cached `full` starts the download
(§7.5).

**`kv.pendingPayment`** (`sync/payment-status.ts`): `/checkout` writes `{paymentId, userId,
startedAt}` just before it redirects to the gateway (a failed write is reported and the payment
goes ahead — the callback and the reconcile cron settle it without the record). At launch, when
logged in, `recoverPendingPayment` asks `pay/status/:id` before anything assumes failure:
`entitled` caches `full`, starts the download, queues `purchase_done` and clears the record;
`failed`/`expired`, 404 and `verified` without an entitlement (reported, `inconsistent`) clear
it; `pending`, offline, 401, the 503 gate and 5xx keep it for the next launch. A record of
another account is kept and not asked about. `pollPayment` asks on a bounded backoff (2 s rising
to 30 s, eleven asks, under three minutes) for a `pending` result.

### 7.7 Service worker and updates [live]

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
| `/onboarding` **[live]** | 3 slides (what it is, the exam-frequency claim, Leitner in one picture) → minutes/day → exam date (Jalali picker, skippable) → field (skippable, from `content/field-codes.json`) → placement (skippable) → install nudge | Writes `profile`; `beacon onboarding_done`. Install nudge shows the real per-context install affordance — «نصب برنامه» when `beforeinstallprompt` was captured, the copy-link fallback in an in-app browser, the iOS Share instruction — the same detection and copy as `/settings`'s install sheet. Continuing is never gated on it. |
| `/` | Home `[live]` | Goal ring (today's presentations / goal), streak, progress %, conquered count, one primary button «شروع مرور», the update chip («نسخهٔ جدید آماده است — اعمال», renders when `stores/pwa.ts`'s `updateReady` is set by `pwa/update.ts`'s state machine; tap calls `applyUpdate()`, §7.7), backup status dot (from `stores/sync`, hidden when anonymous), bottom nav to `/boxes`, `/progress`, `/settings`. Also owns the once-only redirect to `/season` (`kv.seasonShownFor`). |
| `/review` **[live]** | Card | Front: word, exam badge («۱ بار در کنکور، سال ۱۴۰۲»), tap to reveal. Back: translations + one sentence (the exam stem for answer-words, else the authored example); «بیشتر» expands definition, other senses, confusables, exam history, and «راهنمای یادگیری» is its own collapsed disclosure. Buttons: «بلد نبودم» / «بلد بودم»; overflow (⋯): «این را بلدم» (know), «این کلمه اشکال دارد» (flag sheet with 3 reasons → `outbox` `flag`). Feedback: box change and «دفعهٔ بعد: ۲ روز دیگر», ~900 ms or a tap. Goal reached → congratulation sheet, once per Tehran day (`kv.goalSheetShownDay`), never blocking. `kv.presentationsBeforePaywall` counts up while the entitlement is `none`; at `freePresentationLimit` → `/paywall`, once per session, `beacon paywall_shown`. Beacons `first_review`, `reviews_10`, `reviews_100` on crossing. Once, after 50 presentations on an anonymous install, «ذخیرهٔ پیشرفت با شمارهٔ موبایل» (§7.4) → `/login` or «بعداً». «پایان» → `/session/summary`. |
| `/session/summary` | End of session `[live]` | Presentations, accuracy, conquered today (from `stores/session`), streak (from `engine.streak`); «ادامه» or «خانه». Mounting it is the `session-end` backup trigger (§7.4). |
| `/boxes` | Leitner boxes `[live]` | Five columns with counts (`boxCounts`) plus «دیده‌نشده»; tap a box → inline list of words in it with next-due relative time (`ui/relative-time.ts`); tap a word → `/word/:id`. Bottom nav. |
| `/word/:id` | Word detail `[live]` | `screens/word/WordDetail.tsx`: every sense, confusables, exam history, a review timeline (one dot per event, grade 1 filled), «این را بلدم», a flag sheet (3 reasons → `outbox` kind `flag`). |
| `/progress` | Progress `[live]` | Percent with the one-sentence rule («هر بار که یک کلمه در کنکور آمده، یک امتیاز»), conquered/total, a hand-rolled SVG 30-day bar chart (`engine/chart-data.ts`, pure), pace estimate vs exam date with a goal nudge when `verdict === 'behind'`. Bottom nav. |
| `/paywall` `[building]` | Paywall | `screens/paywall/` (`machine.ts` pure, `flow.ts` never throws). The pace argument and what is included, always, offline too; then the price (list price struck through when above the sale price) and «خرید» → `/login?next=/checkout` if anonymous, else `/checkout`. It asks `pay/quote` first, even anonymously, because that is the route carrying the mock-SMS gate (503 before auth): gated → «پرداخت به‌زودی فعال می‌شود», calm, no «خرید»; an anonymous 401 → prices from the public `/api/config`; offline → a Persian note and a retry; `already-entitled` or a cached `full` → «نسخهٔ کامل برای شما فعال است». «بعداً» → `/review` in every state (early-pool cards keep the app usable). Test ids: `paywall` (`data-state`: `loading`/`ready`/`disabled`/`offline`/`failed`/`owned`), `paywall-price`, `paywall-buy`, `paywall-later`, `paywall-retry`, `payment-soon`. |
| `/login` **[live]** | Phone + OTP — **online** | `screens/login/machine.ts` (pure, total, unit-tested): `enterPhone → sending → enterCode → verifying → done`; errors: `rateLimited` (shows retry-after in minutes; retry or change number), `wrongCode` (`wrong` with attempts left, or `expired` / `locked` → resend), `networkError` (retries whichever request failed; offline shows a Persian explanation, never a crash). `flow.ts` performs the two requests with injected deps and never throws. Explains why the number is needed (backup, restore, purchase). The phone is sent as typed — the server normalises it; the code accepts Persian digits. On success: `stores/auth.ts` `signIn` writes `userId` + phone + token to `kv.auth`, then `sync/login-merge.ts` `runLoginMerge(userId)` — the login merge of §7.4 (re-queue every local event, reconcile the profile, fire a `login` backup run without awaiting it). Then home if a profile exists, else `/onboarding` (`destinationAfterLogin`). |
| `/checkout` `[building]` | Price, discount code — **online** | `screens/checkout/`: `machine.ts` (`loading → ready ⇄ applying`, `ready → requesting → redirecting | granted`, and `disabled`, `owned`, `loginNeeded`, `error` with a retry of exactly the request that failed), `flow.ts`. Logged out → `/login?next=/checkout`, which returns here. The server's price (sale, list struck through, discount, payable — the client computes nothing); «اعمال کد» asks `pay/quote` and shows every `codeStatus` in Persian (`ok`, `invalid`, `expired`, `exhausted`, `used`; `already-entitled` → `owned`); an empty code removes the applied one. «پرداخت» sends only a code the server accepted to `pay/request`: `gatewayUrl` (absolute http(s) only) → `kv.pendingPayment` written, `purchase_started` queued, `location.assign`; `granted: true` → `/purchase/result?status=ok&paymentId=…`; `DISCOUNT_REJECTED` → the quote is asked again with that code, showing the server's status; 409 → `owned` (asks `/api/me`); 401 → login; the gate → «پرداخت به‌زودی فعال می‌شود», never an error; network, 429 (minutes), `GATEWAY_FAILED` → a Persian note and a retry. «بعداً» → `/review`. Test ids: `checkout` (`data-state`), `checkout-code`, `checkout-apply`, `checkout-code-status` (`data-code-status`), `checkout-payable`, `checkout-discount`, `checkout-pay`, `checkout-error`, `checkout-retry`, `checkout-later`, `payment-soon`. |
| `/purchase/result` `[building]` | Callback landing — **online** | `screens/purchase-result/`. `?status=ok&ref=&paymentId=` → `confirming`: `/api/me` (cache through the §7.6 merge, start the download), then clear a matching `pendingPayment`, queue `purchase_done` → `entitled`, which shows «نسخهٔ کامل فعال شد», the bank's `ref` («کد پیگیری»), the download's state and progress bar (§7.5) and «شروع مرور»; if `/api/me` still says none, it asks the payment instead. `?status=pending&paymentId=` (or no status) → `waiting`: `pay/status/:id` on the bounded backoff (§7.6) → `entitled` / `failed` / `stillPending` («بررسی دوباره»). `?status=failed&reason=` → the Persian reason (`cancelled`, `not_paid`, `amount_mismatch`, `unknown_payment`, `expired`, `gateway_error`, anything else) and «تلاش دوباره برای پرداخت» → `/checkout`. Offline → a note and a retry of the same question; 401 → login and back to this URL; `verified` without an entitlement → a support note. The query string only picks the question: a hand-typed `?status=ok` unlocks nothing. Polling stops when the screen unmounts. Launch-time recovery of a `pendingPayment` is §7.6. Test ids: `purchase-result` (`data-state`: `confirming`/`waiting`/`entitled`/`stillPending`/`failed`/`offline`/`loginNeeded`/`inconsistent`/`disabled`), `purchase-entitled`, `purchase-download-status` (`data-state` = the download state), `purchase-download-retry`, `purchase-start-review`, `purchase-failed` (`data-reason`), `purchase-retry`, `purchase-still-pending`, `purchase-check-again`, `purchase-login`, `purchase-later`; the progress bar is `role="progressbar"` named «پیشرفت دانلود واژه‌ها». |
| `/settings` | Settings `[live]`* | Account (phone, or «ذخیرهٔ پیشرفت با شمارهٔ موبایل» → `/login`), goal (minutes → `goalFromMinutes`), exam date (Jalali text input via `date-fns-jalali`), field (`content/field-codes.json`, named codes only), theme, backup row (status, last backup time; anonymous: «پیشرفت فقط روی همین دستگاه ذخیره شده است.») + manual button (`requestBackup('manual')`, §7.4), download row (the cached entitlement «نسخهٔ کامل» / «نسخهٔ رایگان» `settings-entitlement`; the download state `settings-download-status` with `data-state`, through `ui/download-status.ts`; a progress bar while downloading; «تلاش دوباره» `settings-download-retry` → `requestDownload('manual')` when a tap can help — never on a 429 or the gate; «خرید نسخهٔ کامل» `settings-buy` → `/paywall` for a free user), «نصب برنامه» (opens the install sheet — the install paragraph below), «گزارش مشکل» → `reportError('user_report', …)`, about + version + support link. *Local parts and backup are fully wired; the account row's logged-out button is «ذخیرهٔ پیشرفت با شمارهٔ موبایل» → `/login`; the download row is wired to the real runner (§7.5), `[building]` until the purchase journey (ticket dev-payment/01 part B) proves it end to end. |
| `/season` | Season summary `[live]` | Shown once when the exam date passes (`engine/season.ts`, pure): conquered, days studied, presentations; «تاریخ جدید» → `/settings`. |

Install prompt **[live]**: on Android Chrome, `beforeinstallprompt` is captured (`pwa/install.ts`,
listener attached synchronously in `main.tsx`'s `bootstrap()`, ahead of any `await`, since the
event fires once and only ever that early) and offered as a sheet at the end of onboarding and
from settings (`screens/install/InstallSheet.tsx`, `screens/onboarding/InstallStep.tsx`). In-app
browsers (Telegram, Instagram, Facebook) do not fire it — the app detects them (UA sniff) and
shows «در Chrome باز کنید» with a copy-link button. iOS shows the Share → Add to Home Screen
instruction. The landing page also offers the APK.

### 7.9 Design system [live] — decided 2026-09-18 (ADR-0020), applied to every screen 2026-09-24

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
  `@theme`. Motion 150–250 ms, `prefers-reduced-motion` respected. Beyond the scale and the
  semantic `--bg`/`--fg`/`--border` set: `--bg-muted` (inset panels, hover fills),
  `--glass-bg`/`--glass-border` (the glass — a dark hairline on light, a lighter-than-ground fill
  on dark so it never goes muddy), `--glass-bg-strong` (glass floating over content: sheets,
  dialogs, menus), `--overlay` (the scrim), `--bg-glow` (a soft monochrome glow at the top of the
  page for the glass to sit in). `--success` is green-700 and `--danger` red-600, both ≥ 4.5:1
  against the white grading-button label.
- **Glass is two utilities**, `glass` and `glass-strong` (`@utility` in `apps/web/src/index.css`):
  every card, chip, bar, sheet, dialog and menu uses one of them, so the look is defined once.
  Primitives in `apps/web/src/ui/`: `Button`, `Card`, `Chip`, `Dialog`, `Sheet`, `Disclosure`,
  `Input`, `Select` (the native picker, chevron on the inline end), `Segmented` (one choice among
  a few, as one pill — minutes per day, theme), `Tabs`, `Switch`, `Progress`. `ui/cn.ts` teaches
  `tailwind-merge` the type scale; without it `text-h6` reads as a colour and a button loses its
  text colour.
- **Hints on the card** are collapsed by default behind «راهنمای یادگیری»; a word without a
  hint shows «راهنمای این کلمه به‌زودی اضافه می‌شود» inside the same disclosure.

Fixed regardless of choice: mobile-first at 360–430 px, RTL, minimum tap target 44 px, Persian
digits via `Intl.NumberFormat('fa-IR')`, no more than one primary action per screen, no
decorative illustration on the review card. Every Latin run (the word, a definition, an example)
carries `dir="ltr"` and `lang="en"`. An error is said in words and an icon, never in red.

**What holds the rules** (ticket dev-web/06): `apps/web/src/design-rules.test.ts`, part of
`pnpm test`, fails on Persian text outside `strings.ts` (a comment may quote copy), on any
Tailwind palette colour but `neutral` or an arbitrary colour in a class, and on
`--success`/`--danger` outside the grading buttons. Each exception is a file in an allowlist with
its reason — today `ui/format.ts` for the «٪» sign, and `ui/Button.tsx` and
`screens/review/GradeBar.tsx` for the two accents. The visual record is
`apps/web/e2e/design-screens.spec.ts`: every offline screen and state at 360 and 430 px in both
themes, as PNGs in `apps/web/e2e/__screenshots__/`. It is a recording tool, not an assertion, and
is skipped unless `KL_SCREENSHOTS=1` (fonts render differently per OS):
`pnpm build && KL_SCREENSHOTS=1 pnpm e2e design-screens` (plus `KL_E2E_CHANNEL=msedge` where
Playwright's Chromium cannot be downloaded); look at the images and commit them with the change.

---

## 8. The server (PocketBase)

### 8.1 Collections (`pb_migrations/`) `[live]`

`users` is the auth collection; every other collection is ours. API rules are the security
boundary; hooks add behaviour.

| Collection | Fields | Rules |
|---|---|---|
| `users` (auth) | `phone` (text, unique, E.164), `profile` (json: minutes, goal, examDate, fieldCode, updatedAt), `lastSeenAt` | list/view: `@request.auth.id = id`; create/update via hooks only. |
| `review_events` | `id` (text, 36 chars, UUIDv7 — the id field's pattern is widened), `user` (rel), `itemId`, `at` (number), `kind`, `grade`, `device` | No direct API access; only the sync routes. |
| `entitlements` | `user` (rel), `product` (`full`), `source` (`zarinpal` / `manual` / `bazaar` / `discount` — a 100 % code), `payment` (rel, optional), `grantedAt`, `note`. **Unique (`user`, `product`)**. | view: own; write: hooks/superuser only. |
| `payments` | `user`, `listPrice`, `salePrice`, `discountCode` (text), `discountAmount`, `payable`, `authority` (unique when non-empty), `refId`, `cardPan`, `status` (`pending`/`verified`/`failed`/`expired`), `failReason` (`cancelled`/`amount_mismatch`/`not_paid`/`gateway_error`), `verifiedAt`, `expiresAt` (created + 2 h), `raw` (json: the gateway's request and verify answers) | view: own; write: hooks only. |
| `discount_codes` | `code` (unique, uppercase), `type` (`percent`/`fixed`), `value`, `maxUses`, `usedCount`, `perUserOnce` (bool), `expiresAt`, `active`, `note` | superuser only. Managed in the PB admin UI. |
| `otp_codes` | `phone`, `codeHash`, `expiresAt`, `attempts`, `ip` | hooks only. Purged by cron. |
| `word_flags` | `user` (optional), `installId`, `itemId`, `reason` (`translation`/`example`/`hint`), `appVersion`, `at` | create via route; read superuser. |
| `beacons` | `installId`, `user` (optional), `name` (enum, §8.4), `at`, `appVersion` | create via route; read superuser. |
| `client_errors` | see §10.1 | create via route; read superuser. |
| `content_downloads` | `user` (rel), `packageId`, `version`, `range` (the `Range` header as sent), `created` | hooks only. One row per paid-package fetch served: the 20-per-day count and the owner's evidence (ADR-0004). |
| `app_config` | single record: `listPrice`, `salePrice`, `freePresentationLimit`, `minAppVersion`, `supportUrl`, `notice` | public read; superuser write. |

In `pb_migrations/1758000000_init.js` a rule of `""` means anyone and `null` means nobody through
the REST API — only a hook (which writes with `app.save()`, bypassing rules) or a superuser. The
`users` collection is PocketBase's default one, edited rather than created: `passwordAuth` off,
`authToken.duration` 365 days, `email` made optional because the OTP flow creates an account from
a phone number alone. `app_config` is seeded by the same migration with 450000 / 290000 / 100.
`1759000000_payment.js` adds what payment needed: `payments.failReason` and `expiresAt`, the
unique `authority` index, the `discount` source, the unique (`user`, `product`) index on
`entitlements` (the database's backstop for callback idempotency) and `content_downloads`.

### 8.2 Routes (`pb_hooks/`)

Every route is registered through `lib/route.js` → `withRoute(name, handler, opts)`, which
runs `opts.guard` first when one is given (a function that throws to refuse the request before
auth or body — the payment routes' mock-SMS gate), authenticates (`opts.auth` is `none` / `user` / `superuser` / `optional`), validates the body
against `opts.schema`, caps it at 32 KB (`opts.maxBodyBytes` raises it for one route:
`sync/push` takes 256 KB, what 500 events cost), catches everything, logs one structured record (§10.2)
and answers `{ error: { code, message } }` with a stable `code` — one of `BAD_INPUT`,
`UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`, `INTERNAL`, and for OTP
`PHONE_INVALID`, `OTP_WRONG`, `OTP_EXPIRED`, `OTP_LOCKED`, `SMS_FAILED` (502),
`SMS_PROVIDER_UNKNOWN` (500), and for payment `PAYMENT_DISABLED_MOCK_SMS` (503),
`ALREADY_ENTITLED` (409), `DISCOUNT_REJECTED` (400), `GATEWAY_FAILED` (502), `NOT_ENTITLED` (403).
A few errors carry one extra top-level value next to `error`:
`retryAfter` (seconds) on every 429, which also sets the `Retry-After` header,
`attemptsLeft` on `OTP_WRONG`, and `codeStatus` (a string, as in `pay/quote`) on `DISCOUNT_REJECTED`. Bodies are JSON, except where a handler returns
`blobResponse` (raw bytes), `redirectResponse` (a 302 — the payment callback) or `fileResponse`
(a file served through Go's `http.ServeContent`, which is what gives the paid package its
`Range` handling); the auth, the guard, the log line and the error envelope are the same for all. Any `/api/…` path
no route owns — any method — answers this envelope with 404 `NOT_FOUND` (log route `api.not_found`,
`core.pb.js`) instead of falling through to pb_public's `index.html` with a 200; it acts only when
the pattern the router matched is not itself under `/api`, so no real route is shadowed. Auth is the
PocketBase bearer token. Because PocketBase serializes each handler into its own isolated context,
`withRoute` is required and applied *inside* the handler, not around it (see how-why §5.4).

| Route | Auth | Body → Response | |
|---|---|---|---|
| `GET /api/config` | none | `app_config` fields. | `[live]` |
| `POST /api/otp/request` | none | `{phone}` → `{ok, retryAfter}` (`otp.pb.js`). The phone is normalised to E.164 (`lib/phone.js`: `09…`, `9…`, `+989…`, `00989…`, Persian/Arabic digits, spaces/hyphens; anything else `PHONE_INVALID`). Limits: 3 per phone / 10 min, 10 per IP / hour → 429 `RATE_LIMITED` + `retryAfter`; a refused request writes nothing. 5-digit code (`mock`: always `123456`), stored as `salt$hmac-sha256`, 3-minute expiry, sent through `lib/sms.js` (`SMS_PROVIDER` = `kavenegar` Verify Lookup / `console` / `mock`). `retryAfter` on success is 0 unless that request used the phone's last slot. The answer is identical whether or not the phone has an account. | `[live]` |
| `POST /api/otp/verify` | none | `{phone, code}` (code 5–6 digits) → `{token, record}`, the shape of PocketBase's auth response, built by the route with `record.newAuthToken()` (365 days). Only the latest code for the phone counts. Each try spends an attempt atomically before the compare (constant-time); a wrong code → `OTP_WRONG` + `attemptsLeft`; after 5 → `OTP_LOCKED`, even for the right code; expired, used or never requested → `OTP_EXPIRED`. A used code is burnt, not deleted, so it still counts toward the rate limit. Finds or creates the user by phone. | `[live]` |
| `GET /api/me` | user | `{user, entitlement, profileUpdatedAt}`; also refreshes `lastSeenAt`. | `[live]` |
| `PATCH /api/me/profile` | user | `{profile}` → stored if `updatedAt` is newer. Equal is not newer. | `[live]` |
| `POST /api/sync/push` | user | `{events: ReviewEvent[]}` (≤ 500, else `BAD_INPUT`) → `{accepted, duplicates}` (`sync.pb.js`, `lib/sync.js`). `INSERT OR IGNORE` by id in one transaction, so a replayed or overlapping batch stores each event once and never edits the first copy. `user` comes from the token; a `user` in the body or on an event is dropped. Each event is checked (lowercase UUID id, `itemId` 1–64 chars, `at` a non-negative integer, `kind` `review`/`know`, `grade` 0/1, `device` ≤ 64 chars); **one malformed event rejects the whole batch** with `BAD_INPUT` naming `events[i]`, and nothing of it is stored. An `at` more than a year from the server clock is stored as sent and logged once per push (`flag: at_out_of_range`). An id that already belongs to another user is left untouched, counted in `duplicates`, and logged (`flag: id_conflict`). | `[live]` |
| `GET /api/sync/pull?since=&limit=` | user | `{events, cursor, more}`, only the caller's events, ordered by `(created, id)`. `limit` 1–1000, default 500. `cursor` is `"<created>|<id>"` of the last event returned — opaque to the client, which passes it back as `since`; an empty page returns the `since` it was given, a fresh account `''`. A malformed `since` or `limit` → `BAD_INPUT`. Every push stamps all its rows with one `created` strictly greater than any this user already has (`max(now, previous + 1 ms)`, inside the write transaction), so an event that becomes visible later can never sort behind a cursor already handed out — even across two pushes in the same millisecond or a server clock step (how-why §5.8). | `[live]` |
| `GET /api/content/manifest` | none | `{free: {version, hash, bytes}, paid: {version, hash, bytes}}`, read from `CONTENT_DIR/manifest.json` (`content.pb.js`), `Cache-Control: no-cache`. A missing or incomplete manifest → 500 `INTERNAL`. | `[live]` |
| `GET /api/content/paid` | user + entitled, **gated** | `CONTENT_DIR/paid.json`, served by Go's `http.ServeContent`: 200 whole file; `Range: bytes=<n>-` → 206 with `Content-Range: bytes <n>-<last>/<size>`; a range past the end → 416 (`Content-Range: bytes */<size>`, plain-text body, not the JSON envelope). `ETag` is `"<manifest.paid.hash>"` and `If-Range` is honoured, so a resume across a content update gets the whole new file with a 200. Also `X-Content-Version: <manifest.paid.version>`, `Cache-Control: private, no-cache`. No entitlement → 403 `NOT_ENTITLED`. 20 fetches per user per rolling 24 h — every 200/206/416 counts, a Range fetch included; the 21st → 429 `RATE_LIMITED` + `retryAfter`. Each served fetch writes a `content_downloads` row. Paid file missing → 500 `INTERNAL`. | `[live]` |
| `POST /api/pay/quote` | user, **gated** | `{code?}` → `{listPrice, salePrice, discountAmount, payable, codeStatus, code}` (`pay.pb.js`, `lib/pay.js`). `codeStatus`: `none` (no code sent) · `ok` · `invalid` · `expired` · `exhausted` · `used` · `already-entitled` (wins over any code; prices then plain). `code` is the normalised code (trimmed, uppercase, Persian digits → ASCII) when `ok`, else `null`. When the status is not `ok`, `discountAmount` is 0 and `payable` = `salePrice`. Toman. | `[live]` |
| `POST /api/pay/request` | user, **gated** | `{code?}` → `{paymentId, gatewayUrl}`: re-quotes on the server (any price or amount in the body is ignored), creates the `pending` payment (`expiresAt` = now + 2 h), calls Zarinpal `request` for `payable` with `currency: "IRT"`, stores the authority; `gatewayUrl` is `<zarinpal>/pg/StartPay/<authority>` (mock: our own callback URL with `Status=OK`). A `payable` of 0 (100 % code) never calls the gateway: the code's use is claimed conditionally (`usedCount < maxUses`), then payment `verified` and entitlement `source: discount`, all in one transaction → `{paymentId, granted: true}`; a lost race for the last use → `DISCOUNT_REJECTED` + `codeStatus: exhausted`, nothing saved. Errors: `ALREADY_ENTITLED` 409 (nothing charged); `DISCOUNT_REJECTED` 400 + `codeStatus` (nothing written); `GATEWAY_FAILED` 502 (payment `failed`, `failReason: gateway_error`). | `[live]` |
| `GET /api/pay/callback` | none (Zarinpal), **gated** | `?Authority=&Status=` → always a `302` to `${PUBLIC_APP_ORIGIN}/purchase/result?…` once past the gate: `status=ok&ref=<refId>&paymentId=<id>` · `status=failed&reason=<cancelled|amount_mismatch|not_paid>&paymentId=<id>` · `status=failed&reason=unknown_payment` (no such authority) · `status=pending&paymentId=<id>` (the gateway could not be asked: the payment stays as it was; poll `status/:id`; the next callback or `reconcile_unverified` settles it). `Status` other than `OK` → `failed/cancelled` without calling the gateway. Otherwise verifies for the **stored** `payable`; Zarinpal 100 or 101 → the payment flips to `verified` once (a conditional update inside a transaction), and only the call that flips it creates the entitlement (`source: zarinpal`) and increments the code's `usedCount`. A replay of a verified payment answers from our own state and never calls the gateway. `expired` and `failed` payments can still verify (a late callback for money actually taken). | `[live]` |
| `GET /api/pay/status/:id` | user (own), **gated** | `{paymentId, status: 'pending'|'verified'|'failed'|'expired', refId: string|null, failReason: string|null, entitled: boolean}`. `entitled` is whether the caller holds a `full` entitlement now, from any source. Another user's payment or a malformed id → 404 `NOT_FOUND`. | `[live]` |
| `POST /api/flags` | optional | `{installId, itemId, reason, appVersion, at}` → `{ok}`. 50 per install per day (`telemetry.js`). | `[live]` |
| `POST /api/beacon` | optional | `{installId, events: [{name, at, appVersion}]}` → `{ok}`. Unknown names rejected (whole call, naming the index); at most 20 events per call, 200 per install per day — no number was fixed here originally, decided in ticket dev-server/04. | `[live]` |
| `POST /api/client-errors` | optional | one record (§10.1) → `{ok, deduped}`. 30 per install per day; same fingerprint from the same install within an hour increments `count` instead of inserting, and never counts against the cap. | `[live]` |
| `GET /api/health` | none | `{ok, version, time}`. `version` is `<pocketbase>+hooks.<n>`. Registered as a middleware, not a route: PocketBase owns this path (how-why §5.4). | `[live]` |
| `GET /api/admin/stats?range=` | superuser | Aggregates for the dashboard (§11.2). | `[planned]` |
| `POST /api/admin/grant` | superuser | `{phone, note?}` → `{userId, entitlementId, created}`. Normalises the phone like OTP (`PHONE_INVALID` otherwise), creates the user if missing and an entitlement with `source: manual`. Idempotent: a phone already entitled answers `created: false` and its entitlement is left as it is. Not gated on mock SMS. | `[live]` |
| `GET /api/admin/sourcemap/:sha/:file` | superuser | Serves a source map from `SOURCEMAP_DIR` (`/opt/kl/sourcemaps/<sha>/<file>`) for `tools/errors` to symbolicate against. `sha` and `file` are checked against a strict allow-list (`[0-9a-f]{7,40}` / a plain `*.map` name, no `/`) before either touches a filesystem path — PocketBase's router matches `{sha}/{file}` on undecoded path segments, so a percent-encoded slash inside `file` (`..%2f..%2fetc%2fpasswd`) still decodes to a value the allow-list rejects. | `[live]` |

Crons (`pb_hooks/cron.pb.js`): `otp_purge` `[live]` hourly deletes `otp_codes` whose `expiresAt` is
more than an hour past — not at expiry, because a row still counts toward the IP limit's
one-hour window; `reconcile_unverified` `[live]` every 15
minutes (Zarinpal `unVerified` → verify, for the stored `payable`, every listed authority that is
ours and not yet `verified`; the safety net for a user who closed the browser during the redirect;
it calls the gateway only when one of our payments from the last 7 days has an authority and is
not `verified`, so a server with no open payments makes no calls; not gated on mock SMS — it only
settles money already taken); `expire_pending` `[live]` every 5 minutes marks `pending` payments
past their `expiresAt` (created + 2 h) `expired`. Each runs on demand with
`POST /api/crons/<id>` (superuser), which is how the API suite drives them.

**The mock-SMS gate** `[live]`: while `SMS_PROVIDER=mock`, every `/api/pay/*` route and
`GET /api/content/paid` answer 503 `PAYMENT_DISABLED_MOCK_SMS` before auth, before the body and
before any write or gateway call (`lib/pay.js` `guard`, passed as `withRoute`'s `opts.guard`) —
under mock SMS every phone signs in with `123456`, so an account proves nothing. `manifest`, `me`
and `admin/grant` are not gated. The gate lifts only with a switch to `SMS_PROVIDER=kavenegar`.

Rate limits `[live]`: PocketBase's built-in limiter (per rule, per client IP) where the key is an
address, and an in-hook count where the key is a phone number or install id. Migration
`1758800000_rate_limits.js` switches the limiter on with exactly these rules — replacing, not
adding to, the four defaults PocketBase ships disabled:

| Rule label | Limit per IP | Why |
|---|---|---|
| `POST /api/client-errors` | 120 / hour | the one collection with 32 KB rows; bounds one IP to ≈ 90 MB/day worst case |
| `POST /api/beacon` | 300 / hour | ≤ 20 small rows per call |
| `POST /api/flags` | 300 / hour | one small row per call |
| `_superusers:auth` | 3 / 10 s | every superuser login method (password, OTP, OAuth2) |

There is **no `/api/` catch-all**: a carrier-grade NAT address can carry hundreds of students,
and everything on the study path (sync, `me`, profile) is authenticated and bounded per user
already, so a per-IP ceiling there would only ever throttle legitimate users (how-why §5.11).
The limiter's own 429 is PocketBase's envelope (`{status: 429, message, data}`), without
`retryAfter` or a `Retry-After` header; the client maps any 429 to `RATE_LIMITED` by status and
its outbox keeps the item for the next run (§7.4). It skips requests that carry a superuser
token, its fixed window opens at a key's first request, and its counters live in memory — a
restart or a settings save resets them. The per-install daily caps above still apply underneath.
The OTP limits are in-hook counts over `otp_codes` (PocketBase's rules cannot key on a phone).
A per-IP count needs the real client IP: migration `1758700000_trusted_proxy.js` trusts
`X-Forwarded-For`, rightmost value, which is safe only because PocketBase listens on `127.0.0.1`
behind Caddy alone (§14.3, how-why §5.7). DNS has `A` records only; if an `AAAA` record is ever
added, per-IP rules need revisiting, since PocketBase keys on the full IPv6 address and one
machine can hold a whole /64.

### 8.3 Payment rules `[live]` (server; the real 1,000-toman verification is still to do)

- Prices are read from `app_config` on the server at request time; the client only displays.
- Amounts are toman everywhere; Zarinpal v4 is called with `currency: "IRT"` on both `request`
  and `verify`, so no merchant-panel setting is involved. Verified once in Phase 5 with a real
  1,000-toman payment and recorded here — **not yet done**; until then the v4 field names in
  `lib/zarinpal.js` are from Zarinpal's public docs, not from a live answer (how-why §5.14).
- Verification compares the amount: `verify` is always sent the `payable` stored on our row, never
  an amount from a request, a query string or the unverified list, and Zarinpal answers -50 when it
  differs from what was paid. -50 fails the payment (`failReason: amount_mismatch`) and logs a
  `pay.amount_mismatch` error. -51 / -53 / -54 fail it as `not_paid`; any other answer, or none,
  leaves it for the next callback or the reconcile cron.
- The gateway is `ZARINPAL_PROVIDER`: `zarinpal` (sandbox or live by `ZARINPAL_SANDBOX`, or
  `ZARINPAL_API_BASE` when set — tests only) or `mock` (CI/e2e: `request` answers our own callback
  URL with `Status=OK`, `verify` always succeeds; reported as a boot problem on the real origin).
- A user who already holds an entitlement gets `codeStatus: 'already-entitled'` from `quote` and
  `request` refuses to charge twice.
- Discount code validation order: exists → active → not expired → `usedCount < maxUses` → not
  already used by this user when `perUserOnce` → compute. All on the server; the client never
  computes a price. A code that does not match `^[A-Z0-9_-]{1,32}$` after normalising, or whose
  value cannot make a price (a percent outside 1–100, a fixed amount below 1), counts as not
  existing (`invalid`); an inactive code is also `invalid` — the user is never told which.
  `maxUses` is a hard ceiling (0 or blank = `exhausted`, never "unlimited"); a blank `expiresAt`
  never expires. "Used by this user" = a `verified` payment of theirs carrying the code.
- The discount is taken off `salePrice` (`listPrice` is only displayed): percent →
  `floor(salePrice × value / 100)`, fixed → `min(value, salePrice)`; `payable = salePrice − discount`.
  `usedCount` is incremented once, when the payment is verified; two payments in flight on a
  code's last use can take it past `maxUses` — logged as `pay.code_over_limit`, never refused
  after the money is taken. A 100 % grant instead claims its use first, inside the grant's
  transaction, with `usedCount < maxUses` in the update itself: of several users racing for a
  free code's last use exactly one is granted, and the rest get `DISCOUNT_REJECTED` /
  `codeStatus: exhausted` with nothing saved.
- A payment verified for a user who already holds an entitlement (two payments in flight) is kept
  `verified`, grants nothing new, and logs `pay.double_payment` for the owner to refund by hand.
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

### 10.3 Tools that turn logs into a fix `[live]`

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

Every deploy appends `sha, version, who, when, what` to `/opt/kl/deploys.log` on the server and
prints the matching `wiki/log.md` line for the operator to paste and commit (`tools/deploy` does
not write to this repo's own tree — ticket dev-server/05 #4). `APP_VERSION` and `BUILD_SHA` are
shown in settings, so a screenshot from a user identifies the build.

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

### 14.1 The machine `[live]` (staging, `SMS_PROVIDER=mock`)

One Parspack **VPS2**: 1 vCPU, 2 GB RAM, 40 GB SSD, Ubuntu 24.04 LTS, Iran location (100 GB/month
traffic, which is ~150,000 paid-package downloads). PocketBase and Caddy idle under 200 MB; this
tier carries thousands of users, and Parspack resizes in place if it ever does not. Setup is
`docs/runbooks/server-setup.md`, in two scripted halves: `server/deploy/bootstrap.sh` (done
2026-09-18) and `pnpm run provision` → `server/deploy/install.sh` (both run 2026-09-24, staging —
§14.4):

- user `kl` (SSH keys only, password auth off; root with a key until PocketBase is deployed,
  then `PermitRootLogin no` as a separate, deliberate step — deploy.md), `ufw` allowing
  22/80/443, unattended security upgrades, `fail2ban` on SSH. `kl`'s sudo is NOPASSWD for
  exactly `/bin/systemctl restart kl-pocketbase`, `restart`/`reload caddy` and `status` of both,
  and `kl` is also in the `systemd-journal` group (bootstrap.sh and, idempotently, install.sh —
  ticket dev-server/05 #3) so it can read `journalctl -u kl-pocketbase` without sudo.
- Caddy from the official apt repo (bootstrap; serving `Caddyfile.bootstrap`'s placeholder with
  working TLS until provision installs `server/Caddyfile`, only after `caddy validate` passes).
  PocketBase binary at the pinned version under `/opt/kl/pocketbase` (owner `kl`, 755), from
  the release zip verified against both its `checksums.txt` and the pin in
  `server/POCKETBASE_SHA256`; `pb_data` at `/opt/kl/pb_data`; systemd unit
  `kl-pocketbase.service` (enabled by provision, first started by `deploy server`) with
  `EnvironmentFile=/opt/kl/.env` (mode 600, owner `kl`, written by provision from memory) and
  `--hooksWatch=false` on `ExecStart` — without it PocketBase restarts itself the moment
  `pb_hooks` changes on disk, which fired mid-deploy (new hooks briefly ran against old
  migrations, since `server` ships `pb_hooks` before `pb_migrations`); the deploy's own restart
  is now the only restart (ticket dev-server/05 #2). Superuser created by provision
  (`server/deploy/superuser.sh`).
- Directories: `/opt/kl/{pb_public,pb_hooks,pb_migrations,content,landing,admin,sourcemaps,backups}`.

### 14.2 Caddyfile (shape) `[live]`

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

The real file is `server/Caddyfile` (adds the `noindex` header, JSON access logs, the APK
content type); `pnpm run provision` installs it over `Caddyfile.bootstrap` only after
`caddy validate` passes, keeping the old one and restoring it if the reload fails (§14.4).

TLS: Caddy's automatic Let's Encrypt, **pinned** (`acme_ca` in the global block): ZeroSSL, Caddy's
other default issuer, returned a malformed response from this VPS on 2026-09-18, and Let's
Encrypt alone has been verified working here (server-setup.md). Were it ever unreachable too,
the fallback is ArvanCloud's free CDN in front with its edge certificate — recorded here if it
happens.

### 14.3 DNS

`A` records for the apex, `www`, `app`, `admin` → the VPS IP, hosted on **Parspack's CDN
product** (free plan, DNS-only — proxying off), nameservers `hail.parspack.net` /
`star.parspack.net`. Done 2026-09-18; procedure and the two problems hit along the way are in
`docs/runbooks/server-setup.md`.

### 14.4 Deploy procedure `[live]` (staging, `SMS_PROVIDER=mock`)

`pnpm run deploy <target>` with targets `web`, `server`, `content`, `landing`, `admin`, `all`
(`tools/deploy/`, TypeScript, run by `node --experimental-strip-types`) — no `--` before the
target: this repo's pinned pnpm (`12.3.4`) does not strip it, and `tools/deploy/args.ts` rejects
the literal `"--"` token as an unknown flag (found in ticket dev-server/04, which corrected this
section; `docs/runbooks/deploy.md` and `tools/README.md` say so too). **Not rsync**: the
machines this runs on have `ssh` and `tar` but no `rsync` (found in the same ticket) — every
transfer is `tar czf - | ssh kl@host tar xzf -` into a `.new` sibling directory, then swapped in
with two renames (the old directory moved aside, the new one moved into place, the old one
removed) rather than one `mv`, because `rename()` on Linux refuses to replace a populated
directory in a single step. `docs/runbooks/deploy.md` has the details; `tools/deploy/plan.ts` is
the one place the actual commands are generated.

1. Refuses unless the working tree is clean and `HEAD` equals `origin/main`; `--allow-branch
   <branch>` replaces that comparison with `HEAD` equals `origin/<branch>` instead (never the
   dirty-tree check), for a staging deploy, with a loud warning — a local branch checked out
   under that name proves nothing on its own; it is HEAD's sha against the pushed ref's sha.
   `--dry-run` prints every command and runs none — on any branch and any tree: when a real run
   would be refused it prints the reason as a loud `DEPLOY WOULD BE REFUSED` warning and then
   the plan (`refusal.ts` → `gate()`). Every `ssh` is `ssh -o BatchMode=yes [-i
   <DEPLOY_SSH_KEY_FILE>]`, so a key or host-key problem fails a step instead of hanging it.
2. `web`: `pnpm content:build` (skipped when `content` ran earlier in the same deploy) → build →
   refuse with `DEPLOY_NO_FREE_PACKAGE` unless `dist/content/free.json` exists → ship everything
   except `*.map` to `/opt/kl/pb_public/` (so the free package is served from there, §6) → ship
   the `*.map` files separately to `/opt/kl/sourcemaps/<sha>/`, never into `pb_public`.
3. `server`: ship `pb_hooks/`, `pb_migrations/` → `sudo -n /bin/systemctl restart
   kl-pocketbase` as `kl` (the exact command bootstrap.sh's sudoers line allows; migrations run on
   start), refused with `DEPLOY_NO_ENV` while `/opt/kl/.env` is missing, since a restart also
   starts a stopped unit → poll `/api/health` on the VPS itself for up to 30s; a timeout exits
   non-zero with `DEPLOY_HEALTH_TIMEOUT`.
4. `content`: `pnpm content:build` → ship `server/content/` (`paid.json` + `manifest.json`) to
   `/opt/kl/content`, the server's `CONTENT_DIR`.
5. `landing` / `admin`: build → ship to `/opt/kl/landing` / `/opt/kl/admin`.
6. Append to `/opt/kl/deploys.log`, and print the matching `wiki/log.md` line rather than write
   it (`tools/deploy` never touches this repo's own tree — a real run used to append it, which
   left the tree dirty and refused the very next run's own clean-tree check; ticket
   dev-server/05 #4). Paste and commit the printed line.

The same script runs from GitHub Actions on push to `main` **if** the runner can reach the VPS
over SSH (tested in Phase 4). If it cannot, deploys run from the owner's machine through Claude
Code with the same script; CI still gates every PR. Either way the deployed artefact is a
clean build of `main`. **First deployed 2026-09-24, `4c6a9ef`** (staging, `--allow-branch
develop`, `SMS_PROVIDER=mock`): health, TLS, admin-only `/_/`, and a mock OTP round trip all
verified over HTTPS from outside — `wiki/log.md`. Watching that run found five tooling defects,
none blocking (ticket dev-server/05): the deploy-log line's `$(date …)` never expanded, on
either shell, because it sat inside one single-quoted word all the way through (fixed —
`logAppendRemoteCommand` in `plan.ts`, now double-quotes just the substitution and single-quotes
everything else, safe against anything `who`, git's `user.name`, might contain); PocketBase
restarted itself mid-deploy on the `pb_hooks` swap, before `pb_migrations` shipped (fixed —
`--hooksWatch=false`, §14.1); `kl` could not read `journalctl -u kl-pocketbase` (fixed — the
`systemd-journal` group, §14.1); the tools dirtied `wiki/log.md` (fixed — printed, not written,
above); `superuser.sh` warned about its working directory (fixed — `cd /` before `runuser`,
below).

**One-time install — `pnpm run provision [--dry-run] [--allow-branch <b>]`**
`[live]` (staging) (`tools/deploy/provision.ts`, plan in `provision-plan.ts`). The only step that
runs as root (it writes `/etc/systemd` and `/etc/caddy`, which `kl`'s sudo cannot); same refusal
and dry-run preview as `deploy`. Locally it downloads the pinned linux_amd64 release (the VPS may
not reach GitHub) and accepts it only if its sha256 matches both the release's `checksums.txt`
and `server/POCKETBASE_SHA256` — bump that pin with `POCKETBASE_VERSION`. It then ships an
install kit to root-only `/root/kl-provision`, streams `/opt/kl/.env` from memory over ssh stdin
(built by `server-env.ts` from `.env.example`'s VPS / PocketBase names: staging overrides
`SMS_PROVIDER=mock` and `ZARINPAL_SANDBOX=1` fixed in code, then `.env.local`, then the
documented non-secret defaults; refuses a missing required name or a value systemd would
misread; a dry run masks every value from `.env.local`), runs `server/deploy/install.sh`
(idempotent: binary, unit enabled but not started, env swap, real Caddyfile after `caddy
validate`, restarts only a running PocketBase whose binary/unit/env changed, and — since
bootstrap already ran on this VPS before ticket dev-server/05 added the `systemd-journal` group
— repeats that `usermod` idempotently too) and `server/deploy/superuser.sh` (credentials on
stdin; they are in the upsert's argv for about a second on the VPS — PocketBase's CLI takes no
other form; `cd /` before `runuser` so it does not inherit this script's unreadable-by-`kl` cwd,
`/root` — ticket dev-server/05 #5). PocketBase is first started by the next `deploy server`. The
sequence, the checks after it and the separate `PermitRootLogin no` step are
`docs/runbooks/deploy.md` → "First deploy (one time)".

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
- Payment: verification is server-to-server with the stored amount; entitlement never written from
  a client request; callback idempotent (one conditional flip per payment, and a unique
  (`user`, `product`) index on `entitlements`). While `SMS_PROVIDER=mock` every payment route and
  the paid download refuse outright (`PAYMENT_DISABLED_MOCK_SMS`, §8.2), because under mock SMS
  anyone can sign in as anyone; `ZARINPAL_PROVIDER=mock` on the real origin is a boot problem.
- Content: the paid file only through the gated route, 20 fetches per user per rolling day, each
  one logged in `content_downloads` (evidence if an account is used to redistribute it); the
  free file is public by design.
- Sync: `user` always from the auth token; a body cannot write another user's events; 500 events
  per push; a wildly out-of-range `at` (± 1 year) is stored but flagged in server logs.
- Client errors / flags / beacons: per-install daily caps, and per-IP limits (client-errors 120 /
  hour, beacon and flags 300 / hour — §8.2) so that rotating the client-chosen `installId` no
  longer walks around them; bodies capped at 32 KB; no free text except the optional `userNote`
  (500 chars), which is only ever read by the owner.
- Admin: PB admin UI reachable only on the admin origin; superuser password ≥ 20 chars
  (`pnpm run provision` refuses a shorter `KL_ADMIN_PASSWORD`); PB's built-in rate limit on
  superuser login, 3 per 10 s per IP (`_superusers:auth`, which covers
  `/api/collections/_superusers/auth-with-password` — §8.2, `server/test/rate-limits.test.ts`).
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
  every transition, including interrupted downloads and 429s. Backup (`sync/backup.test.ts`,
  `login-merge.test.ts`): the full table, the ladder climbing through real retries, 429 with
  `retryAfter`, offline, 401, a failure mid-push, a crash between push and mark (the server keeps
  one copy — asserted), a crash between a pulled page and its cursor, a user change mid-run,
  one-run-at-a-time under a burst of triggers, the outbox rules, the per-user cursor. Download
  (`sync/download.test.ts`, `download-live.test.ts`): the full table, a stream cut mid-body and
  resumed by a fresh runner (a reload), cut twice, offline mid-body, an ETag changed between
  attempts with and without the manifest caught up, 200-for-206, 416, a 206 from the wrong byte,
  a hash mismatch then a clean retry from byte 0, a crash on each side of the swap, a failed
  update swap keeping the old package, 403/429/503/404, the stall watchdog, `Content-Range`
  parsing. Entitlement and payment (`entitlement.test.ts`, `payment-status.test.ts`): never
  revoked by 401/5xx/503/malformed answers, every `pay/status` outcome, launch recovery kept
  offline and cleared on a terminal answer, the polling bounds; the shared-phone scenario over
  the real stores (`entitlement-account.test.ts`: A full → sign out → none → B none with no
  mismatch → A back full and on the paid package with no network call; a late answer lands in
  its own account's record; a legacy record belongs to nobody). Screens are tested as pure
  machines plus never-throwing flows (`screens/{login,paywall,checkout,purchase-result}/*.test.ts`).
- E2E (Playwright, Android-sized viewport, against a real PocketBase started by the test runner
  — `playwright.config.ts`'s second `webServer`, `server/scripts/e2e.mjs`, `127.0.0.1:8091`, a
  throwaway `pb_data`, `SMS_PROVIDER=mock` so the code is `123456` — reached through
  `vite preview`'s `/api` proxy, same-origin as behind Caddy; and a Zarinpal mock route). Built
  so far: `login.spec.ts` (mock-code login → home, `kv.auth` survives a reload and the token
  answers `/api/me`; a wrong code shows the tries left; offline explains itself) and
  `sync.spec.ts` (study 10 anonymously → log in → the backup leaves nothing unsynced and the
  server holds 10 → a new browser context, i.e. a fresh device, lands on onboarding → log in with
  the same phone → the 10 events are back in IndexedDB and `/boxes` shows the same counts, also
  after a reload), and `payment-gate.spec.ts` (on the gated server the paywall and checkout say
  «پرداخت به‌زودی فعال می‌شود» with no buy button and no alert, «بعداً» returns to study, an
  anonymous `/checkout` goes through login and back). The target: onboarding → 10 reviews → **offline**
  (`context.setOffline(true)`) → 10 more reviews → back online → backup happens → paywall at the
  limit → login with the console OTP → checkout with a discount code → mock gateway → result →
  paid download → offline → study from the paid package → reload → state intact. Second spec:
  restore on a fresh context. Third (`errors.spec.ts`, built): a real throw from the built bundle
  (a query-param-gated hook in `main.tsx`, never armed for a real user) is captured, drains
  through the outbox with no login (ticket dev-server/04), and `tools/errors` resolves its stack
  against the sourcemap for that build — proving symbolication against a real build, not a mock.
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
and its structured log line with the phone masked and secrets hashed; OTP (`otp.test.ts`): the
console happy path, hashing at rest, single use, same user on a second login, 5 wrong codes →
locked, expiry, both rate limits with `retryAfter` and `Retry-After`, phone normalisation, the
purge cron, `mock` accepting `123456` only, an unknown provider and Kavenegar without a key.
The harness takes env overrides (`startServer({env})`) and exposes the process `output()`, which
is where the console provider's code is read from. Sync (`sync.test.ts`): push idempotency (same batch twice, an overlapping retry, a tampered
replay keeps the first copy), 500 accepted and 501 rejected with nothing stored, every malformed
field rejecting the whole batch, the out-of-range `at` log flag, pull paging at seven page sizes
across three pushes with no gap or duplicate, id order inside one push's shared `created`, push
and pull interleaved fifteen times, two concurrent pushes, cross-user isolation (B cannot pull
A's events, cannot overwrite them by id, a forged `user` is ignored, A's cursor opens nothing of
B's), 401 without a token, 403 for a superuser, and the generic collection API still shut. Rate
limits (`rate-limits.test.ts`): the exact rule list with no `/api/` catch-all; each telemetry
route refusing one IP that rotates `installId` past its per-IP limit, storing nothing for the
refused call and still serving another IP; superuser login limited per IP even with the right
password. Payment
(`pay.test.ts`, against `test/zarinpal-stub.ts`, a local Zarinpal v4 stand-in that
`ZARINPAL_API_BASE` points at — the harness defaults that variable to a closed port, so no test
can reach Zarinpal): every `codeStatus` and the §8.3 order, rounding, prices read at request time;
`request` sending `payable` with `IRT`, `DISCOUNT_REJECTED` writing nothing, a 100 % code granting
without a gateway call, `ALREADY_ENTITLED`, `GATEWAY_FAILED`; the callback's ok path, a replay, four
concurrent callbacks with a slow verify (one entitlement, one use), cancelled, not paid, a wrong
amount (failed, error logged), an unknown authority, a gateway that cannot answer; `status/:id` in
each state and for another user; `admin/grant` refused to users, creating and idempotent; both
crons, including a late callback for an expired payment and reconcile refusing a wrong amount; the
mock gateway end to end. Content (`content.test.ts`): manifest, 401, `NOT_ENTITLED`, a whole file,
206 ranges byte-exact across multi-byte text, a stale `If-Range`, 416, the 21st fetch refused per
user, a missing `CONTENT_DIR`. The gate (`payment-gate.test.ts`): a server with `SMS_PROVIDER=mock`
answering 503 `PAYMENT_DISABLED_MOCK_SMS` on every gated route, with and without a token and to a
malformed body, writing nothing and calling no gateway; the ungated routes untouched; both mocks
reported on the production origin. Unknown paths (`api-not-found.test.ts`, on a server with a
publicDir and an index.html, as the VPS runs): GET, POST, PUT, PATCH, DELETE and HEAD under
`/api/` answer 404 `NOT_FOUND` as JSON, while `/api/health`, our GET and POST routes, a CORS
preflight, PocketBase's collections API and realtime, and the app shell on every non-`/api` path
still answer as before. The e2e job exercises every route end to end.

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
(`kavenegar`|`console`|`mock`), `SMS_API_KEY`, `SMS_OTP_TEMPLATE`, `SMS_API_BASE` (default `https://api.kavenegar.com`; tests only), `ZARINPAL_MERCHANT_ID`,
`ZARINPAL_SANDBOX` (`0`|`1`), `ZARINPAL_PROVIDER` (`zarinpal`|`mock`, default `zarinpal`),
`ZARINPAL_API_BASE` (tests only; empty = the sandbox or live host by `ZARINPAL_SANDBOX`),
`ZARINPAL_CALLBACK_URL`, `PUBLIC_APP_ORIGIN`, `CONTENT_DIR`,
`SOURCEMAP_DIR`, `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_KEY`, `BACKUP_S3_SECRET`.
Local bootstrap (`.env.local`, git-ignored, used once): `VPS_IP`, `VPS_ROOT_PASSWORD`. DNS is
done (§14.3) and needs no key — it is managed by hand in Parspack's CDN panel.
GitHub: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `ANDROID_KEYSTORE_B64`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`. Build: `VITE_API_ORIGIN`, `VITE_APP_NAME`
(the deferred Persian name — one constant). Local tools (`.env.local`, git-ignored):
`KL_API_ORIGIN`, `KL_ADMIN_EMAIL`, `KL_ADMIN_PASSWORD`, and for `pnpm run deploy` the GitHub
names above (`DEPLOY_HOST`, `DEPLOY_USER`) plus `DEPLOY_SSH_KEY_FILE` — a path to the key file
(`~` expanded), local only, since CI holds the key itself in `DEPLOY_SSH_KEY`.

---

## 19. Known limitations and open items

- The **Persian app name** is pending the owner (`VITE_APP_NAME`); the design system is decided (§7.9).
- **Hints do not exist yet** (0 of 2,098); the free 150 need approved hints before launch.
- **Word data is 895 of 2,098**; the paid package grows with content updates until complete.
- iOS: no install prompt API; storage for a home-screen PWA is persistent in practice but not
  guaranteed by Apple. The audience is overwhelmingly Android; iOS is supported, not optimised.
- Anonymous progress is not backed up until the user gives a phone number — a deliberate trade
  against asking for a number on first launch.
- The **profile** is reconciled only at login (§7.4): a goal or exam date changed afterwards on
  one device reaches another only at that device's next login. Events are always backed up.
- ~~The outbox drains only inside a backup run, which needs a logged-in user~~ — fixed in ticket
  dev-server/04: `OUTBOX_ROUTES_LIVE` is now `true` for `flag`/`beacon`/`error`, and
  `sync/backup.ts`'s runner drains the outbox for an anonymous install too (every trigger, not
  only inside a login-gated push/pull run — §7.4, `apps/web/e2e/errors.spec.ts` proves it end to
  end). The review-event log itself still needs a login to back up; that has not changed.
- Push notifications: none (see `wiki/web-push-in-iran.md`).
- Real-exam mode, per-field views, Bazaar build, referral codes: after launch.
