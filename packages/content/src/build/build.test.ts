/**
 * End-to-end tests of `buildPackages` against the fixture lexicon in `__fixtures__/`. Every
 * other test in `build/` is pure data-in, data-out; this one is the fs orchestration, so it
 * copies the fixtures into a scratch directory per test rather than touching the real
 * `content/` or `packages/content/*.json` this repo ships.
 */

import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildPackages } from './build.ts';

const FIXTURES_DIR = fileURLToPath(new URL('./__fixtures__/', import.meta.url));

let scratchDir: string;
let contentDir: string;
let configDir: string;
let outDir: { free: string; paid: string; manifest: string };

beforeEach(async () => {
  scratchDir = await mkdtemp(path.join(os.tmpdir(), 'kl-content-build-'));
  contentDir = path.join(scratchDir, 'content');
  configDir = path.join(scratchDir, 'config');
  outDir = {
    free: path.join(scratchDir, 'out/free.json'),
    paid: path.join(scratchDir, 'out/paid.json'),
    manifest: path.join(scratchDir, 'out/manifest.json'),
  };
  await cp(path.join(FIXTURES_DIR, 'content'), contentDir, { recursive: true });
  await cp(path.join(FIXTURES_DIR, 'config'), configDir, { recursive: true });
});

afterEach(async () => {
  await rm(scratchDir, { recursive: true, force: true });
});

const NOW = new Date('2026-09-18T12:00:00Z');

async function readJson(filePath: string) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

describe('buildPackages', () => {
  it('ships only entries with senses that are not excluded', async () => {
    const result = await buildPackages({ contentDir, configDir, outDir, now: NOW });
    // apple, banana, fig, elderberry ship; cherry is excluded, date has no senses yet.
    expect(result.totalWords).toBe(6);
    expect(result.shippingWords).toBe(4);
    expect(result.paidCount).toBe(4);
    expect(result.freeCount).toBe(4); // fewer than FREE_SIZE, so free === paid here
  });

  it('orders items by rank, highest priority first', async () => {
    await buildPackages({ contentDir, configDir, outDir, now: NOW });
    const paid = await readJson(outDir.paid);
    expect(paid.items.map((item: { id: string }) => item.id)).toEqual([
      'apple',
      'banana',
      'fig',
      'elderberry',
    ]);
  });

  it('writes ranks.json, frozen on the next run', async () => {
    const first = await buildPackages({ contentDir, configDir, outDir, now: NOW });
    expect(first.ranksAdded).toBe(4);
    const ranksAfterFirst = await readJson(path.join(configDir, 'ranks.json'));
    expect(ranksAfterFirst).toEqual({ apple: 1, banana: 2, fig: 3, elderberry: 4 });

    const second = await buildPackages({ contentDir, configDir, outDir, now: NOW });
    expect(second.ranksAdded).toBe(0);
    const ranksAfterSecond = await readJson(path.join(configDir, 'ranks.json'));
    expect(ranksAfterSecond).toEqual(ranksAfterFirst);
  });

  it('joins an approved hint and nulls out an unapproved one', async () => {
    await buildPackages({ contentDir, configDir, outDir, now: NOW });
    const paid = await readJson(outDir.paid);
    const byId = new Map(
      paid.items.map((item: { id: string; hint: unknown }) => [item.id, item.hint]),
    );
    expect(byId.get('apple')).toEqual({
      template: 'تداعی صوتی',
      association: 'اَپل',
      sentence: 'او یک اَپل (apple) قرمز از باغ چید.',
    });
    expect(byId.get('banana')).toBeNull(); // hint file exists but status is "draft"
    expect(byId.get('fig')).toBeNull(); // no hint file at all
  });

  it('normalizes the hyphen blank in a joined stem', async () => {
    await buildPackages({ contentDir, configDir, outDir, now: NOW });
    const paid = await readJson(outDir.paid);
    const banana = paid.items.find((item: { id: string }) => item.id === 'banana');
    expect(banana.exam.stems[0].stem).toBe(
      'The workers went on strike ..... their demands were met.',
    );
  });

  it('gives the context-only word a weight of 0 and no exam years', async () => {
    await buildPackages({ contentDir, configDir, outDir, now: NOW });
    const paid = await readJson(outDir.paid);
    const elderberry = paid.items.find((item: { id: string }) => item.id === 'elderberry');
    expect(elderberry.weight).toBe(0);
    expect(elderberry.exam.years).toEqual([]);
    expect(elderberry.exam.lastYear).toBeNull();
    expect(elderberry.exam.stems).toEqual([]);
  });

  it('produces the same hash and byte-identical files on a second build of the same content', async () => {
    const first = await buildPackages({ contentDir, configDir, outDir, now: NOW });
    const firstFree = await readFile(outDir.free, 'utf8');
    const firstPaid = await readFile(outDir.paid, 'utf8');

    const second = await buildPackages({ contentDir, configDir, outDir, now: NOW });
    const secondFree = await readFile(outDir.free, 'utf8');
    const secondPaid = await readFile(outDir.paid, 'utf8');

    expect(second.free.hash).toBe(first.free.hash);
    expect(second.paid.hash).toBe(first.paid.hash);
    expect(second.free.version).toBe(first.free.version);
    expect(second.paid.version).toBe(first.paid.version);
    expect(secondFree).toBe(firstFree);
    expect(secondPaid).toBe(firstPaid);
    expect(second.free.changed).toBe(false);
    expect(second.paid.changed).toBe(false);
  });

  it('mints a new version only when the hash actually changes, keyed to the day it changed', async () => {
    const day1 = new Date('2026-09-18T12:00:00Z');
    const day2 = new Date('2026-09-19T12:00:00Z');

    const first = await buildPackages({ contentDir, configDir, outDir, now: day1 });
    expect(first.paid.version).toBe('2026-09-18.1');

    // Same content, later day: version must not move.
    const second = await buildPackages({ contentDir, configDir, outDir, now: day2 });
    expect(second.paid.version).toBe('2026-09-18.1');
    expect(second.paid.changed).toBe(false);

    // Change the content (approve banana's hint) and rebuild on day2: hash changes, so the
    // version mints fresh for that day.
    await cp(
      path.join(FIXTURES_DIR, 'content/hints/apple.json'),
      path.join(contentDir, 'hints/banana.json'),
    );
    const third = await buildPackages({ contentDir, configDir, outDir, now: day2 });
    expect(third.paid.changed).toBe(true);
    expect(third.paid.version).toBe('2026-09-19.1');
  });

  it('writes a manifest with version, hash and byte size for both packages', async () => {
    await buildPackages({ contentDir, configDir, outDir, now: NOW });
    const manifest = await readJson(outDir.manifest);
    expect(manifest.free.bytes).toBeGreaterThan(0);
    expect(manifest.paid.bytes).toBeGreaterThan(0);
    expect(manifest.free.hash).toEqual(expect.any(String));
    expect(manifest.paid.hash).toEqual(expect.any(String));
  });
});
