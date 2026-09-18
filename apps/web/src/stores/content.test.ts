import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentPackage } from '../content/types.ts';
import { db } from '../db/dexie.ts';
import { putPackage } from '../db/repo.ts';
import { breadcrumbs, clearBreadcrumbs } from '../log/breadcrumbs.ts';
import { useContentStore } from './content.ts';

function packageOf(
  packageId: 'free' | 'paid',
  version: string,
  ids: readonly string[],
): ContentPackage {
  return {
    packageId,
    version,
    builtAt: '2026-09-18T00:00:00.000Z',
    schemaVersion: 1,
    hash: `hash-${version}`,
    items: ids.map((id, index) => ({
      id,
      lemma: id,
      rank: index + 1,
      weight: ids.length - index,
      level: 'B1',
      senses: [],
      confusables: [],
      homograph: { suspected: false, note: null },
      hint: null,
      exam: { timesTested: 0, timesAsAnswer: 0, years: [], lastYear: null, stems: [] },
    })),
  };
}

const INITIAL = useContentStore.getState();

beforeEach(async () => {
  await db.open();
  await db.packages.clear();
  clearBreadcrumbs();
  useContentStore.setState({ ...INITIAL, byId: new Map(), items: [] });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  clearBreadcrumbs();
  await db.packages.clear();
});

describe('content store', () => {
  it('projects a package into the engine view and a lemma lookup', async () => {
    await putPackage(packageOf('free', '1', ['abandon', 'bear']), 100);

    await useContentStore.getState().load(false);

    const state = useContentStore.getState();
    expect(state.active).toBe('free');
    expect(state.items).toEqual([
      { id: 'abandon', rank: 1, weight: 2 },
      { id: 'bear', rank: 2, weight: 1 },
    ]);
    expect(state.card('bear')?.lemma).toBe('bear');
    expect(state.card('nothing')).toBeNull();
  });

  it('prefers the paid package when the device is entitled', async () => {
    await putPackage(packageOf('free', '1', ['abandon']), 100);
    await putPackage(packageOf('paid', '2', ['abandon', 'bear', 'acquire']), 300);

    await useContentStore.getState().load(true);

    expect(useContentStore.getState().active).toBe('paid');
    expect(useContentStore.getState().items).toHaveLength(3);
  });

  it('falls back to free when entitled but the paid package has not landed yet', async () => {
    await putPackage(packageOf('free', '1', ['abandon']), 100);

    await useContentStore.getState().load(true);

    expect(useContentStore.getState().active).toBe('free');
  });

  it('fetches the precached free package when nothing is stored', async () => {
    const pkg = packageOf('free', '3', ['acquire']);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(pkg), { status: 200 })),
    );

    await useContentStore.getState().load(false);

    expect(useContentStore.getState().pkg?.version).toBe('3');
    expect(useContentStore.getState().usingDevFixture).toBe(false);
  });

  it('falls back to the dev fixture when free.json 404s, and says so in a breadcrumb', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not found', { status: 404 })),
    );

    await useContentStore.getState().load(false);

    const state = useContentStore.getState();
    expect(state.usingDevFixture).toBe(true);
    expect(state.items).toHaveLength(12);
    expect(state.card('bear')?.senses).toHaveLength(2);

    const crumb = breadcrumbs().find((entry) => entry.msg === 'content.load');
    expect(crumb?.data).toMatchObject({ source: 'dev-fixture' });
  });

  it('install swaps the active package', async () => {
    await useContentStore.getState().install(packageOf('paid', '9', ['abandon', 'bear']), 200);

    expect(useContentStore.getState().active).toBe('paid');
    expect(useContentStore.getState().pkg?.version).toBe('9');
    // Written through the repo, so a reload finds it.
    expect(await db.packages.get('paid')).toMatchObject({ version: '9', bytes: 200 });
  });
});
