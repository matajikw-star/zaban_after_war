# Roadmap

> **Superseded 2026-09-17** by `docs/plan/implementation-plan.md` (phases) and `docs/spec/what.md`
> (the current system). Kept for its reasoning; do not plan from it. See ADR-0014.

Seven milestones. Each one ends in something demonstrable, and each is small enough that its
work can be cut without stranding the milestones after it.

The team is one owner plus Claude Code, so "professional team" here means the *discipline* of
one — tickets before code, branches, review, tests, a definition of done — not headcount. Where a
real team would split roles, one person wears the hat and the hat is named, so it is obvious when
it is being skipped.

## Roles (hats, not people)

| Hat | Owns | Mostly |
|---|---|---|
| **Product** | scope, free-tier slice, price, what "good enough" means | owner |
| **Content** | source manifest, ingest quality, hint approval | owner directs, Claude executes |
| **Engineering** | code, tests, review, ADRs | Claude executes, owner reviews |
| **Ops** | VPS, deploys, backups, secrets, incident response | owner holds credentials, Claude writes scripts |
| **Legal/commercial** | Zarinpal merchant, content-rights question | owner only |

## Working rhythm

- Work starts as a ticket under `.scratch/<feature>/issues/NN-<slug>.md`
  (`docs/agents/issue-tracker.md`).
- One branch per ticket: `feat/<slug>`, `fix/<slug>`, `content/<exam-id>`, `chore/<slug>`.
- Merge to `main` by pull request, even solo — the PR is where the diff gets read, and reading
  the diff is the only real defence when an agent writes most of the code.
- `main` is always deployable. It is never force-pushed.
- Definition of done: tests pass, CI green, docs updated in the same commit, `wiki/log.md`
  appended if a decision changed.

## M0 — Foundation

*Goal: an empty repo that already enforces the constitution.*

- GitHub repo created, `main` pushed, branch protection on (require PR, require CI).
- pnpm workspace: `apps/web`, `packages/core`, `packages/content`, `server/`, `tools/`.
- TypeScript strict, Biome (lint + format), Vitest, `.editorconfig`, `.gitattributes`.
- Git LFS for `sources/raw/`.
- CI: install, lint, typecheck, test on every PR.
- `.env.example` with every secret name that will ever exist.
- Issue templates and a PR template that asks "which ADR does this touch?"

*Done when:* a trivial PR runs CI green and merges through the protected branch.

## M1 — The SRS engine

*Goal: the thing v1 got wrong, correct and provable, before any UI exists.*

- `packages/core`: `ReviewEvent`, the fold, box intervals, due calculation, queue building,
  introduction rate, streak in Tehran local time.
- Pure functions only — `now` is always a parameter (ADR-0003).
- Exhaustive unit tests: event ordering, duplicate ids, clock skew, empty log, a simulated
  90-day study history, and a property test that folding a shuffled log gives an identical
  result.
- A CLI simulator in `tools/` that replays a synthetic user and prints the schedule, so interval
  tuning is a conversation about numbers rather than vibes.

*Done when:* `pnpm test` covers the engine and a simulated 90-day run produces a sane schedule.

*Why first:* it has no dependencies, it is the product's actual value, and getting it wrong is
what killed v1's credibility.

## M2 — Content pipeline and the first exam

*Goal: one real exam, ingested end to end, proving the format.*

- `packages/content`: JSON schemas for exam, word and hint; a validator; the chunk builder.
- The `ingest` operation run for real against one source (`docs/plan/content-pipeline.md`).
- The `lint` operation implemented as a script, not just a prompt.
- Hint generation and the owner's approval pass for that exam's words.

*Done when:* one exam is in `content/`, `pnpm content:lint` is clean, and the owner has approved
its hints. **This is the milestone that decides whether the whole project is viable** — if the
scans cannot be extracted at acceptable quality, everything downstream changes.

## M3 — The offline app

*Goal: a real study experience, local only, no accounts.*

- Vite + React + TS + Tailwind, RTL, self-hosted Vazirmatn (ADR-0005).
- Dexie/IndexedDB: content chunks plus the review event log.
- Study session UI, box visualisation, daily goal, streak — the parts of v1 that worked, rebuilt
  on the new engine.
- `vite-plugin-pwa`: installable, app shell precached, works with the network off.
- Deployed to the VPS at a staging path.

*Done when:* the owner can install it on a phone, study the free chunk, go into airplane mode,
and keep studying.

## M4 — Accounts and sync

*Goal: progress survives losing the device.*

- PocketBase deployed under systemd behind Caddy; collections and rules as migrations in the repo.
- Phone + SMS OTP as a `pb_hooks` flow against the chosen provider, rate-limited.
- Event sync: push new local events, pull unseen remote ones, union by id (ADR-0002).
- Backups running, and one restore rehearsed and logged.

*Done when:* studying on a phone, deleting the app, reinstalling and logging in restores every
review — and a laptop session merges with the phone's instead of overwriting it.

## M5 — Payment and entitlement

*Goal: money in, content out.*

- Zarinpal: request, redirect, callback, **server-side verify**, then flip entitlement.
- Entitlement-gated chunk delivery (ADR-0004).
- Paywall UI, receipts, and a manual grant path in the admin UI for support cases.
- Rate limits on chunk fetch.

*Done when:* a real payment of a small amount grants access, and a forged callback does not.

The Zarinpal merchant account is already active (2026-09-10), so this milestone has no external
lead time — it is gated only by M4 shipping first.

## M6 — Full content and launch

*Goal: ten years of exams, and the domain pointed at it.*

- Ingest the remaining sources, one branch per exam.
- Full lint pass; fix duplicate lemmas, missing translations, unapproved hints.
- Free-tier slice chosen deliberately (Product hat).
- Onboarding, install instructions, support contact, privacy text.
- `konkurleitner.com` cut over to production; the staging path stays for the next release.

*Done when:* a stranger can find the site, install it, study free, pay, and study the rest —
offline.

## Later, deliberately not now

Recorded so they stop competing for attention: FSRS instead of fixed intervals (a re-fold, cheap
to do later — ADR-0003); listening and reading-comprehension question types; a web admin for
content editing; native wrappers; teacher/class accounts; leaderboards.

## Sequencing risks

| Risk | Milestone | Handling |
|---|---|---|
| Scans too poor to extract reliably | M2 | Test the worst source first, not the best. If it fails, the plan becomes manual entry and the timeline changes. |
| ~~Zarinpal merchant delayed~~ | M5 | Resolved 2026-09-10: the merchant account is already active. |
| SMS OTP pattern approval slow | M4 | Start the application in M2. Email fallback exists but is worse for this audience. |
| GitHub Actions cannot SSH to an Iranian VPS | M0 | Test in M0; pull-based deploy is the fallback (`docs/plan/infrastructure.md`). |
| Content-rights question unresolved | M6 | It killed v1. Get an answer before launch, not after. |
