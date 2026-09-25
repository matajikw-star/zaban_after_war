# 08 — `offline.spec.ts` flakes about 1 run in 15

Status: resolved
Type: bug (test)
Found: 2026-09-24, diagnosing a reported flake in `apps/web/e2e/offline.spec.ts`

## What is wrong

`KL_E2E_CHANNEL=msedge pnpm e2e offline --repeat-each=15` failed about 1 run in 15 on: "home
still renders from the precache with the free package while offline". After the offline reload,
the page showed onboarding's first slide («کنکور لایتنر» heading, «قبلاً حساب داشتم», «بعدی»)
instead of Home, so `getByRole('button', { name: 'شروع مرور' })` never appeared.

## Investigation

Instrumented the spec with `console.log(page.url())` after each step and ran
`--repeat-each=25` four times under `msedge` to force failures. Every failing run showed the
same shape: the URL was already `http://127.0.0.1:4173/onboarding` by the time of the first
`await page.reload()` (sometimes visible as early as the `navigator.serviceWorker.ready` await),
and it stayed `/onboarding` through every later reload, including the offline one.

Root cause is a **test race, not an app bug**:

1. The spec does `await page.goto('/')` with no profile yet, then `await seedProfile(page)`
   (`e2e/helpers.ts`), which writes `kv.profile` straight into IndexedDB via a raw
   `indexedDB.open()` — outside React, outside the store.
2. Home's `useOnboardingRedirect` (`apps/web/src/screens/onboarding/redirect.ts`) reads
   `hasProfile` from `useSettingsStore` and, if false, client-side-navigates (`replace: true`)
   to `/onboarding`. `main.tsx`'s bootstrap awaits `useSettingsStore.load()` before `mount()` is
   ever called, so this decision is never stale *within one page load* — at the very first
   `goto('/')`, `kv.profile` genuinely does not exist yet, so the redirect is correct when it
   fires. The race is between that redirect (an in-page, no-navigation `history.replaceState`)
   and `seedProfile`'s out-of-band IndexedDB write, both kicked off around the same moment.
3. When the redirect wins, `page.url()` is `/onboarding` before `seedProfile` resolves. The
   spec's next step was `await page.reload()`, which reloads *whatever URL is currently
   loaded* — `/onboarding`, not `/`. On that reload, bootstrap re-reads `kv.profile` (now
   present, since `seedProfile` had finished by then) and correctly sets `hasProfile: true` —
   but the mounted route is `Onboarding` (`apps/web/src/screens/onboarding/Onboarding.tsx`), not
   `Home`, and `Onboarding` has no guard that sends an already-has-a-profile user back to `/` —
   by design, it is a destination screen, not a route loader (see `redirect.ts`'s own comment:
   the guard is "owned by Home"). So the page is stuck rendering onboarding's slide 1 for the
   rest of the test, offline reload included.

Ruled out the "scary alternative" (the app itself reading stale state on a cold start): checked
`apps/web/src/main.tsx` — `bootstrap()` awaits `openDatabase()`, `useAuthStore.load()` and
`useSettingsStore.load()` in sequence, and only *then* calls `mount()`, which renders
`RouterProvider` for the first time. There is no code path where a screen renders before the
settings store has resolved `kv.profile` for that particular load. Every other spec that calls
`seedProfile` (`login.spec.ts`, `review.spec.ts`, `smoke.spec.ts`, `sync.spec.ts`,
`errors.spec.ts`) navigates explicitly (`page.goto('/')` or `page.goto('/login')`, etc.) right
after seeding, never `page.reload()` — this spec was the one exception, and that is exactly the
pattern that races.

## Fix

`apps/web/e2e/offline.spec.ts`: the reload right after `seedProfile` (the one that makes the
service worker start controlling the page, before the offline section) is now
`await page.goto('/')` instead of `await page.reload()`. This is still a real navigation — still
the first one the now-active worker controls — but it is deterministic about *which* URL it
loads, matching every other spec's `seedProfile` pattern instead of trusting whatever URL a
racing client-side redirect left behind. Added a comment at the call site explaining the race so
a future edit doesn't quietly put `reload()` back.

Audited every other spec for the same `goto('/') → seedProfile → reload()` shape
(`grep -n "seedProfile\|reload(" apps/web/e2e/*.ts`): none of the other `reload()` calls
immediately follow a `seedProfile` — they come after an explicit navigation (`/login`,
`/review`, `/settings`) that has already settled the URL, so none of them share this race.
No other spec needed changing.

## Verification (all exit 0)

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` — all pass.
- Before the fix: `KL_E2E_CHANNEL=msedge pnpm exec playwright test offline --repeat-each=25`
  (instrumented) reproduced the flake 4 times across 25 runs, all with the `/onboarding` URL
  signature above.
- After the fix: `KL_E2E_CHANNEL=msedge pnpm e2e offline --repeat-each=40` — 40/40 passed.
- `KL_E2E_CHANNEL=msedge pnpm e2e` — full suite, 17 passed.

No changes to `docs/spec/what.md` — this was a test-only fix; the app's onboarding-redirect
behaviour is unchanged and already matches §7.8.

## Out of scope, reported not fixed

`Onboarding.tsx` has no symmetric guard redirecting an already-has-a-profile visitor away from
`/onboarding` back to `/`. In real usage this is currently unreachable (the only way to land on
`/onboarding` is Home's own redirect, which only fires when there is no profile, or the explicit
`/login` → onboarding-if-no-profile flow), except by a user manually typing or bookmarking
`/onboarding` after already completing it, or a stale shared link. Worth a small defensive guard
at some point, but it is not what caused this flake and is not required to fix it.
