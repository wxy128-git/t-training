#!/usr/bin/env node

import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';

import * as adminUsers from '../functions/api/admin-users.js';
import * as agent from '../functions/api/agent.js';
import * as analytics from '../functions/api/analytics.js';
import * as authProxy from '../functions/api/auth-proxy.js';
import * as content from '../functions/api/content.js';
import * as rssProxy from '../functions/api/rss-proxy.js';
import * as tools from '../functions/api/tools.js';
import * as works from '../functions/api/works.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3001;
const DEFAULT_ORIGIN = 'https://ai.teachailab.com';
const MAX_BACKGROUND_TASKS = 1000;

const ROUTES = new Map([
    ['/api/admin-users', adminUsers],
    ['/api/agent', agent],
    ['/api/analytics', analytics],
    ['/api/auth-proxy', authProxy],
    ['/api/content', content],
    ['/api/rss-proxy', rssProxy],
    ['/api/tools', tools],
    ['/api/works', works]
]);

function jsonResponse(status, body) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff'
        }
    });
}

function requestPath(requestUrl) {
    const pathname = new URL(requestUrl, DEFAULT_ORIGIN).pathname;
    return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

function clientIp(request) {
    const forwarded = String(request.headers['x-forwarded-for'] || '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
    return forwarded.at(-1) || request.socket.remoteAddress || 'unknown';
}

function toWebRequest(request, publicOrigin) {
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
        if (Array.isArray(value)) value.forEach(item => headers.append(key, item));
        else if (value !== undefined) headers.set(key, value);
    }
    headers.set('CF-Connecting-IP', clientIp(request));

    const controller = new AbortController();
    request.once('aborted', () => controller.abort());
    const init = {
        method: request.method || 'GET',
        headers,
        signal: controller.signal
    };
    if (!['GET', 'HEAD'].includes(init.method)) {
        init.body = Readable.toWeb(request);
        init.duplex = 'half';
    }
    return new Request(new URL(request.url || '/', publicOrigin), init);
}

function sendWebResponse(nodeResponse, webResponse, requestMethod) {
    nodeResponse.statusCode = webResponse.status;
    nodeResponse.statusMessage = webResponse.statusText;
    for (const [key, value] of webResponse.headers) nodeResponse.setHeader(key, value);

    if (requestMethod === 'HEAD' || !webResponse.body) {
        nodeResponse.end();
        return;
    }

    const body = Readable.fromWeb(webResponse.body);
    body.on('error', error => {
        console.error('[t-training-api] response stream failed:', error.message);
        if (!nodeResponse.headersSent) nodeResponse.writeHead(502);
        nodeResponse.end();
    });
    body.pipe(nodeResponse);
}

export function createApiServer(options = {}) {
    const env = options.env || process.env;
    const publicOrigin = options.publicOrigin || env.PUBLIC_ORIGIN || DEFAULT_ORIGIN;
    const backgroundTasks = new Set();

    const waitUntil = promise => {
        if (backgroundTasks.size >= MAX_BACKGROUND_TASKS) {
            console.error('[t-training-api] too many background tasks');
            return;
        }
        const task = Promise.resolve(promise)
            .catch(error => console.error('[t-training-api] background task failed:', error.message))
            .finally(() => backgroundTasks.delete(task));
        backgroundTasks.add(task);
    };

    const server = createServer(async (request, response) => {
        try {
            const path = requestPath(request.url || '/');
            if (path === '/healthz') {
                sendWebResponse(response, jsonResponse(200, {
                    ok: true,
                    service: 't-training-api',
                    uptimeSeconds: Math.round(process.uptime())
                }), request.method);
                return;
            }

            const route = ROUTES.get(path);
            if (!route) {
                sendWebResponse(response, jsonResponse(404, { ok: false, msg: '接口不存在' }), request.method);
                return;
            }

            const method = String(request.method || 'GET').toLowerCase();
            const handlerName = `onRequest${method.charAt(0).toUpperCase()}${method.slice(1)}`;
            const handler = route[handlerName];
            if (typeof handler !== 'function') {
                const allowed = Object.keys(route)
                    .filter(name => /^onRequest[A-Z]/.test(name))
                    .map(name => name.slice('onRequest'.length).toUpperCase())
                    .join(', ');
                const result = jsonResponse(405, { ok: false, msg: '请求方法不支持' });
                result.headers.set('Allow', allowed);
                sendWebResponse(response, result, request.method);
                return;
            }

            const webRequest = toWebRequest(request, publicOrigin);
            const result = await handler({ request: webRequest, env, waitUntil });
            if (!(result instanceof Response)) throw new Error(`${handlerName} did not return a Response`);
            sendWebResponse(response, result, request.method);
        } catch(error) {
            console.error('[t-training-api] request failed:', error);
            if (!response.headersSent) {
                sendWebResponse(response, jsonResponse(500, { ok: false, msg: '服务器暂时不可用' }), request.method);
            } else {
                response.end();
            }
        }
    });

    server.requestTimeout = 5 * 60 * 1000;
    server.headersTimeout = 30 * 1000;
    server.keepAliveTimeout = 65 * 1000;
    server.backgroundTasks = backgroundTasks;
    return server;
}

export async function startApiServer(options = {}) {
    const env = options.env || process.env;
    const host = options.host || env.HOST || DEFAULT_HOST;
    const port = Number(options.port ?? env.PORT ?? DEFAULT_PORT);
    const server = createApiServer({ ...options, env });
    await new Promise((resolveListen, rejectListen) => {
        server.once('error', rejectListen);
        server.listen(port, host, resolveListen);
    });
    const address = server.address();
    console.log(`[t-training-api] listening on ${typeof address === 'object' ? `${address.address}:${address.port}` : address}`);
    return server;
}

function installShutdownHandlers(server) {
    let stopping = false;
    const stop = signal => {
        if (stopping) return;
        stopping = true;
        console.log(`[t-training-api] ${signal}, stopping gracefully`);
        server.close(() => process.exit(0));
        setTimeout(() => {
            server.closeAllConnections?.();
            process.exit(0);
        }, 15000).unref();
    };
    process.once('SIGTERM', () => stop('SIGTERM'));
    process.once('SIGINT', () => stop('SIGINT'));
}

const isMain = process.argv[1]
    && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
const shouldStart = isMain || process.env.T_TRAINING_AUTOSTART === '1';
if (shouldStart) {
    const server = await startApiServer();
    installShutdownHandlers(server);
}
