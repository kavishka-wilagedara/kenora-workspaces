import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      port: 5173,
      // In dev the browser talks to Vite only; /api is forwarded to the backend (no CORS needed).
      proxy: { '/api': env.VITE_PROXY_TARGET || 'http://localhost:4000' },
    },
  };
});
