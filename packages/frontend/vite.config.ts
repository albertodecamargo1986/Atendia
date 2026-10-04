import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Em desenvolvimento, o Vite encaminha para o backend (porta 3001) apenas os
// caminhos do contrato: /api, /socket.io, /uploads e /health (sem remover prefixo).
const BACKEND = process.env.VITE_DEV_BACKEND || 'http://localhost:3001';

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('axios')) return 'axios';
            return 'vendor';
          }
        },
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: BACKEND, changeOrigin: true },
      '/socket.io': { target: BACKEND, changeOrigin: true, ws: true },
      '/uploads': { target: BACKEND, changeOrigin: true },
      '/health': { target: BACKEND, changeOrigin: true },
    },
  },
});
