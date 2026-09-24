/// <reference path="../pb_data/types.d.ts" />

// Per-IP rate limits through PocketBase's built-in limiter (what.md §8.2, §15; how-why §5.11).
//
// Why: the telemetry routes take anonymous calls and cap per `installId`, which the client
// chooses — rotating it walked around every cap, so one machine could write 32 KB rows until the
// disk filled. And §15 already claimed a limit on superuser auth that nothing had switched on.
//
// The limiter keys each rule on `e.realIP()`, which is the client only because
// 1758700000_trusted_proxy.js trusts Caddy's X-Forwarded-For (rightmost). Label syntax verified
// against the 0.40.2 binary (types.d.ts `RateLimitRule`, apis/middlewares_rate_limit.go at
// v0.40.2, and server/test/rate-limits.test.ts): `METHOD /exact/path` matches one custom route;
// `<collection>:auth` is the tag PocketBase puts on a collection's built-in auth endpoints
// (password, OTP, OAuth2). The tag rather than the auth-with-password path so that one rule
// covers every way to log in as a superuser, not only the one enabled today. `duration` is in
// seconds; `audience: ''` = guests and users alike. A request
// already carrying a superuser token is never limited (PocketBase skips it), and a settings save
// in the admin UI resets every counter. The window is fixed, opening at a key's first request.
//
// The rules are the whole list, not an addition to PocketBase's defaults. A fresh 0.40.2 ships
// four rules with the limiter off; switching it on without replacing them would also have
// enabled `/api/` 300 per 10 s per IP — a catch-all this app deliberately does not have: a
// carrier-grade NAT address (common on Iranian mobile networks) can put hundreds of students on
// one IP, and a login restore pulls in pages of 500 events. Everything a user does on the study
// path is authenticated and bounded per user already (§8.2); per-IP limits sit only on the
// anonymous write surfaces and on superuser login. The OTP routes keep their in-hook limits
// (phone + IP, otp.js) — PocketBase's rules cannot key on a phone.
//
// Numbers (how-why §5.11 has the arithmetic):
// - telemetry: an hour window, not a minute. It bounds what one IP can write in a day
//   (client-errors: 120/h ≈ 2,880 rows ≈ 90 MB worst case at 32 KB, against ≈ 2.8 GB at the
//   60-per-minute first proposed), and still lets one device drain a 100-row outbox backlog in
//   one go. A refused call is a 429, which the client's outbox keeps and retries (backup.ts).
// - superuser auth: 3 per 10 s.

const RULES = [
  { label: 'POST /api/client-errors', audience: '', duration: 3600, maxRequests: 120 },
  { label: 'POST /api/beacon', audience: '', duration: 3600, maxRequests: 300 },
  { label: 'POST /api/flags', audience: '', duration: 3600, maxRequests: 300 },
  { label: '_superusers:auth', audience: '', duration: 10, maxRequests: 3 },
];

// What a fresh 0.40.2 install holds before this migration (read from the binary's own
// GET /api/settings on an empty pb_data), so `down` restores exactly that.
const POCKETBASE_DEFAULT_RULES = [
  { label: '*:auth', audience: '', duration: 3, maxRequests: 2 },
  { label: '*:create', audience: '', duration: 5, maxRequests: 20 },
  { label: '/api/batch', audience: '', duration: 1, maxRequests: 3 },
  { label: '/api/', audience: '', duration: 10, maxRequests: 300 },
];

migrate(
  (app) => {
    // Unlike a routerAdd handler, a migration's callbacks run in the script that defined them,
    // so the consts above are in scope (proved by rate-limits.test.ts reading the rules back).
    const settings = app.settings();
    settings.rateLimits.enabled = true;
    settings.rateLimits.excludedIPs = [];
    settings.rateLimits.rules = RULES;
    app.save(settings);
  },
  (app) => {
    const settings = app.settings();
    settings.rateLimits.enabled = false;
    settings.rateLimits.excludedIPs = [];
    settings.rateLimits.rules = POCKETBASE_DEFAULT_RULES;
    app.save(settings);
  },
);
