import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import vercel from 'vite-plugin-vercel';

export default defineConfig({
  plugins: [react(), vercel()],
  server: {
    port: 5000,
    // Proxy removed - Vercel handles /api routes natively via serverless functions
  },
  vercel: {
    // Handle SPA routing - rewrite all routes to index.html
    rewrites: [
      {
        source: '/(.*)',
        destination: '/index.html',
      },
    ],
  },
});
