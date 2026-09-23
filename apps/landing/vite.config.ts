import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

/** One .env / .env.local at the repo root serves all three apps (what.md §18). */
const envDir = fileURLToPath(new URL('../../', import.meta.url));

/** Kept in step with apps/web/src/strings.ts; the owner has not settled the name (§19). */
const DEFAULT_APP_NAME = 'کنکور لایتنر';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, 'VITE_');
  const appName = env.VITE_APP_NAME || DEFAULT_APP_NAME;

  return {
    envDir,
    server: { port: 5174, strictPort: true },
    preview: { port: 4174, strictPort: true },
    build: { sourcemap: true },
    plugins: [
      {
        name: 'kl-html-app-name',
        transformIndexHtml: {
          order: 'pre' as const,
          handler: (html: string) => html.replaceAll('%VITE_APP_NAME%', appName),
        },
      },
    ],
  };
});
