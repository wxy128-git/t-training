const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

function jsonResponse(status, data, extraHeaders = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS, ...extraHeaders }
    });
}

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet({ request }) {
    const url = new URL(request.url).searchParams.get('url');
    if (!url || !/^https?:\/\//.test(url)) {
        return jsonResponse(400, { error: 'invalid url' });
    }

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);
        const upstream = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; RSSReader/1.0)',
                'Accept': 'application/rss+xml, application/xml, text/xml, */*'
            }
        });
        clearTimeout(timer);
        const contents = await upstream.text();
        return jsonResponse(200, { contents }, { 'Cache-Control': 'public, max-age=1800' });
    } catch(e) {
        return jsonResponse(500, { error: e.message });
    }
}
