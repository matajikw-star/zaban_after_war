// A tiny brace-balancer for reading plain JS source as text, without a real parser (no new
// dependency for one job — see tools/README.md). It skips line comments, block comments and
// string/template literals so a `{`/`}` inside any of those never miscounts, which is all this
// tool needs from `server/pb_migrations/*.js` and `server/pb_hooks/*.js`.

/** The index of the `}` that closes the `{` at `text[openIdx]`. Throws if it never closes. */
export function matchBalancedBrace(text: string, openIdx: number): number {
  if (text[openIdx] !== '{') {
    throw new Error(`spec-check: matchBalancedBrace called at a non-'{' index (${openIdx})`);
  }
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    } else if (ch === '/' && text[i + 1] === '/') {
      const nl = text.indexOf('\n', i);
      i = nl === -1 ? text.length : nl;
    } else if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 1;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      let j = i + 1;
      while (j < text.length && text[j] !== quote) {
        j += text[j] === '\\' ? 2 : 1;
      }
      i = j;
    }
  }
  throw new Error('spec-check: unbalanced braces');
}

/**
 * The two callback bodies of a `migrate((app) => { … }, (app) => { … })` call (PocketBase's
 * migration shape — see server/pb_migrations/*.js). `down` is `null` when a migration has no
 * rollback callback (none do today, but nothing here requires one).
 */
export function extractMigrateBodies(content: string): { up: string; down: string | null } {
  const migrateIdx = content.indexOf('migrate(');
  if (migrateIdx === -1) return { up: '', down: null };

  const arrowRe = /\(app\)\s*=>\s*\{/g;
  arrowRe.lastIndex = migrateIdx;
  const upMatch = arrowRe.exec(content);
  if (!upMatch) return { up: '', down: null };
  const upOpen = upMatch.index + upMatch[0].length - 1;
  const upClose = matchBalancedBrace(content, upOpen);
  const up = content.slice(upOpen + 1, upClose);

  arrowRe.lastIndex = upClose;
  const downMatch = arrowRe.exec(content);
  if (!downMatch) return { up, down: null };
  const downOpen = downMatch.index + downMatch[0].length - 1;
  const downClose = matchBalancedBrace(content, downOpen);
  const down = content.slice(downOpen + 1, downClose);

  return { up, down };
}
