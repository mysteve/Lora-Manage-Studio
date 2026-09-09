import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  plugins: [react()],
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['src-tauri', '.test-data', '.setup', 'release', 'app'].map(
        (directory) => `${fileURLToPath(new URL(`./${directory}`, import.meta.url)).replace(/\\/g, '/')}/**`,
      ),
    },
  },
  clearScreen: false,
});
