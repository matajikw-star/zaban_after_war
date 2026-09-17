// Every Persian string in apps/web lives here and nowhere else (what.md §17.5).
// Components reference keys; they never hold a literal.

// Vite replaces `import.meta.env` at build time. `vite.config.ts` imports this module while
// running under plain Node, where there is no `import.meta.env` at all — hence the cast and the
// optional chain, which keep the fallback name defined in exactly one place.
const env = import.meta.env as ImportMetaEnv | undefined;

/** Used until the owner settles the Persian name (what.md §19, product-brief Q41). */
export const DEFAULT_APP_NAME = 'کنکور لایتنر';

export const strings = {
  appName: env?.VITE_APP_NAME || DEFAULT_APP_NAME,
} as const;

export type Strings = typeof strings;
