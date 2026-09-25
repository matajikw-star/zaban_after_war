// Generic, dumb markdown reading for what.md — no markdown library, just the two shapes this
// file actually uses: a heading-delimited section, and a pipe table inside one. Nothing here
// understands prose; each spec-check module decides what a section's text means.

/**
 * The body of the section starting at the first line matching `headingPattern`, up to (not
 * including) the next heading of the same or a shallower level. Throws if no line matches —
 * a check that can't find its section is a check that would otherwise silently compare nothing.
 */
export function extractSection(markdown: string, headingPattern: RegExp): string {
  const lines = markdown.split('\n');
  const startIdx = lines.findIndex((line) => headingPattern.test(line));
  if (startIdx === -1) {
    throw new Error(`spec-check: no heading in what.md matches ${headingPattern}`);
  }
  const startHeading = lines[startIdx] ?? '';
  const level = (startHeading.match(/^#+/) ?? [''])[0].length;

  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const m = (lines[i] ?? '').match(/^(#+)\s/);
    if (m && (m[1]?.length ?? 0) <= level) {
      endIdx = i;
      break;
    }
  }
  return lines.slice(startIdx + 1, endIdx).join('\n');
}

/** A separator row like `|---|---|` or `| :-- | --: |`. */
function isSeparatorRow(cells: readonly string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

/**
 * Every pipe table in a section, as arrays of cells including the header row (index 0). Tables
 * are separated by any non-`|` line, so two tables in one section (§8.2 has a route table and a
 * rate-limit table) come back as two entries.
 */
export function parseMarkdownTables(section: string): string[][][] {
  const tables: string[][][] = [];
  let current: string[][] = [];
  for (const rawLine of section.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('|')) {
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim());
      if (isSeparatorRow(cells)) continue;
      current.push(cells);
    } else if (current.length > 0) {
      tables.push(current);
      current = [];
    }
  }
  if (current.length > 0) tables.push(current);
  return tables;
}

/** The first table whose header row starts with `firstHeaderCell`. Throws if there is none. */
export function findTable(tables: readonly string[][][], firstHeaderCell: string): string[][] {
  const table = tables.find((t) => t[0]?.[0] === firstHeaderCell);
  if (!table) {
    throw new Error(`spec-check: no table with header "${firstHeaderCell}" found`);
  }
  return table;
}

/** Every backtick-quoted token in `text` matching `pattern` (anchored to the whole token). */
export function backtickTokens(text: string, pattern: RegExp): string[] {
  const anchored = new RegExp(`^(?:${pattern.source})$`);
  const out: string[] = [];
  for (const m of text.matchAll(/`([^`]+)`/g)) {
    const token = m[1] ?? '';
    if (anchored.test(token)) out.push(token);
  }
  return out;
}
