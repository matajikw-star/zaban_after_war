# Can we send push notifications to Iranian users?

Researched 2026-09-14, for the daily-study-reminder question. Short answer: **web push probably
works today, rides entirely on Google infrastructure, cannot be moved off it, and stops working
in exactly the conditions Iran has produced twice in the last fifteen months.** Build retention
so it survives push being absent.

## The mechanism — the site does not choose the push service

The Push API hands push-service choice to the **browser**, not the site. The application server's
only job is to POST an RFC 8030 request to the endpoint it was handed; there is no API surface for
nominating your own push host ([W3C Push API](https://www.w3.org/TR/push-api/)).

| Browser | Push service | Operator |
|---|---|---|
| Chrome (desktop + Android) | `fcm.googleapis.com` | Google |
| Firefox | `updates.push.services.mozilla.com` | Mozilla |
| Edge | WNS | Microsoft |
| Safari | APNs | Apple |

**The detail that matters and is usually missed:** on Android, `fcm.googleapis.com` is only where
*your server* posts. Delivery to the device rides a persistent socket held open by Google Play
Services to `mtalk.google.com` and friends on **ports 5228–5230** (443 is also listed). Firebase's
own network doc states that this path
[cannot be proxied](https://firebase.google.com/docs/cloud-messaging/network-configuration).

So reachability of web push from Iran is reachability of a non-HTTPS Google socket, not of a
normal HTTPS hostname.

## Reachability from Iran

**OONI, Iran, 2025-06-01 → 2026-09-14:** `fcm.googleapis.com` — 1,431 measurements, 1,394 ok, 15
anomalies, 2 confirmed blocks (~1%). `android.googleapis.com` — 1,427 measurements, ~1.5%
anomalies. No sustained blocking event in fifteen months.

**But that measures the wrong leg.** OONI's `web_connectivity` test is HTTPS to port 443 on a
hostname. There are **zero** measurements for `mtalk.google.com` and **zero** coverage of ports
5228–5230. The reassuring number does not describe the delivery path.

What is known about the delivery path's conditions:

- A [measured 2025 "stealth blackout" study](https://arxiv.org/html/2507.14183v1) found only
  DNS/53, HTTP/80 and HTTPS/443 succeeding; everything else failed silently, dropped at a single
  shared hop across ISPs. A regime that passes only those three ports kills FCM's 5228–5230
  socket. Whether Play Services' 443 fallback survives it was not tested.
- [June 2025](https://en.wikipedia.org/wiki/2025_Internet_blackout_in_Iran): outbound traffic fell
  ~75%; Google Play became inaccessible.
- January 2026: near-total blackout for ~10 days, then allowlist-based restoration at ~25% of
  prior traffic.
- **August 2022, the precedent that matters most:** obtaining a *new* FCM token returned HTTP 403
  for Iranian IPs — attributed to sanctions, not Iranian filtering. Already-valid tokens kept
  delivering until expiry. Digikala, Cafe Bazaar, Divar, Snapp and others were affected
  ([Digiato](https://digiato.com/article/2022/08/09/firebase-cloud-messaging-banned-in-iran-by-google)).
  No follow-up or retraction was ever published, and no recurrence has been reported since. The
  episode is proof that client-side FCM access is revocable by Google unilaterally, without notice.

Separately and better documented: Firebase is sanctions-blocked for Iranian **developers** —
console and admin APIs refuse Iranian IPs, with issues open since 2017.

## Iranian push providers do not solve this

Pushe, Chabok and Najva all sell web push. All three are **shells over FCM**; none has an
independent browser transport, because per the spec they cannot have one. Pushe's own FAQ says it
uses Google Cloud Messaging; Chabok's web client requires `gcm_sender_id` in the manifest; Najva's
setup is a standard service worker. As one Iranian commentator put it, most providers *«تنها
پوسته‌ای برای استفاده راحت‌تر از سرویس کلود مسیجینگ فایربیس هستند»*.

What they genuinely buy: a sender-side API that isn't Firebase console (which matters, since that
console is sanctioned from Iran), plus segmentation, scheduling, rial billing and local support —
and, on **native Android only**, an HMS fallback for Huawei devices. They move the vendor
relationship, not the transport.

## The TWA case

Bazaar has supported TWAs since mid-2021 and lists Web Push among the Chrome capabilities a TWA
inherits. Because the content is rendered by Chrome, a subscription inside a TWA is a Chrome
subscription on the same FCM path — the container changes nothing. The documented native pattern
runs the other way (FCM in the host APK, token passed into the web content), and is still Google.
Embedding an Iranian SDK in the host APK is architecturally possible but resolves to FCM anyway
whenever Play Services is present.

## There is no client-side fallback

The **Notification Triggers API** (`showTrigger` / `TimestampTrigger`) was the one web API that
would have let a PWA fire a daily reminder with no server and no push service at all. Google
[ended its development](https://developer.chrome.com/docs/web-platform/notification-triggers) —
"it wasn't clear that we could provide consistent and reliable experiences across platforms". So a
purely local scheduled notification is not available on the web.

Also worth knowing: Chrome shipped an on-device ML spam filter for web push on Android in May
2025, which replaces flagged notifications with a warning and an unsubscribe button.

## SMS is not a daily channel

Iranian bulk SMS runs ~150 toman per message at 100k–300k volume (Melipayamak, Tir 1405), plus 10%
VAT and a 40-rial statutory share. A daily reminder to 1,000 daily-active users is ~30,000
messages a month ≈ **4.5M toman/month**, scaling linearly — ~45M toman at 10,000 users. Daily
reminders would also need a service line (خط خدماتی), not an advertising line. SMS is viable as an
opt-in nudge for *lapsed* users; it is not the daily channel.

## What survives what

| Channel | Needs Google to reach the device | Survives a 53/80/443-only regime | Survives a blackout |
|---|---|---|---|
| Web push (Chrome PWA or TWA) | yes — mtalk 5228–5230 | unknown; 443 fallback untested | no |
| Web push via an Iranian vendor | yes, identically | same | no |
| TWA + native Iranian SDK | yes, when Play Services is present | same | no |
| In-app streak / goal shown on open | no | yes | yes |
| SMS | no | yes | yes, if SMS is up |

## What this means for the product

Notifications are a **bonus, never a mechanism**. Anything the retention model actually depends on
has to live inside the app and work with the network off — which is what the streak, the daily
goal and the pace estimate already do. Push, if added, is best-effort: ask for permission only
after the user has hit their goal several times, never on first load, and treat a missing
subscription as normal rather than as a degraded state.

## Known unknowns

- **Whether `mtalk.google.com` on 5228–5230 is actually reachable from Iran today.** No measurement
  project tests it. This is the single most important gap, and everything reassuring above rests
  on the wrong port.
- Whether the August 2022 client-side token block was ever formally resolved or merely stopped
  being reported.
- Which push service Samsung Internet ships today (FCM or Samsung's own SPP) — evidence points
  both ways.
- Whether TWA notification delegation changes the transport or only the display layer.
- No Iranian provider with a genuinely non-Google device transport was found — an absence of
  evidence across ~12 targeted searches, not proof that none exists.
