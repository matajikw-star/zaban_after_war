// Check 5: what.md §18's configuration names vs. .env.example (ticket dev-foundation/04).
//
// §18 is prose, not a table, but it is written as a deliberate backtick-quoted list of
// `SCREAMING_CASE` names — the same shape as §8.4's beacon list — so every backtick token
// matching that shape is a name of record. Enum values quoted the same way (`kavenegar`,
// `mock`, ...) are lowercase and never match.

const ENV_NAME_RE = /[A-Z][A-Z0-9_]*/;

/** what.md §18: every backtick-quoted `SCREAMING_CASE` token. */
export function parseWhatEnvVars(section: string): string[] {
  const anchored = new RegExp(`^(?:${ENV_NAME_RE.source})$`);
  return [...section.matchAll(/`([^`]+)`/g)]
    .map((m) => m[1] ?? '')
    .filter((token) => anchored.test(token));
}

/** .env.example: the name on the left of every `NAME=` line (comments don't start a line). */
export function parseEnvExample(content: string): string[] {
  return [...content.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1] ?? '');
}
