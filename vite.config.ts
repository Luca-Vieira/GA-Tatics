/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const fromSrc = (path: string) => fileURLToPath(new URL(`./src/${path}`, import.meta.url));
const fromRoot = (path: string) => fileURLToPath(new URL(`./${path}`, import.meta.url));

/** `/admin` (sem a barra final) abre o painel de administração (admin/index.html), no servidor de desenvolvimento e no `preview`. */
function adminRoute(): Plugin {
  const redirect = (request: { url?: string }, _response: unknown, next: () => void) => {
    if (request.url === '/admin') {
      request.url = '/admin/';
    }
    next();
  };
  return {
    name: 'admin-route',
    configureServer: (server) => void server.middlewares.use(redirect),
    configurePreviewServer: (server) => void server.middlewares.use(redirect),
  };
}

export default defineConfig({
  plugins: [adminRoute()],
  resolve: {
    alias: {
      '@core': fromSrc('core'),
      '@combat': fromSrc('combat'),
      '@rendering': fromSrc('rendering'),
      '@multiplayer': fromSrc('multiplayer'),
      '@admin': fromSrc('admin'),
      '@data': fromSrc('data'),
      '@shared': fromSrc('shared'),
    },
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      // Duas páginas: o jogo e o painel de administração.
      input: { main: fromRoot('index.html'), admin: fromRoot('admin/index.html') },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
