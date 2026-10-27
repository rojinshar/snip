import { defineConfig } from 'vite';

// The settings window's web UI. Tauri loads the dev server in `tauri dev` and `dist/` in builds.
export default defineConfig({
  root: 'ui',
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { outDir: '../dist', emptyOutDir: true, target: 'safari16' },
});
