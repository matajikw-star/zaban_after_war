/**
 * The active content package (`what.md` §6, §7.1).
 *
 * Exactly two packages exist. `free` is precached by the service worker and works offline from
 * the first launch; `paid` replaces it once it has been downloaded and verified (§7.5). The
 * store holds the whole package plus the two projections the rest of the app wants: the
 * engine's `ContentItem[]`, and a lemma lookup for the card.
 */

import type { ContentItem, ItemId } from '@kl/core';
import { create } from 'zustand';
import type { ContentPackage, PackageId, WordCard } from '../content/types.ts';
import { getPackage, putPackage } from '../db/repo.ts';
import { AppError } from '../errors.ts';
import { breadcrumb } from '../log/breadcrumbs.ts';

/** Where the precached free package is served from (§6.2 writes it, §7.7 precaches it). */
const FREE_PACKAGE_URL = '/content/free.json';

function toEngineItems(pkg: ContentPackage): ContentItem[] {
  return pkg.items.map((card) => ({ id: card.id, rank: card.rank, weight: card.weight }));
}

function indexById(pkg: ContentPackage): Map<ItemId, WordCard> {
  const byId = new Map<ItemId, WordCard>();
  for (const card of pkg.items) byId.set(card.id, card);
  return byId;
}

export interface ContentState {
  readonly active: PackageId | null;
  readonly pkg: ContentPackage | null;
  /** The engine's view: id, rank, weight. Empty until a package is loaded. */
  readonly items: readonly ContentItem[];
  readonly byId: ReadonlyMap<ItemId, WordCard>;
  readonly loaded: boolean;
  /** True when the dev fixture stood in for a missing `free.json` (never in production). */
  readonly usingDevFixture: boolean;
  load: (entitled: boolean) => Promise<void>;
  install: (pkg: ContentPackage, bytes: number) => Promise<void>;
  card: (id: ItemId) => WordCard | null;
}

async function fetchFreePackage(): Promise<ContentPackage | null> {
  const response = await fetch(FREE_PACKAGE_URL);
  if (!response.ok) return null;
  return (await response.json()) as ContentPackage;
}

/**
 * `pnpm content:build` writes `public/content/free.json` and that file is git-ignored, so a
 * fresh clone has no package at all and every screen would be empty. In dev only, a twelve-word
 * fixture stands in. The branch is behind `import.meta.env.DEV`, which Vite folds to `false` in
 * a production build, so neither the check nor the fixture reaches a shipped bundle.
 */
async function devFixturePackage(): Promise<ContentPackage | null> {
  if (!import.meta.env.DEV) return null;
  const module = await import('../content/sample-package.json');
  return module.default as unknown as ContentPackage;
}

export const useContentStore = create<ContentState>()((set, get) => ({
  active: null,
  pkg: null,
  items: [],
  byId: new Map<ItemId, WordCard>(),
  loaded: false,
  usingDevFixture: false,

  load: async (entitled) => {
    if (entitled) {
      const paid = await getPackage('paid');
      if (paid !== null) {
        set({
          active: 'paid',
          pkg: paid,
          items: toEngineItems(paid),
          byId: indexById(paid),
          loaded: true,
          usingDevFixture: false,
        });
        breadcrumb('log', 'content.load', {
          packageId: 'paid',
          version: paid.version,
          items: paid.items.length,
        });
        return;
      }
    }

    // The free package is precached, so this fetch is answered from the service worker offline.
    const free = (await getPackage('free')) ?? (await fetchFreePackage());
    if (free !== null) {
      set({
        active: 'free',
        pkg: free,
        items: toEngineItems(free),
        byId: indexById(free),
        loaded: true,
        usingDevFixture: false,
      });
      breadcrumb('log', 'content.load', {
        packageId: 'free',
        version: free.version,
        items: free.items.length,
      });
      return;
    }

    const fixture = await devFixturePackage();
    if (fixture !== null) {
      set({
        active: 'free',
        pkg: fixture,
        items: toEngineItems(fixture),
        byId: indexById(fixture),
        loaded: true,
        usingDevFixture: true,
      });
      breadcrumb('log', 'content.load', {
        packageId: 'free',
        source: 'dev-fixture',
        note: 'public/content/free.json is missing — run pnpm content:build',
        items: fixture.items.length,
      });
      return;
    }

    set({ loaded: true });
    throw new AppError('CONTENT_UNAVAILABLE', 'no content package could be loaded', {
      url: FREE_PACKAGE_URL,
    });
  },

  install: async (pkg, bytes) => {
    await putPackage(pkg, bytes);
    set({
      active: pkg.packageId,
      pkg,
      items: toEngineItems(pkg),
      byId: indexById(pkg),
      loaded: true,
      usingDevFixture: false,
    });
    breadcrumb('download', 'content.install', { packageId: pkg.packageId, version: pkg.version });
  },

  card: (id) => get().byId.get(id) ?? null,
}));

/** For the engine adapters and the error snapshot, which are not React. */
export function currentContentItems(): readonly ContentItem[] {
  return useContentStore.getState().items;
}
