import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };
import { DEFAULT_APP_NAME } from './src/strings.ts';

/** The repo root: one .env / .env.local for all three apps (what.md §18). */
const envDir = fileURLToPath(new URL('../../', import.meta.url));

function buildSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, 'VITE_');
  const appName = env.VITE_APP_NAME || DEFAULT_APP_NAME;

  return {
    envDir,
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __BUILD_SHA__: JSON.stringify(buildSha()),
    },
    server: { port: 5173, strictPort: true },
    preview: { port: 4173, strictPort: true },
    build: {
      // Uploaded per build sha at deploy time so a production stack symbolicates (§14.4).
      sourcemap: true,
    },
    plugins: [
      {
        // Vite only substitutes %VITE_*% for variables that are actually set; the app
        // name has a fallback, so the substitution is done here instead.
        name: 'kl-html-app-name',
        transformIndexHtml: {
          order: 'pre' as const,
          handler: (html: string) => html.replaceAll('%VITE_APP_NAME%', appName),
        },
      },
      react(),
      tailwindcss(),
      VitePWA({
        // A new version never lands mid-session: the app offers it and the user taps (§7.7).
        registerType: 'prompt',
        includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'],
        manifest: {
          name: appName,
          short_name: appName,
          description: appName,
          dir: 'rtl',
          lang: 'fa',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          background_color: '#fafafa',
          theme_color: '#fafafa',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            {
              src: '/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          navigateFallback: '/index.html',
          // /api/* is network-only: the app has its own database and never caches a response
          // from the server (§7.7). No runtimeCaching entry exists, by design.
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [],
          // The free package is precached so the first launch works offline (§7.7); the paid
          // package never lives in this build - it is downloaded into IndexedDB after purchase.
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}', 'content/free.json'],
        },
        devOptions: { enabled: false },
      }),
    ],
  };
});
