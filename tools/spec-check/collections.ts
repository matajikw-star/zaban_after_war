// Check 1: what.md §8.1's collections vs. what server/pb_migrations/*.js actually creates
// (ticket dev-foundation/04). Only the migrations' `up` callback counts — the `down` callback is
// a rollback, never run in normal operation, so a name it deletes is not "gone" for this check.

import { extractMigrateBodies } from './js-scan.ts';
import { parseMarkdownTables } from './markdown.ts';

/** what.md §8.1: the first column of each row, e.g. "`review_events` | ..." -> 'review_events'. */
export function parseWhatCollections(section: string): string[] {
  const [table] = parseMarkdownTables(section);
  if (!table) throw new Error('spec-check: no collections table found in what.md §8.1');
  const names: string[] = [];
  for (const row of table.slice(1)) {
    const m = (row[0] ?? '').match(/`([a-z_]+)`/);
    if (m?.[1]) names.push(m[1]);
  }
  return names;
}

export interface SourceFile {
  readonly name: string;
  readonly content: string;
}

/**
 * The collections that exist after every migration's `up` callback has run, in filename order
 * (each migration file is named `<unix-ms>_<slug>.js`, so lexical order is chronological). A
 * later migration's `app.delete(app.findCollectionByNameOrId('x'))` in its own `up` removes a
 * name a rename or a real drop would put there — see the ticket's "net of later migrations".
 */
export function collectionsFromMigrations(files: readonly SourceFile[]): string[] {
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
  const names = new Set<string>();
  for (const file of sorted) {
    const { up } = extractMigrateBodies(file.content);
    for (const m of up.matchAll(/new Collection\(\{\s*type:\s*'[^']*',\s*name:\s*'([^']+)'/g)) {
      if (m[1]) names.add(m[1]);
    }
    for (const m of up.matchAll(/app\.delete\(app\.findCollectionByNameOrId\('([^']+)'\)\)/g)) {
      if (m[1]) names.delete(m[1]);
    }
  }
  return [...names].sort();
}
