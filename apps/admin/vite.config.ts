import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** One .env / .env.local at the repo root serves all three apps (what.md §18). */
const envDir = fileURLToPath(new URL('../../', import.meta.url));

export default defineConfig({
  envDir,
  server: { port: 5175, strictPort: true },
  preview: { port: 4175, strictPort: true },
  build: { sourcemap: true },
  plugins: [react()],
});
