/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** Build-time constants injected by `define` in vite.config.ts. */
declare const __APP_VERSION__: string;
declare const __BUILD_SHA__: string;

interface ImportMetaEnv {
  /** The Persian product name; see .env.example and what.md §18. */
  readonly VITE_APP_NAME?: string;
  /** Origin of the PocketBase API, e.g. https://app.konkurleitner.com. */
  readonly VITE_API_ORIGIN?: string;
  /** Telegram support link shown in settings and on the landing page. */
  readonly VITE_SUPPORT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
