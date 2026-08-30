import type { INestApplication } from '@nestjs/common';
import type { Express } from 'express';
import type { Server } from 'http';
import { createProxyMiddleware } from 'http-proxy-middleware';

const VITE_DEV_SERVER_URL = 'http://127.0.0.1:7853';

/**
 * Forwards every non-API request (including the Vite HMR WebSocket) to the
 * Vite dev server, so the browser only ever talks to the NestJS origin.
 */
export function attachViteDevProxy(app: INestApplication): void {
  const proxy = createProxyMiddleware({
    target: VITE_DEV_SERVER_URL,
    changeOrigin: true,
    ws: true,
    // Vite may still be starting when a request arrives; respond with a
    // clear 502 instead of letting the error crash the NestJS process.
    on: {
      error: (error, _req, res) => {
        console.error(`[vite-dev-proxy] ${error.message}`);
        if (res && 'writeHead' in res && !res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              message: 'Vite dev server is not reachable yet.',
            }),
          );
        }
      },
    },
    // Path-based glob matching (e.g. '**') ignores dotfile segments by
    // default, which would silently skip Vite's `.vite/deps/*` cache
    // requests. A predicate avoids that pitfall entirely.
    pathFilter: (pathname) => !pathname.startsWith('/api/'),
  });

  const expressApp = app.getHttpAdapter().getInstance() as Express;
  expressApp.use(proxy);

  const httpServer = app.getHttpServer() as Server;
  httpServer.on('upgrade', proxy.upgrade);
}
