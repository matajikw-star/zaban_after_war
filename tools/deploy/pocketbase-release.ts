// The linux_amd64 PocketBase binary `pnpm run provision` ships to the VPS (what.md §14.1).
//
// Downloaded here, on the machine running the tool, never on the VPS: github.com may be filtered
// from an Iranian server. The release zip is accepted only when its sha256 matches BOTH the
// release's own `checksums.txt` and the pin committed in `server/POCKETBASE_SHA256`. The first
// catches a corrupted download; the second catches a release asset that changed after it was
// reviewed — `checksums.txt` comes from the same place as the zip, so on its own it cannot.
// Upgrading PocketBase = bumping POCKETBASE_VERSION and POCKETBASE_SHA256 in the same commit.
//
// The pure parts (names, URLs, checksum lines, the verdict) are unit-tested; `prepareLinuxBinary`
// is the IO wrapper.

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function linuxAssetName(version: string): string {
  return `pocketbase_${version}_linux_amd64.zip`;
}

export function releaseUrl(version: string, file: string): string {
  return `https://github.com/pocketbase/pocketbase/releases/download/v${version}/${file}`;
}

/** The sha256 `checksums.txt` (or `POCKETBASE_SHA256`, same format) lists for `asset`. */
export function checksumFor(checksumsText: string, asset: string): string {
  for (const raw of checksumsText.split(/\r?\n/)) {
    const match = /^([0-9a-f]{64})\s+\*?(\S+)$/.exec(raw.trim());
    if (match && match[2] === asset) return match[1] as string;
  }
  throw new Error(`no sha256 for ${asset} in the checksums list`);
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * The verdict on a downloaded zip. Throws with all three hashes — none of them is a secret, and a
 * mismatch is exactly the moment someone needs to see them.
 */
export function verifyZip(actual: string, published: string, pinned: string, asset: string): void {
  if (actual !== published || actual !== pinned) {
    throw new Error(
      `PB_CHECKSUM_MISMATCH: ${asset} sha256 is ${actual}; checksums.txt says ${published}; ` +
        `server/POCKETBASE_SHA256 pins ${pinned}. Nothing was shipped.`,
    );
  }
}

/** `sha256sum -c` input for the extracted binary, which install.sh checks again on the VPS. */
export function binaryChecksumLine(sha256: string): string {
  return `${sha256}  pocketbase\n`;
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`could not download ${url}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** Extracts `pocketbase` from the zip into `destinationDir`, with no dependency. */
async function extractBinary(zipFile: string, destinationDir: string): Promise<void> {
  const scratch = await mkdtemp(path.join(tmpdir(), 'kl-pb-linux-'));
  try {
    if (process.platform === 'win32') {
      await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Expand-Archive -LiteralPath '${zipFile}' -DestinationPath '${scratch}' -Force`,
      ]);
    } else {
      await execFileAsync('unzip', ['-o', '-q', zipFile, '-d', scratch]);
    }
    await copyFile(path.join(scratch, 'pocketbase'), path.join(destinationDir, 'pocketbase'));
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

export interface PreparedBinary {
  /** Repo-relative directory holding `pocketbase` and `pocketbase.sha256`. */
  readonly stageDir: string;
  readonly zipSha256: string;
  readonly downloaded: boolean;
}

/**
 * Makes `<serverDir>/.pb/linux_amd64/{pocketbase,pocketbase.sha256}` from a verified zip. A zip
 * already cached there is re-verified against the pin and reused without touching the network.
 */
export async function prepareLinuxBinary(repoRoot: string): Promise<PreparedBinary> {
  const serverDir = path.join(repoRoot, 'server');
  const version = (await readFile(path.join(serverDir, 'POCKETBASE_VERSION'), 'utf8')).trim();
  const asset = linuxAssetName(version);
  const pinned = checksumFor(
    await readFile(path.join(serverDir, 'POCKETBASE_SHA256'), 'utf8'),
    asset,
  );

  const stageRel = 'server/.pb/linux_amd64';
  const stageDir = path.join(repoRoot, stageRel);
  await mkdir(stageDir, { recursive: true });
  const zipFile = path.join(stageDir, asset);

  let zip: Uint8Array | null = null;
  let downloaded = false;
  if (await exists(zipFile)) {
    const cached = new Uint8Array(await readFile(zipFile));
    if (sha256Hex(cached) === pinned) zip = cached;
  }
  if (zip === null) {
    const published = checksumFor(
      new TextDecoder().decode(await download(releaseUrl(version, 'checksums.txt'))),
      asset,
    );
    const fresh = await download(releaseUrl(version, asset));
    verifyZip(sha256Hex(fresh), published, pinned, asset);
    await writeFile(zipFile, fresh);
    zip = fresh;
    downloaded = true;
  }

  await extractBinary(zipFile, stageDir);
  const binary = new Uint8Array(await readFile(path.join(stageDir, 'pocketbase')));
  await writeFile(path.join(stageDir, 'pocketbase.sha256'), binaryChecksumLine(sha256Hex(binary)));

  return { stageDir: stageRel, zipSha256: sha256Hex(zip), downloaded };
}
