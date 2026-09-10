import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { route } from '../lib/share-api.ts';
import { storage } from './storage.mjs';
const port = Number(process.env.PORT || 8787),
  origin = new URL(process.env.PUBLIC_ORIGIN || 'http://localhost:' + port);
if (origin.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))
  throw Error('PUBLIC_ORIGIN requires HTTPS outside localhost');
const store = await storage(path.resolve(process.env.DATA_DIR || 'data'));
const environment = { ...store, REGISTRATION_CODE: store.invitation };
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, origin);
    if (url.origin !== origin.origin) {
      res.writeHead(400).end();
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers))
        if (v && !['host', 'cf-connecting-ip'].includes(k))
          headers.set(k, Array.isArray(v) ? v.join(',') : v);
      // Trust forwarded addresses only behind the supplied private reverse-proxy network.
      headers.set(
        'cf-connecting-ip',
        process.env.TRUST_PROXY === '1'
          ? req.headers['x-forwarded-for']?.split(',').at(-1)?.trim() || req.socket.remoteAddress
          : req.socket.remoteAddress,
      );
      let total = 0;
      const body = [];
      for await (const chunk of req) {
        total += chunk.length;
        if (total > 1500000) {
          res.writeHead(413).end();
          return;
        }
        body.push(chunk);
      }
      const response = await route(
        new Request(url, {
          method: req.method,
          headers,
          ...(['GET', 'HEAD'].includes(req.method) ? {} : { body: Buffer.concat(body) }),
        }),
        environment,
      );
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) Readable.fromWeb(response.body).pipe(res);
      else res.end();
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405).end();
      return;
    }
    const publicRoot = path.resolve('dist-standalone');
    const name = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).slice(1);
    const file = path.resolve(publicRoot, name);
    if (!file.startsWith(publicRoot + path.sep)) {
      res.writeHead(404).end();
      return;
    }
    let bytes;
    try {
      bytes = await fs.readFile(file);
    } catch {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
    });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch {
    res.writeHead(503, { 'Cache-Control': 'no-store' }).end('Service indisponible');
  }
});
await store.clean();
const timer = setInterval(
  () => store.clean().catch(() => console.error('Retention cleanup failed')),
  3600000,
);
timer.unref();
server.listen(port, process.env.HOST || '127.0.0.1', () =>
  console.log('FocusReplay: ' + origin.origin + ' | Invitation: ' + store.invitation),
);
process.on('SIGTERM', () =>
  server.close(() => {
    clearInterval(timer);
    store.close();
    process.exit(0);
  }),
);
