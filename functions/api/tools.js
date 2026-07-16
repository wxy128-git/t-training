const FIREBASE_PROJECT_ID = 'xylaoshi-28f6c';
const FIRESTORE_TOOLS_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/tools?pageSize=100`;

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

function jsonResponse(status, body, extraHeaders = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'X-Content-Type-Options': 'nosniff',
            ...CORS_HEADERS,
            ...extraHeaders
        }
    });
}

function firestoreScalar(value) {
    if (!value || typeof value !== 'object') return undefined;
    if ('stringValue' in value) return value.stringValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return Number(value.doubleValue);
    if ('booleanValue' in value) return Boolean(value.booleanValue);
    return undefined;
}

function cleanText(value, maxLength) {
    return String(value || '').trim().slice(0, maxLength);
}

function documentToTool(document) {
    const fields = document?.fields || {};
    const documentId = cleanText(String(document?.name || '').split('/').pop(), 120);
    const url = cleanText(firestoreScalar(fields.url), 2048);
    const tool = {
        id: cleanText(firestoreScalar(fields.id) || documentId, 120),
        name: cleanText(firestoreScalar(fields.name), 120),
        desc: cleanText(firestoreScalar(fields.desc), 500),
        url,
        icon: cleanText(firestoreScalar(fields.icon) || 'ph-toolbox', 80),
        color: cleanText(firestoreScalar(fields.color) || 'text-blue-500', 80),
        bg: cleanText(firestoreScalar(fields.bg) || 'bg-blue-50', 80),
        category: cleanText(firestoreScalar(fields.category) || 'more', 80),
        order: Number(firestoreScalar(fields.order))
    };
    if (!tool.id || !tool.name || !/^https?:\/\//i.test(tool.url)) return null;
    if (!Number.isFinite(tool.order)) tool.order = 9999;
    return tool;
}

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
        const upstream = await fetch(FIRESTORE_TOOLS_URL, {
            signal: controller.signal,
            headers: { 'Accept': 'application/json' }
        });
        const data = await upstream.json().catch(() => ({}));
        if (!upstream.ok) {
            return jsonResponse(502, { ok: false, msg: '暂时无法同步工具清单' });
        }

        const tools = (data.documents || [])
            .map(documentToTool)
            .filter(Boolean)
            .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'zh-CN'));
        if (!tools.length) {
            return jsonResponse(502, { ok: false, msg: '工具清单暂时为空' });
        }

        return jsonResponse(200, { ok: true, count: tools.length, tools }, {
            'Cache-Control': 'public, max-age=300, s-maxage=900, stale-while-revalidate=3600'
        });
    } catch(error) {
        const timedOut = error?.name === 'AbortError';
        return jsonResponse(timedOut ? 504 : 502, {
            ok: false,
            msg: timedOut ? '同步工具清单超时' : '暂时无法同步工具清单'
        });
    } finally {
        clearTimeout(timer);
    }
}
