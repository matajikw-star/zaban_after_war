// Put the pinned PocketBase binary in server/.pb/, downloading it if it is not already there.
//
// One version, one source: server/POCKETBASE_VERSION. CI, the deploy script and a developer's
// local run all read that file, so they cannot drift (server/README.md).
//
// Used by `pnpm --filter @kl/server pb:download` and by the test harness, which calls
// ensurePocketBase() directly.

import { execFile } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { chmod, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const pbDir = path.join(serverDir, '.pb');

/** The platform/arch strings PocketBase publishes its release assets under. */
const OS_BY_PLATFORM = { win32: 'windows', darwin: 'darwin', linux: 'linux' };
const ARCH_BY_ARCH = { x64: 'amd64', arm64: 'arm64' };

export async function pinnedVersion() {
  const raw = await readFile(path.join(serverDir, 'POCKETBASE_VERSION'), 'utf8');
  return raw.trim();
}

export function binaryPath() {
  return path.join(pbDir, process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase');
}

function assetName(version) {
  const os = OS_BY_PLATFORM[process.platform];
  const arch = ARCH_BY_ARCH[process.arch];
  if (!os || !arch) {
    throw new Error(
      `PocketBase publishes no build for ${process.platform}/${process.arch}. ` +
        `Download it by hand into ${pbDir}.`,
    );
  }
  return `pocketbase_${version}_${os}_${arch}.zip`;
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

/** Unzip without a dependency: every platform we build on ships one of these. */
async function unzip(zipFile, destination) {
  if (process.platform === 'win32') {
    await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Expand-Archive -LiteralPath '${zipFile}' -DestinationPath '${destination}' -Force`,
    ]);
    return;
  }
  await execFileAsync('unzip', ['-o', '-q', zipFile, '-d', destination]);
}

/**
 * @returns {Promise<string>} the path to the pinned binary, downloading it if missing.
 */
export async function ensurePocketBase() {
  const binary = binaryPath();
  if (await exists(binary)) return binary;

  const version = await pinnedVersion();
  const name = assetName(version);
  const url = `https://github.com/pocketbase/pocketbase/releases/download/v${version}/${name}`;

  await mkdir(pbDir, { recursive: true });
  const zipFile = path.join(tmpdir(), name);

  process.stderr.write(`downloading ${url}\n`);
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new Error(`could not download ${url}: HTTP ${response.status}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(zipFile));

  await unzip(zipFile, pbDir);
  await rm(zipFile, { force: true });

  if (process.platform !== 'win32') await chmod(binary, 0o755);

  if (!(await exists(binary))) throw new Error(`the archive did not contain ${binary}`);
  process.stderr.write(`pocketbase ${version} is at ${binary}\n`);
  return binary;
}

// `node scripts/download-pocketbase.mjs`
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await ensurePocketBase();
}
