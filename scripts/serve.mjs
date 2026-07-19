#!/usr/bin/env node

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const valueAfter = (flag, fallback) => {
    const index = args.indexOf(flag);
    return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const host = valueAfter('--host', '127.0.0.1');
const port = Number(valueAfter('--port', '8765'));
const types = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.mp4': 'video/mp4', '.m4v': 'video/x-m4v', '.mp3': 'audio/mpeg',
    '.webmanifest': 'application/manifest+json'
};

function resolveRequest(pathname) {
    let decoded;
    try { decoded = decodeURIComponent(pathname); } catch { return null; }
    const safePath = normalize(decoded).replace(/^(?:\.\.(?:\/|\\|$))+/, '');
    const direct = join(root, safePath);
    const candidates = decoded === '/'
        ? [join(root, 'index.html')]
        : [direct, `${direct}.html`, join(direct, 'index.html')];
    return candidates.find(path => path.startsWith(root) && existsSync(path) && statSync(path).isFile()) || null;
}

const server = createServer((request, response) => {
    const url = new URL(request.url || '/', `http://${request.headers.host || `${host}:${port}`}`);
    if (url.pathname.startsWith('/api/')) {
        response.writeHead(501, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ ok: false, message: '本地静态预览不模拟 Cloudflare Pages Functions。' }));
        return;
    }
    const file = resolveRequest(url.pathname);
    if (!file) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end('404 · 页面不存在');
        return;
    }
    response.writeHead(200, {
        'Content-Type': types[extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': statSync(file).size,
        'Cache-Control': 'no-store'
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(file).pipe(response);
});

server.listen(port, host, () => {
    console.log(`本地预览：http://${host}:${port}`);
    console.log('支持 /agents 等无后缀路由；按 Ctrl+C 停止。');
});
