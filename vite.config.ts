import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build works on GitHub Pages under any repo name (e.g. /gardens/).
export default defineConfig({
  base: './',
  plugins: [react()],
  test: { environment: 'jsdom' },
} as any);
