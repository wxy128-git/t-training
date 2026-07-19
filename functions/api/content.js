const FIREBASE_PROJECT_ID = 'xylaoshi-28f6c';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
const CONTENT_TYPES = {
    announcements: 'announcements',
    articles: 'articles',
    paths: 'paths',
    prompts: 'prompts',
    resources: 'resource_categories'
};

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
    if (id && (type !== 'articles' || !/^[^/]{1,180}$/.test(id))) {
        return jsonResponse(400, { ok: false, msg: '内容编号无效' }, { 'Cache-Control': 'no-store' });
    }

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
        if (upstream.status === 404) return jsonResponse(404, { ok: false, msg: '内容不存在' });
        if (id && upstream.status === 403) return jsonResponse(404, { ok: false, msg: '内容不存在' });
        if (!upstream.ok) return jsonResponse(502, { ok: false, msg: '暂时无法同步内容' });

        if (id) {
            const item = decodeDocument(data);
            if (!item || item.status !== 'published') return jsonResponse(404, { ok: false, msg: '内容不存在' });
            return jsonResponse(200, { ok: true, type, item });
        }

        const documents = publishedArticleQuery ? data.map(row => row.document).filter(Boolean) : (data.documents || []);
        const items = sortItems(type, documents.map(decodeDocument).filter(Boolean));
        return jsonResponse(200, { ok: true, type, count: items.length, items });
    } catch(error) {
        return jsonResponse(error?.name === 'AbortError' ? 504 : 502, {
            ok: false,
            msg: error?.name === 'AbortError' ? '同步内容超时' : '暂时无法同步内容'
        });
    } finally {
        clearTimeout(timer);
    }
}
