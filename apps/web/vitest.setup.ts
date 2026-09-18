/**
 * `fake-indexeddb/auto` installs an in-memory IndexedDB on `globalThis` before any module that
 * touches Dexie is imported. It has to be a setup file rather than an import inside a test: the
 * `db` instance in `db/dexie.ts` is created at module scope.
 */
import 'fake-indexeddb/auto';
