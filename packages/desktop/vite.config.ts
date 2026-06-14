import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: '.',
  base: './',
  build: {
    outDir: 'dist-renderer',
    rollupOptions: {
      input: {
        activate: path.resolve(__dirname, 'activate.html'),
      },
    },
  },
});
