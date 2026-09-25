// Check 3: what.md §8.4's fixed beacon-name list vs. the client's `BeaconName` union
// (apps/web/src/net/api.ts) and the server's accepted-name list (server/pb_hooks/lib/telemetry.js)
// — ticket dev-foundation/04. Three names, checked as two independent pairs against what.md
// (client vs. what.md, server vs. what.md), which is what surfaces a name added to only one side.

import { backtickTokens } from './markdown.ts';

const NAME_RE = /[a-z][a-z0-9_]*/;

/** what.md §8.4: every backtick-quoted `snake_case` token in the section's prose list. */
export function parseWhatBeacons(section: string): string[] {
  return backtickTokens(section, NAME_RE);
}

/** apps/web/src/net/api.ts: the members of `export type BeaconName = | '...' | '...';`. */
export function parseClientBeacons(apiTsContent: string): string[] {
  const m = apiTsContent.match(/export type BeaconName =([\s\S]*?);/);
  if (!m?.[1]) throw new Error('spec-check: BeaconName union not found in apps/web/src/net/api.ts');
  return [...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1] ?? '');
}

/** server/pb_hooks/lib/telemetry.js: the entries of `const BEACON_NAMES = [...]`. */
export function parseServerBeacons(telemetryJsContent: string): string[] {
  const m = telemetryJsContent.match(/const BEACON_NAMES = \[([\s\S]*?)\];/);
  if (!m?.[1]) {
    throw new Error('spec-check: BEACON_NAMES not found in server/pb_hooks/lib/telemetry.js');
  }
  return [...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1] ?? '');
}
