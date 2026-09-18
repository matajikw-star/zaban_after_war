/**
 * Versioning and the manifest (`docs/spec/what.md` §6.1–6.2). The version string is
 * reproducible from `packages/content/versions.json`, not from the clock: two builds on the
 * same day with the same content must mint the same version.
 */

export interface PackageVersionInfo {
  readonly version: string;
  readonly hash: string;
}

export interface VersionsFile {
  readonly free?: PackageVersionInfo;
  readonly paid?: PackageVersionInfo;
}

export interface ManifestEntry {
  readonly version: string;
  readonly hash: string;
  readonly bytes: number;
}

export interface Manifest {
  readonly free: ManifestEntry;
  readonly paid: ManifestEntry;
}

function dateStamp(now: Date): string {
  const iso = now.toISOString();
  const date = iso.slice(0, 10);
  if (date.length !== 10) throw new Error(`unexpected ISO date: ${iso}`);
  return date;
}

/**
 * `YYYY-MM-DD.N`. A build whose hash matches `previous` keeps its version untouched — the same
 * content never mints a new version. Otherwise `N` starts at 1 for the day and increments only
 * when `previous` was already stamped with today's date (a second hash-changing build the same
 * day).
 */
export function nextVersion(
  previous: PackageVersionInfo | undefined,
  hash: string,
  now: Date,
): string {
  if (previous?.hash === hash) return previous.version;

  const stamp = dateStamp(now);
  const prefix = `${stamp}.`;
  if (previous?.version.startsWith(prefix)) {
    const n = Number(previous.version.slice(prefix.length));
    return `${prefix}${n + 1}`;
  }
  return `${prefix}1`;
}

export function buildManifest(
  free: { version: string; hash: string; bytes: number },
  paid: { version: string; hash: string; bytes: number },
): Manifest {
  return {
    free: { version: free.version, hash: free.hash, bytes: free.bytes },
    paid: { version: paid.version, hash: paid.hash, bytes: paid.bytes },
  };
}
