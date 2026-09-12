import { createRequire } from 'node:module';
import { createReadStream, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const root = import.meta.dirname;
const origin = 'http://127.0.0.1:5178';
const token = randomUUID();
mkdirSync(resolve(root, '.cache'), { recursive: true });
await build({ entryPoints: [resolve(root, 'scripts/preview-backend.cjs')], outfile: resolve(root, '.cache/preview-backend.cjs'), bundle: true, platform: 'node', format: 'cjs', packages: 'external', alias: { electron: resolve(root, 'scripts/preview-electron.cjs') } });
const backend = createRequire(import.meta.url)(resolve(root, '.cache/preview-backend.cjs'))(resolve(root, '.cache/browser-preview.sqlite'), origin);

export default defineConfig({
  resolve: { alias: { electron: resolve(root, 'src/renderer/preview/electron-browser.ts') } },
  define: { __MAX_PREVIEW_TOKEN__: JSON.stringify(token) },
  plugins: [react(), {
    name: 'max-local-preview',
    transformIndexHtml: (html) => html.replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/, '').replace('/src/renderer/main.tsx', '/src/renderer/preview/main.js'),
    configureServer(server) {
      server.httpServer?.once('close', () => backend.close());
      // The renderer rewrites `max://asset/x.png` to this path when it is
      // running in a browser rather than in Electron.
      server.middlewares.use('/__max/asset', (req, res) => {
        const name = (req.url ?? '').replace(/^\/+/, '').split('?')[0];
        if (!/^[0-9a-f]{64}\.(png|jpg|gif|webp)$/.test(name)) { res.statusCode = 404; res.end(); return; }
        createReadStream(resolve(backend.assetDirectory, name))
          .on('error', () => { res.statusCode = 404; res.end(); })
          .pipe(res);
      });
      server.middlewares.use('/__max/invoke', async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        if (req.method !== 'POST' || req.headers.origin !== origin || req.headers['x-max-preview'] !== token) { res.statusCode = 403; res.end('{}'); return; }
        try {
          let body = '';
          for await (const chunk of req) { body += chunk; if (body.length > 4_000_000) throw new Error('Request too large.'); }
          const { channel, args } = JSON.parse(body);
          if (typeof channel !== 'string' || !Array.isArray(args)) throw new Error('Invalid request.');
          res.end(JSON.stringify({ value: await backend.invoke(channel, args) }));
        } catch (error) { res.statusCode = 400; res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) })); }
      });
    },
  }],
  server: { host: '127.0.0.1', port: 5178, strictPort: true },
});
