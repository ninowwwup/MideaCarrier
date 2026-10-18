import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, Plugin } from 'vite';

import handler, { registerSSEClient } from './api/transfers';

function apiTransfersPlugin(): Plugin {
  return {
    name: 'api-transfers-plugin',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res, next) => {
        const url = req.url || '';
        if (url === '/events' || url.startsWith('/events') || (req as any).originalUrl?.includes('/api/events')) {
          try {
            registerSSEClient(req as any, res as any);
          } catch (err) {
            console.error('Erro na rota /api/events:', err);
          }
          return;
        }

        try {
          await handler(req as any, res as any);
        } catch (err) {
          console.error('Erro na rota /api:', err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(err) }));
          }
        }
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), apiTransfersPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
