// Check 2: what.md §8.2's route table vs. what server/pb_hooks/*.pb.js actually registers
// (ticket dev-foundation/04). `[planned]`/`[deferred]` rows are specified but unbuilt, so they
// are skipped rather than reported as code-side drift — see the ticket and what.md's status-mark
// legend (§0).
//
// Path params differ in spelling between the two sides on purpose: what.md writes `:id` (how the
// client and the docs talk about a route), PocketBase's router matches `{id}` (how routerAdd
// actually spells it). Both normalize to `:param` here so that difference is never reported as
// drift.

import type { SourceFile } from './collections.ts';
import { findTable, parseMarkdownTables } from './markdown.ts';

export interface WhatRoute {
  readonly method: string;
  readonly path: string;
  /** true for a `[planned]` or `[deferred]` row — not compared against the code. */
  readonly skip: boolean;
}

export interface CodeRoute {
  readonly method: string;
  readonly path: string;
}

/** `/api/sync/pull?since=&limit=` -> `/api/sync/pull`; `{id}` and `:id` both -> `:param`. */
export function normalizeRoutePath(rawPath: string): string {
  return (rawPath.split('?')[0] ?? '')
    .trim()
    .replace(/\{[^}]+\}/g, ':param')
    .replace(/:[A-Za-z_][A-Za-z0-9_]*/g, ':param');
}

/** what.md §8.2's route table (the one headed "Route", not the rate-limit table below it). */
export function parseWhatRoutes(section: string): WhatRoute[] {
  const table = findTable(parseMarkdownTables(section), 'Route');
  const routes: WhatRoute[] = [];
  for (const row of table.slice(1)) {
    const cell = row[0] ?? '';
    const m = cell.match(/`([A-Z]+)\s+([^`]+)`/);
    if (!m?.[1] || !m[2]) continue;
    const status = row[row.length - 1] ?? '';
    routes.push({
      method: m[1],
      path: normalizeRoutePath(m[2]),
      skip: /\[planned\]|\[deferred\]/.test(status),
    });
  }
  return routes;
}

const ROUTER_ADD_RE = /routerAdd\(\s*'([A-Z]+)'\s*,\s*'([^']+)'/g;

// `GET /api/health` cannot go through routerAdd — PocketBase 0.40 already owns that exact
// pattern and a second routerAdd on it panics the router at startup (core.pb.js). It is
// registered as a routerUse middleware that checks the method and path itself and falls through
// otherwise; this is the one other shape that counts as "registering a route" for this check.
const ROUTER_USE_GUARD_RE =
  /e\.request\.method\s*!==\s*'([A-Z]+)'[\s\S]{0,200}?e\.request\.url\.path\s*!==\s*'([^']+)'/g;

/** Every route server/pb_hooks/*.pb.js registers, by either shape above. */
export function parseHookRoutes(files: readonly SourceFile[]): CodeRoute[] {
  const routes: CodeRoute[] = [];
  for (const file of files) {
    for (const m of file.content.matchAll(ROUTER_ADD_RE)) {
      if (m[1] && m[2]) routes.push({ method: m[1], path: normalizeRoutePath(m[2]) });
    }
    for (const m of file.content.matchAll(ROUTER_USE_GUARD_RE)) {
      if (m[1] && m[2]) routes.push({ method: m[1], path: normalizeRoutePath(m[2]) });
    }
  }
  return routes;
}

export function routeKey(route: { readonly method: string; readonly path: string }): string {
  return `${route.method} ${route.path}`;
}
