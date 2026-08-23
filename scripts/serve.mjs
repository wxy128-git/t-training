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
const localApiModules = new Map([
    ['/api/auth-proxy', '../functions/api/auth-proxy.js'],
    ['/api/content', '../functions/api/content.js'],
    ['/api/tools', '../functions/api/tools.js'],
    ['/api/rss-proxy', '../functions/api/rss-proxy.js']
]);
const localApiCache = new Map();

async function readRequestBody(request) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) throw Object.assign(new Error('请求内容过大'), { statusCode: 413 });
        chunks.push(chunk);
    }
    return chunks.length ? Buffer.concat(chunks) : undefined;
}

async function getLocalApiModule(pathname) {
    if (localApiCache.has(pathname)) return localApiCache.get(pathname);
    const modulePath = localApiModules.get(pathname);
    if (!modulePath) return null;
    const loaded = await import(new URL(modulePath, import.meta.url));
    localApiCache.set(pathname, loaded);
    return loaded;
}

async function handleLocalApi(request, response, url) {
    const apiModule = await getLocalApiModule(url.pathname);
    if (!apiModule) {
        response.writeHead(501, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ ok: false, msg: '该接口未在本地预览中启用。' }));
        return;
    }
    const method = String(request.method || 'GET').toUpperCase();
    const exportName = `onRequest${method[0]}${method.slice(1).toLowerCase()}`;
    const handler = apiModule[exportName];
    if (typeof handler !== 'function') {
        response.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ ok: false, msg: '本地预览不支持该请求方法。' }));
        return;
    }
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
        if (Array.isArray(value)) value.forEach(item => headers.append(name, item));
        else if (value != null) headers.set(name, value);
    }
    const body = ['GET', 'HEAD'].includes(method) ? undefined : await readRequestBody(request);
    const webRequest = new Request(url, { method, headers, body });
    const webResponse = await handler({ request: webRequest, env: process.env });
    const responseHeaders = Object.fromEntries(webResponse.headers.entries());
    response.writeHead(webResponse.status, responseHeaders);
    if (method === 'HEAD') response.end();
    else response.end(Buffer.from(await webResponse.arrayBuffer()));
}

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

const server = createServer(async (request, response) => {
    const url = new URL(request.url || '/', `http://${request.headers.host || `${host}:${port}`}`);
    if (url.pathname.startsWith('/api/')) {
        try {
            await handleLocalApi(request, response, url);
        } catch (error) {
            const status = Number(error?.statusCode) || 500;
            response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
            response.end(JSON.stringify({ ok: false, msg: status === 413 ? error.message : '本地接口运行失败。' }));
            console.error('localApi:', error);
        }
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
