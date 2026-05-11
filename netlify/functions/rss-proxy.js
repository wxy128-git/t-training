exports.handler = async function(event) {
    const url = event.queryStringParameters?.url;

    if (!url || !/^https?:\/\//.test(url)) {
        return { statusCode: 400, body: JSON.stringify({ error: 'invalid url' }) };
    }

    try {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 12000);

        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; RSSReader/1.0)',
                'Accept': 'application/rss+xml, application/xml, text/xml, */*'
            }
        });

        const contents = await response.text();

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=1800'
            },
            body: JSON.stringify({ contents })
        };
    } catch(e) {
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: e.message })
        };
    }
};
