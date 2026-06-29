import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Forward /auth, /api, /csrf-mint, /docs, /openapi.json to auth-service.
      '^/(auth|api|csrf-mint|docs|openapi.json|health|ready)$': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        ws: false,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
