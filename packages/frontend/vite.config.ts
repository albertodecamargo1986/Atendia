import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/auth': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/agents': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/conversations': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/knowledge': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/whatsapp': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/tickets': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/queues': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/contacts': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/quick-replies': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/tags': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/media': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/ratings': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/internal-chat': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/campaigns': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/webhooks': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/reports': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/voice-profiles': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/settings': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/users': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/business-hours': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/2fa': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/license': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/payments': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/download': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/ready': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
