# ADR-0016 — Content ships as exactly two packages: free and paid

**Status:** accepted · **Date:** 2026-09-17 · Amends ADR-0004's "chunks".

## Context

ADR-0004 split the paid lexicon into N chunks for resumable download. The owner asked for the
word list to be delivered exactly twice: once free, once paid. Resumability is a transport
concern, not a content-shape concern.

## Decision

- `free`: the first 150 words by rank, with hints, bundled into the PWA build and precached by
  the service worker. Offline from the first paint.
- `paid`: **all** words (free ones included), one file, served by an entitlement-gated route
  with HTTP `Range` support, downloaded once after purchase, hash-verified, then swapped in
  atomically as the active package.
- A content update is a new version of the same two files. The client compares versions in the
  manifest and re-downloads the paid file when it changes.
- Words without written senses do not ship in either package until they have them; the build
  reports the count.

## Consequences

- One gated route, one hash, one download state, one active package. Fewer states to test.
- A paid user's first download is ~650 KB gzipped; interruptions resume by byte range.
- The free package's hash is part of the precache manifest, so a content-only change to the
  free words is an app update; paid-only changes are content deploys with no app change.
