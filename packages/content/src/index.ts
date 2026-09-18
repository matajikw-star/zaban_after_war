/**
 * The package root — the only barrel in `packages/content` (`what.md` §17.1). `ContentPackage`
 * and `WordCard` are the contract `apps/web` and `server/` import; `buildPackages` is what
 * `tools/content-build` calls.
 */

export type { BuildPackagesOptions, BuildPackagesResult } from './build/build.ts';
export { buildPackages, FREE_SIZE } from './build/build.ts';
export type {
  Confusable,
  ContentPackage,
  ExamStem,
  Hint,
  HintTemplate,
  Homograph,
  ItemId,
  Level,
  PackageId,
  WordCard,
  WordCardExam,
  WordExample,
  WordSense,
} from './types.ts';
export { CONTENT_SCHEMA_VERSION } from './types.ts';
