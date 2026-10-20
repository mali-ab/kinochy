import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// The admin SPA is always served same-origin with the API:
// - dev: this Vite server proxies /api and /media to the backend,
// - production: nginx serves the build at / and routes /api and
//   /media to the ASP.NET app, so relative requests just work.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiOrigin = process.env.VITE_API_ORIGIN || env.VITE_API_ORIGIN || 'http://localhost:5000';
  const base = process.env.APP_BASE_PATH || env.APP_BASE_PATH || '/';

  return {
    base,
    plugins: [react()],
    server: {
      host: true,
      port: 5174,
      proxy: {
        '/api': { target: apiOrigin, changeOrigin: true },
        '/media': { target: apiOrigin, changeOrigin: true }
      }
    }
  };
});
