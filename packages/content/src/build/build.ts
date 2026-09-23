/**
 * The content package builder (`docs/spec/what.md` §6, ticket `.scratch/dev-content/issues/01`).
 * Everything that touches a filesystem lives here; `rank.ts`, `stems.ts`, `card.ts`,
 * `hash.ts` and `manifest.ts` are pure data-in, data-out and are what the tests exercise most.
 */

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ContentPackage, Hint, PackageId, WordCard } from '../types.ts';
import { CONTENT_SCHEMA_VERSION } from '../types.ts';
import { buildWordCard, isShippable } from './card.ts';
import { canonicalJson, sha256Hex } from './hash.ts';
import type { Manifest, VersionsFile } from './manifest.ts';
import { buildManifest, nextVersion } from './manifest.ts';
import type { RankCandidate } from './rank.ts';
import { assignRanks } from './rank.ts';
import type { ExamFile, HintFile, LexiconEntry } from './raw.ts';

/** The free package is the this-many lowest-rank shipping words (`what.md` §6). */
export const FREE_SIZE = 150;

export interface BuildPackagesOptions {
  /** `content/` — lexicon, exams, hints. */
  readonly contentDir: string;
  /** `packages/content/` — ranks.json, exclusions.json, versions.json. */
  readonly configDir: string;
  readonly outDir: {
    readonly free: string;
    readonly paid: string;
    readonly manifest: string;
  };
  /** Injected, never `new Date()` inside this module — CLAUDE.md, "no clock outside …". */
  readonly now: Date;
}

export interface BuildPackagesResult {
  readonly totalWords: number;
  readonly shippingWords: number;
  readonly freeCount: number;
  readonly paidCount: number;
  readonly ranksAdded: number;
  readonly free: {
    readonly version: string;
    readonly hash: string;
    readonly bytes: number;
    readonly changed: boolean;
  };
  readonly paid: {
    readonly version: string;
    readonly hash: string;
    readonly bytes: number;
    readonly changed: boolean;
  };
}

interface ExclusionsFile {
  readonly ids: readonly string[];
  readonly note?: string;
}

async function readJsonDir<T>(dir: string): Promise<Map<string, T>> {
  const out = new Map<string, T>();
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return out;
    throw error;
  }
  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    const raw = await readFile(path.join(dir, name), 'utf8');
    out.set(name.slice(0, -'.json'.length), JSON.parse(raw) as T);
  }
  return out;
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw error;
  }
}

function toHint(hint: HintFile | undefined): Hint | null {
  if (hint?.status !== 'approved') return null;
  return { template: hint.template, association: hint.association, sentence: hint.sentence };
}

function buildPackage(
  packageId: PackageId,
  items: readonly WordCard[],
  version: string,
  now: Date,
): ContentPackage {
  return {
    packageId,
    version,
    builtAt: now.toISOString(),
    schemaVersion: CONTENT_SCHEMA_VERSION,
    hash: sha256Hex(canonicalJson(items)),
    items,
  };
}

async function writeJsonFile(filePath: string, value: unknown, pretty: boolean): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const text = pretty ? `${JSON.stringify(value, null, 2)}\n` : JSON.stringify(value);
  await writeFile(filePath, text, 'utf8');
}

/** Sorted by id so the committed diff of `ranks.json` only ever shows the ids that moved. */
function sortedById(map: Readonly<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of Object.keys(map).sort()) out[id] = map[id] as number;
  return out;
}

export async function buildPackages(options: BuildPackagesOptions): Promise<BuildPackagesResult> {
  const { contentDir, configDir, outDir, now } = options;

  const [lexiconFiles, examFiles, hintFiles, existingRanks, exclusionsFile, versionsFile] =
    await Promise.all([
      readJsonDir<LexiconEntry>(path.join(contentDir, 'lexicon')),
      readJsonDir<ExamFile>(path.join(contentDir, 'exams')),
      readJsonDir<HintFile>(path.join(contentDir, 'hints')),
      readJsonFile<Record<string, number>>(path.join(configDir, 'ranks.json'), {}),
      readJsonFile<ExclusionsFile>(path.join(configDir, 'exclusions.json'), { ids: [] }),
      readJsonFile<VersionsFile>(path.join(configDir, 'versions.json'), {}),
    ]);

  const lexicon = [...lexiconFiles.values()];
  const examsById = new Map<string, ExamFile>(
    [...examFiles.values()].map((exam) => [exam.paperId, exam]),
  );
  const exclusions = new Set(exclusionsFile.ids);

  const shippable = lexicon.filter((entry) => isShippable(entry, exclusions));

  const candidates: RankCandidate[] = shippable.map((entry) => ({
    id: entry.id,
    priority: entry.stats.priority,
    timesTested: entry.stats.timesTested,
    firstYear: entry.stats.firstYear,
  }));
  const ranks = assignRanks(existingRanks, candidates);
  const ranksAdded = Object.keys(ranks).length - Object.keys(existingRanks).length;

  const cards = shippable
    .map((entry) => {
      const rank = ranks[entry.id];
      if (rank === undefined) throw new Error(`${entry.id}: shippable but has no rank`);
      return buildWordCard(entry, rank, examsById, toHint(hintFiles.get(entry.id)));
    })
    .sort((a, b) => a.rank - b.rank);

  const paidItems = cards;
  const freeItems = cards.slice(0, FREE_SIZE);

  const paidHash = sha256Hex(canonicalJson(paidItems));
  const freeHash = sha256Hex(canonicalJson(freeItems));

  const paidVersion = nextVersion(versionsFile.paid, paidHash, now);
  const freeVersion = nextVersion(versionsFile.free, freeHash, now);

  const freePackage = buildPackage('free', freeItems, freeVersion, now);
  const paidPackage = buildPackage('paid', paidItems, paidVersion, now);

  const freeText = JSON.stringify(freePackage);
  const paidText = JSON.stringify(paidPackage);
  const freeBytes = Buffer.byteLength(freeText, 'utf8');
  const paidBytes = Buffer.byteLength(paidText, 'utf8');

  const manifest: Manifest = buildManifest(
    { version: freeVersion, hash: freeHash, bytes: freeBytes },
    { version: paidVersion, hash: paidHash, bytes: paidBytes },
  );

  await mkdir(path.dirname(outDir.free), { recursive: true });
  await writeFile(outDir.free, freeText, 'utf8');
  await mkdir(path.dirname(outDir.paid), { recursive: true });
  await writeFile(outDir.paid, paidText, 'utf8');
  await writeJsonFile(outDir.manifest, manifest, true);

  if (ranksAdded > 0) {
    await writeJsonFile(path.join(configDir, 'ranks.json'), sortedById(ranks), true);
  }

  const freeChanged = versionsFile.free?.hash !== freeHash;
  const paidChanged = versionsFile.paid?.hash !== paidHash;
  if (freeChanged || paidChanged) {
    const nextVersions: VersionsFile = {
      free: { version: freeVersion, hash: freeHash },
      paid: { version: paidVersion, hash: paidHash },
    };
    await writeJsonFile(path.join(configDir, 'versions.json'), nextVersions, true);
  }

  return {
    totalWords: lexicon.length,
    shippingWords: shippable.length,
    freeCount: freeItems.length,
    paidCount: paidItems.length,
    ranksAdded,
    free: { version: freeVersion, hash: freeHash, bytes: freeBytes, changed: freeChanged },
    paid: { version: paidVersion, hash: paidHash, bytes: paidBytes, changed: paidChanged },
  };
}
