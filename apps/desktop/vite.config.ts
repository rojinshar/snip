import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

// The app's windows: Settings (index.html) and the first-run window (welcome.html). Tauri
// loads the dev server in `tauri dev` and `dist/` in builds.
export default defineConfig({
  root: 'ui',
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'safari16',
    rollupOptions: {
      input: {
        settings: fileURLToPath(new URL('ui/index.html', import.meta.url)),
        welcome: fileURLToPath(new URL('ui/welcome.html', import.meta.url)),
      },
    },
  },
});
