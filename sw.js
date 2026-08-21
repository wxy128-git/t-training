'use strict';

const VERSION = '20260821-v7';
const CACHE_PREFIX = 'xylaoshi-pwa-';
const STATIC_CACHE = `${CACHE_PREFIX}static-${VERSION}`;
const PAGE_CACHE = `${CACHE_PREFIX}pages-${VERSION}`;
const OFFLINE_URL = '/offline.html';
const CORE_ASSETS = [
    OFFLINE_URL,
    '/',
    '/agents',
    '/classroom-tools',
    '/css/style.css',
    '/css/pwa.css',
    '/js/pwa.js',
    '/manifest.webmanifest',
    '/js/safe-render.js',
    '/js/agents-data.js',
    '/js/teaching-projects.js',
    '/assets/favicon.svg',
    '/assets/pwa/icon-192.png',
    '/assets/pwa/icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE).then((cache) => cache.addAll(
            CORE_ASSETS.map((url) => new Request(url, { cache: 'reload' }))
        ))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys
                .filter((key) => key.startsWith(CACHE_PREFIX) && ![STATIC_CACHE, PAGE_CACHE].includes(key))
                .map((key) => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isSensitiveRequest(request, url) {
    return request.method !== 'GET'
        || request.headers.has('authorization')
        || request.headers.has('range')
        || url.pathname.startsWith('/api/')
        || url.pathname === '/admin.html'
        || url.pathname === '/admin'
        || url.pathname.startsWith('/functions/')
        || ['video', 'audio'].includes(request.destination);
}

function isCacheableResponse(response) {
    if (!response || !response.ok || response.type !== 'basic') return false;
    const cacheControl = response.headers.get('Cache-Control') || '';
    return !/no-store|private/i.test(cacheControl);
}

async function putInCache(cacheName, request, response) {
    if (!isCacheableResponse(response)) return;
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
    const maxEntries = cacheName === PAGE_CACHE ? 24 : 80;
    const keys = await cache.keys();
    if (keys.length > maxEntries) {
        await Promise.all(keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key)));
    }
}

function fetchWithTimeout(request, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timeout));
}

async function networkFirstPage(request) {
    try {
        const response = await fetchWithTimeout(request, 5000);
        await putInCache(PAGE_CACHE, request, response);
        return response;
    } catch (_) {
        const cached = await caches.match(request, { ignoreSearch: true });
        return cached || caches.match(OFFLINE_URL);
    }
}

async function staleWhileRevalidate(request) {
    const cached = await caches.match(request);
    const network = fetch(request).then(async (response) => {
        await putInCache(STATIC_CACHE, request, response);
        return response;
    });
    if (cached) {
        network.catch(() => {});
        return cached;
    }
    try {
        return await network;
    } catch (error) {
        const unversionedFallback = await caches.match(new URL(request.url).pathname);
        if (unversionedFallback) return unversionedFallback;
        throw error;
    }
}

self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    if (url.origin !== self.location.origin || isSensitiveRequest(request, url)) return;

    if (request.mode === 'navigate') {
        event.respondWith(networkFirstPage(request));
        return;
    }

    const isAppStatic = ['style', 'script', 'font'].includes(request.destination)
        || (request.destination === 'image' && url.pathname.startsWith('/assets/'));
    if (isAppStatic) event.respondWith(staleWhileRevalidate(request));
});
