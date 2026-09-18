/**
 * The content **manifest** — `GET /api/content/manifest` (`what.md` §8.2), what the download
 * machine of §7.5 compares its cached versions against.
 *
 * The package shape itself no longer lives here: `packages/content` now exports `WordCard` and
 * `ContentPackage` as `@kl/content`, and every importer in the app takes them from there, so
 * the client and the build can never drift. What is left is the one API response that is about
 * content without being content.
 */

export interface ContentManifestEntry {
  readonly version: string;
  readonly hash: string;
  readonly bytes: number;
}

export interface ContentManifest {
  readonly free: ContentManifestEntry;
  readonly paid: ContentManifestEntry;
}
