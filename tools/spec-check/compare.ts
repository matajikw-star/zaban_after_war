// The one comparison every check in this tool reduces to: two lists of names that should be the
// same set, each with a label for what to print when one side is missing an entry the other has.

export interface Mismatch {
  readonly table: string;
  readonly name: string;
  /** The side that is missing `name` — this is the file to fix. */
  readonly missingFrom: string;
}

export interface Side {
  readonly names: readonly string[];
  /** How this side is described in a mismatch line, e.g. "docs/spec/what.md §8.1". */
  readonly label: string;
}

/**
 * Every name in `a` that `b` lacks, and vice versa, as one `Mismatch` per name — never both
 * directions for the same name, since a name present on neither side is not this tool's problem.
 * Sorted by name so output (and test assertions) are stable.
 */
export function diffSides(table: string, a: Side, b: Side): Mismatch[] {
  const setA = new Set(a.names);
  const setB = new Set(b.names);
  const mismatches: Mismatch[] = [];
  for (const name of setA) {
    if (!setB.has(name)) mismatches.push({ table, name, missingFrom: b.label });
  }
  for (const name of setB) {
    if (!setA.has(name)) mismatches.push({ table, name, missingFrom: a.label });
  }
  return mismatches.sort(
    (x, y) => x.name.localeCompare(y.name) || x.missingFrom.localeCompare(y.missingFrom),
  );
}

export function formatMismatch(m: Mismatch): string {
  return `spec:check MISMATCH [${m.table}] "${m.name}" is missing from ${m.missingFrom}`;
}
