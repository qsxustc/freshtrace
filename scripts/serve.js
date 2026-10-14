#!/usr/bin/env node
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.http': 'text/plain; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff',
};
const PUBLIC_FILES = new Set(['index.html', 'styles.css', 'icon.svg', 'README.md', 'README.zh-CN.md', 'src/cache.js', 'src/report.js', 'src/app.js', 'src/presets.js', 'src/scenario.js', 'src/timeline.js']);

try {
  const requestedPort = parsePort(process.argv.slice(2));
  if (requestedPort === null) {
    process.stdout.write('Usage: node scripts/serve.js [--port <1-65535>]\n\nServes FreshTrace on 127.0.0.1 only. Default port: 4174. Busy ports fall back to the next available port.\n');
  } else {
    const server = http.createServer((request, response) => {
      handleRequest(request, response).catch(error => {
        if (response.headersSent) response.destroy(error);
        else sendError(response, error.code === 'ENOENT' ? 404 : 500, error.code === 'ENOENT' ? 'Not found' : 'Unable to read file');
      });
    });
    const port = await listen(server, requestedPort);
    process.stdout.write(`FreshTrace is ready at http://127.0.0.1:${port}\nPress Ctrl+C to stop.\n`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
  }
} catch (error) {
  process.stderr.write(`freshtrace server: ${error.message}\n`);
  process.exitCode = 1;
}

async function handleRequest(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    return sendError(response, 405, 'Method not allowed');
  }
  let pathname;
  try { pathname = decodeURIComponent((request.url || '/').split('?')[0]); }
  catch { return sendError(response, 400, 'Malformed URL'); }
  if (!pathname.startsWith('/') || pathname.includes('\\') || pathname.includes('\0')) return sendError(response, 400, 'Invalid path');
  const segments = pathname.split('/').filter(Boolean);
  if (segments.some(segment => segment.startsWith('.'))) return sendError(response, 404, 'Not found');
  const relative = segments.length === 0 ? 'index.html' : segments.join('/');
  if (!isPublic(relative)) return sendError(response, 404, 'Not found');
  const requestedFile = path.join(ROOT, relative);
  const resolved = await realpath(requestedFile);
  if (!resolved.startsWith(`${ROOT}${path.sep}`) || resolved !== requestedFile) return sendError(response, 404, 'Not found');
  const info = await stat(resolved);
  if (!info.isFile()) return sendError(response, 404, 'Not found');
  response.writeHead(200, {
    'Content-Type': MIME[path.extname(relative).toLowerCase()] || 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  if (request.method === 'HEAD') return response.end();
  const stream = createReadStream(resolved);
  stream.on('error', error => response.destroy(error));
  response.on('close', () => stream.destroy());
  stream.pipe(response);
}

function isPublic(relative) {
  if (PUBLIC_FILES.has(relative)) return true;
  if (relative.startsWith('samples/')) return /\.(json|txt|http)$/.test(relative);
  if (relative.startsWith('assets/') || relative.startsWith('docs/images/')) return /\.(svg|png|jpe?g|webp|gif|ico|woff2?|json)$/.test(relative);
  return false;
}

function sendError(response, status, message) {
  const body = `${message}\n`;
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'X-Content-Type-Options': 'nosniff' });
  response.end(body);
}

function parsePort(args) {
  if (args.length === 1 && args[0] === '--help') return null;
  let value = process.env.PORT || '4174';
  if (args.length) {
    if (args.length !== 2 || args[0] !== '--port') throw new Error('Use --port <1-65535> to select a port.');
    value = args[1];
  }
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) throw new Error('Port must be an integer from 1 to 65535.');
  return Number(value);
}

async function listen(server, startingPort) {
  for (let port = startingPort; port <= Math.min(startingPort + 30, 65535); port++) {
    try {
      await new Promise((resolve, reject) => {
        const onError = error => { server.off('listening', onListening); reject(error); };
        const onListening = () => { server.off('error', onError); resolve(); };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, '127.0.0.1');
      });
      return port;
    } catch (error) { if (error.code !== 'EADDRINUSE') throw error; }
  }
  throw new Error('No free port found in the next 30 ports.');
}
