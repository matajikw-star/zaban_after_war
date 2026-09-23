/// <reference path="../pb_data/types.d.ts" />

// Trust Caddy's X-Forwarded-For so `e.realIP()` is the client, not Caddy (how-why §5.7).
//
// PocketBase listens on 127.0.0.1:8090 only and Caddy is the single hop in front of it (DNS-only,
// no CDN proxy — what.md §14.3). Caddy appends the address it saw as the rightmost entry, so the
// rightmost value (`useLeftmostIP: false`) is the one a client cannot forge. Without this every
// request has the IP 127.0.0.1 and the OTP route's 10-per-IP-per-hour limit is one global bucket.

migrate(
  (app) => {
    const settings = app.settings();
    settings.trustedProxy.headers = ['X-Forwarded-For'];
    settings.trustedProxy.useLeftmostIP = false;
    app.save(settings);
  },
  (app) => {
    const settings = app.settings();
    settings.trustedProxy.headers = [];
    settings.trustedProxy.useLeftmostIP = false;
    app.save(settings);
  },
);
