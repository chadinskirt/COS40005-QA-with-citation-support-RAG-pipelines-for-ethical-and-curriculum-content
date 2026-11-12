import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// /api goes to BACKEND_URL (.env) in both dev and preview.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxy = { '/api': { target: env.BACKEND_URL || 'http://localhost:8000', changeOrigin: true } };
  return {
    plugins: [react()],
    server: { port: 5173, proxy },
    preview: { port: 4173, proxy },
    test: { environment: 'jsdom', setupFiles: './src/test/setup.js', env: { VITE_USE_MOCK: 'true' } },
  };
});
