/// <reference path="../../pb_data/types.d.ts" />

// The version string `GET /api/health` reports.
//
// The PocketBase JSVM exposes no runtime accessor for the binary's own version, so the pinned tag
// is repeated here. `server/test/health.test.ts` fails if it ever drifts from
// `server/POCKETBASE_VERSION`, which is the single source (server/README.md).
//
// HOOKS_VERSION is ours: bump it whenever a deployed hook changes behaviour a client can observe,
// so a screenshot of settings and one health call identify the running code.

const POCKETBASE_VERSION = '0.40.2';
const HOOKS_VERSION = '3';

module.exports = {
  POCKETBASE_VERSION,
  HOOKS_VERSION,
  /** e.g. "0.40.2+hooks.1" */
  full: `${POCKETBASE_VERSION}+hooks.${HOOKS_VERSION}`,
};
