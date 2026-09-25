import { describe, expect, it } from 'vitest';
import { collectionsFromMigrations, parseWhatCollections } from './collections.ts';

describe('parseWhatCollections', () => {
  it('reads the first column of every data row, dropping the header', () => {
    const section = [
      '| Collection | Fields | Rules |',
      '|---|---|---|',
      '| `users` (auth) | `phone` | own |',
      '| `review_events` | `id`, `user` | none |',
    ].join('\n');
    expect(parseWhatCollections(section)).toEqual(['users', 'review_events']);
  });
});

describe('collectionsFromMigrations', () => {
  it("collects a name created in one migration's up callback", () => {
    const files = [
      {
        name: '1_init.js',
        content: `
migrate(
  (app) => {
    const x = new Collection({ type: 'base', name: 'review_events' });
    app.save(x);
  },
  (app) => {},
);
`,
      },
    ];
    expect(collectionsFromMigrations(files)).toEqual(['review_events']);
  });

  it('a later migration dropping a collection in its own up callback removes it', () => {
    const files = [
      {
        name: '1_init.js',
        content: `
migrate(
  (app) => { const x = new Collection({ type: 'base', name: 'scratch' }); app.save(x); },
  (app) => {},
);
`,
      },
      {
        name: '2_cleanup.js',
        content: `
migrate(
  (app) => { app.delete(app.findCollectionByNameOrId('scratch')); },
  (app) => {},
);
`,
      },
    ];
    expect(collectionsFromMigrations(files)).toEqual([]);
  });

  it('ignores a deletion that only exists in a down (rollback) callback', () => {
    const files = [
      {
        name: '1_init.js',
        content: `
migrate(
  (app) => { const x = new Collection({ type: 'base', name: 'review_events' }); app.save(x); },
  (app) => { app.delete(app.findCollectionByNameOrId('review_events')); },
);
`,
      },
    ];
    expect(collectionsFromMigrations(files)).toEqual(['review_events']);
  });

  it('orders files lexically (chronologically, given the <unix-ms>_slug.js names)', () => {
    const files = [
      {
        name: '2_later.js',
        content: `migrate((app) => { app.delete(app.findCollectionByNameOrId('x')); }, (app) => {});`,
      },
      {
        name: '1_earlier.js',
        content: `migrate((app) => { const x = new Collection({ type: 'base', name: 'x' }); app.save(x); }, (app) => {});`,
      },
    ];
    expect(collectionsFromMigrations(files)).toEqual([]);
  });
});
