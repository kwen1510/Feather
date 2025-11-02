import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5000,
    // Proxy removed - Vercel handles /api routes natively via serverless functions
  },
});
