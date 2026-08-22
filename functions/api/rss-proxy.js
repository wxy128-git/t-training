const RESPONSE_HEADERS = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'X-Content-Type-Options': 'nosniff'
};

// 资讯源必须在服务端显式登记。不要重新开放任意 URL，否则腾讯云主机可能被利用
// 访问 127.0.0.1、内网服务或云厂商元数据接口（SSRF）。
const RSS_FEEDS = Object.freeze({
    qbitai: 'https://www.qbitai.com/feed',
    verge: 'https://www.theverge.com/rss/index.xml',
    techcrunch: 'https://techcrunch.com/category/artificial-intelligence/feed/',
    edsurge: 'https://www.edsurge.com/articles_rss',
    mit: 'https://www.technologyreview.com/feed/',
    wired: 'https://www.wired.com/feed/tag/ai/latest/rss'
});
const LEGACY_FEED_ALIASES = Object.freeze({
    'https://www.jiqizhixin.com/rss': 'qbitai',
    'https://www.qbitai.com/rss': 'qbitai',
    'https://www.theverge.com/rss/ai-artificial-intelligence/rss.xml': 'verge',
    'https://edsurge.com/news.rss': 'edsurge'
});

const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_STALE_MS = 24 * 60 * 60 * 1000;
const MAX_FEED_BYTES = 1024 * 1024;
const feedCache = new Map();

function jsonResponse(status, data, extraHeaders = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...RESPONSE_HEADERS, ...extraHeaders }
    });
}

function selectedFeed(request) {
    const params = new URL(request.url).searchParams;
    const key = String(params.get('feed') || '').trim();
    if (key && RSS_FEEDS[key]) return { key, url: RSS_FEEDS[key] };

    // 兼容旧版前端，但只接受与白名单完全一致的 URL。
    const legacyUrl = String(params.get('url') || '').trim();
    const aliasKey = LEGACY_FEED_ALIASES[legacyUrl];
    if (aliasKey) return { key: aliasKey, url: RSS_FEEDS[aliasKey] };
    const legacyEntry = Object.entries(RSS_FEEDS).find(([, url]) => url === legacyUrl);
    return legacyEntry ? { key: legacyEntry[0], url: legacyEntry[1] } : null;
}

async function readLimitedText(response, maxBytes) {
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > maxBytes) throw new Error('资讯源响应过大');
    if (!response.body?.getReader) {
        const text = await response.text();
        if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error('资讯源响应过大');
        return text;
    }

    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
            await reader.cancel();
            throw new Error('资讯源响应过大');
        }
        chunks.push(value);
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return new TextDecoder().decode(merged);
}

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: RESPONSE_HEADERS });
}

export async function onRequestGet({ request }) {
    const feed = selectedFeed(request);
    if (!feed) {
        return jsonResponse(400, { ok: false, error: 'unsupported feed' }, { 'Cache-Control': 'no-store' });
    }

    const now = Date.now();
    const cached = feedCache.get(feed.key);
    if (cached && now - cached.savedAt < CACHE_TTL_MS) {
        return jsonResponse(200, { ok: true, feed: feed.key, contents: cached.contents }, {
            'Cache-Control': 'public, max-age=300, s-maxage=1800, stale-while-revalidate=86400',
            'X-Cache': 'HIT'
        });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
        const upstream = await fetch(feed.url, {
            signal: controller.signal,
            redirect: 'error',
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; AI-Teacher-News/1.0; +https://ai.teachailab.com)',
                'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml'
            }
        });
        if (!upstream.ok) throw new Error(`资讯源返回 HTTP ${upstream.status}`);
        const contents = await readLimitedText(upstream, MAX_FEED_BYTES);
        if (!/<(?:rss|feed)\b/i.test(contents.slice(0, 1000))) throw new Error('资讯源没有返回 RSS 或 Atom');
        feedCache.set(feed.key, { contents, savedAt: now });
        return jsonResponse(200, { ok: true, feed: feed.key, contents }, {
            'Cache-Control': 'public, max-age=300, s-maxage=1800, stale-while-revalidate=86400',
            'X-Cache': 'MISS'
        });
    } catch(error) {
        if (cached && now - cached.savedAt < CACHE_STALE_MS) {
            return jsonResponse(200, { ok: true, feed: feed.key, contents: cached.contents, stale: true }, {
                'Cache-Control': 'public, max-age=60',
                'Warning': '110 - "Response is stale"',
                'X-Cache': 'STALE'
            });
        }
        const timedOut = error?.name === 'AbortError';
        return jsonResponse(timedOut ? 504 : 502, {
            ok: false,
            error: timedOut ? 'feed timeout' : 'feed unavailable'
        }, { 'Cache-Control': 'no-store' });
    } finally {
        clearTimeout(timer);
    }
}
