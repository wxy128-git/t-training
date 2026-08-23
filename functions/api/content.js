const FIREBASE_PROJECT_ID = 'xylaoshi-28f6c';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
const CONTENT_TYPES = {
    announcements: 'announcements',
    articles: 'articles',
    paths: 'paths',
    prompts: 'prompts',
    resources: 'resource_categories',
    pageCopy: 'page_copy'
};
const PAGE_COPY_IDS = new Set([
    'home', 'multimodal', 'agents', 'classroom', 'tools', 'resources',
    'news', 'paths', 'articles', 'article', 'prompts', 'workspace'
]);
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_STALE_MS = 60 * 60 * 1000;
const contentCache = new Map();

const RESPONSE_HEADERS = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=120, s-maxage=600, stale-while-revalidate=1800',
    'X-Content-Type-Options': 'nosniff'
};

function jsonResponse(status, body, headers = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...RESPONSE_HEADERS, ...headers }
    });
}

function cachedJson(cached, state = 'HIT') {
    return jsonResponse(200, cached.body, {
        'X-Cache': state,
        ...(state === 'STALE' ? {
            'Cache-Control': 'public, max-age=60',
            'Warning': '110 - "Response is stale"'
        } : {})
    });
}

function decodeValue(value) {
    if (!value || typeof value !== 'object') return null;
    if ('nullValue' in value) return null;
    if ('stringValue' in value) return value.stringValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return Number(value.doubleValue);
    if ('booleanValue' in value) return Boolean(value.booleanValue);
    if ('timestampValue' in value) return value.timestampValue;
    if ('arrayValue' in value) return (value.arrayValue?.values || []).map(decodeValue);
    if ('mapValue' in value) return decodeFields(value.mapValue?.fields || {});
    return null;
}

function decodeFields(fields) {
    return Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key, decodeValue(value)]));
}

function decodeDocument(document) {
    const id = String(document?.name || '').split('/').pop() || '';
    if (!id) return null;
    return { id, ...decodeFields(document.fields || {}) };
}

function sortItems(type, items) {
    if (['paths', 'prompts', 'resources'].includes(type)) {
        return items.sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    }
    if (type === 'articles') {
        return items
            .filter(item => item.status === 'published')
            .sort((a, b) => new Date(b.publishedAt || b.createdAt || 0) - new Date(a.publishedAt || a.createdAt || 0));
    }
    if (type === 'announcements') {
        return items.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }
    return items;
}

export async function onRequestGet({ request }) {
    const requestUrl = new URL(request.url);
    const type = requestUrl.searchParams.get('type') || '';
    const collection = CONTENT_TYPES[type];
    if (!collection) return jsonResponse(400, { ok: false, msg: '不支持的内容类型' }, { 'Cache-Control': 'no-store' });

    const id = requestUrl.searchParams.get('id') || '';
    if (type === 'pageCopy' && !PAGE_COPY_IDS.has(id)) {
        return jsonResponse(400, { ok: false, msg: '页面编号无效' }, { 'Cache-Control': 'no-store' });
    }
    if (id && type !== 'pageCopy' && (type !== 'articles' || !/^[^/]{1,180}$/.test(id))) {
        return jsonResponse(400, { ok: false, msg: '内容编号无效' }, { 'Cache-Control': 'no-store' });
    }

    const cacheKey = `${type}:${id || 'list'}`;
    const now = Date.now();
    const volatileHeaders = type === 'pageCopy' ? { 'Cache-Control': 'no-store' } : {};
    const cached = type === 'pageCopy' ? null : contentCache.get(cacheKey);
    if (cached && now - cached.savedAt < CACHE_TTL_MS) return cachedJson(cached);

    const upstreamUrl = id
        ? `${FIRESTORE_BASE}/${collection}/${encodeURIComponent(id)}`
        : `${FIRESTORE_BASE}/${collection}?pageSize=100`;
    const publishedArticleQuery = !id && type === 'articles';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
        const upstream = await fetch(publishedArticleQuery ? `${FIRESTORE_BASE}:runQuery` : upstreamUrl, {
            method: publishedArticleQuery ? 'POST' : 'GET',
            signal: controller.signal,
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: publishedArticleQuery ? JSON.stringify({
                structuredQuery: {
                    from: [{ collectionId: collection }],
                    where: {
                        fieldFilter: {
                            field: { fieldPath: 'status' },
                            op: 'EQUAL',
                            value: { stringValue: 'published' }
                        }
                    },
                    limit: 100
                }
            }) : undefined
        });
        const data = await upstream.json().catch(() => ({}));
        if (upstream.status === 404) return jsonResponse(404, { ok: false, msg: '内容不存在' }, volatileHeaders);
        if (id && upstream.status === 403) return jsonResponse(404, { ok: false, msg: '内容不存在' }, volatileHeaders);
        if (!upstream.ok) {
            if (cached && now - cached.savedAt < CACHE_STALE_MS) return cachedJson(cached, 'STALE');
            return jsonResponse(502, { ok: false, msg: '暂时无法同步内容' }, volatileHeaders);
        }

        if (id) {
            const item = decodeDocument(data);
            if (!item || (type === 'articles' && item.status !== 'published')) return jsonResponse(404, { ok: false, msg: '内容不存在' }, volatileHeaders);
            const body = { ok: true, type, item };
            if (type !== 'pageCopy') contentCache.set(cacheKey, { body, savedAt: now });
            return jsonResponse(200, body, type === 'pageCopy'
                ? { 'Cache-Control': 'no-store', 'X-Cache': 'BYPASS' }
                : { 'X-Cache': 'MISS' });
        }

        const documents = publishedArticleQuery ? data.map(row => row.document).filter(Boolean) : (data.documents || []);
        const items = sortItems(type, documents.map(decodeDocument).filter(Boolean));
        const body = { ok: true, type, count: items.length, items };
        contentCache.set(cacheKey, { body, savedAt: now });
        return jsonResponse(200, body, { 'X-Cache': 'MISS' });
    } catch(error) {
        if (cached && now - cached.savedAt < CACHE_STALE_MS) return cachedJson(cached, 'STALE');
        return jsonResponse(error?.name === 'AbortError' ? 504 : 502, {
            ok: false,
            msg: error?.name === 'AbortError' ? '同步内容超时' : '暂时无法同步内容'
        }, volatileHeaders);
    } finally {
        clearTimeout(timer);
    }
}
