#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;

function assert(condition, message) {
    if (!condition) throw new Error(message);
    passed += 1;
}

async function importSource(file) {
    const source = readFileSync(join(root, file), 'utf8');
    const encoded = Buffer.from(source).toString('base64');
    return import(`data:text/javascript;base64,${encoded}#${Date.now()}-${Math.random()}`);
}

const originalFetch = globalThis.fetch;

try {
    await importSource('js/safe-render.js');
    assert(globalThis.SafeRender.escape('<img onerror=1>') === '&lt;img onerror=1&gt;', 'SafeRender.escape 未转义标签');
    assert(globalThis.SafeRender.safeUrl('javascript:alert(1)') === '', 'SafeRender.safeUrl 未拒绝 javascript URL');
    assert(globalThis.SafeRender.safeUrl('https://example.com/path') === 'https://example.com/path', 'SafeRender.safeUrl 误拒绝 HTTPS');

    const content = await importSource('functions/api/content.js');
    let contentRequest = null;
    globalThis.fetch = async (url, options = {}) => {
        contentRequest = { url: String(url), options };
        return new Response(JSON.stringify([{
            document: {
                name: 'projects/demo/databases/(default)/documents/articles/article-1',
                fields: {
                    title: { stringValue: '测试文章' },
                    status: { stringValue: 'published' },
                    order: { integerValue: '2' }
                }
            }
        }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const articleListResponse = await content.onRequestGet({ request: new Request('https://site.test/api/content?type=articles') });
    const articleList = await articleListResponse.json();
    assert(articleListResponse.status === 200 && articleList.items?.[0]?.title === '测试文章', '文章代理未正确解码响应');
    assert(contentRequest.options.method === 'POST' && contentRequest.url.endsWith('/documents:runQuery'), '文章列表未使用受规则约束的查询');
    assert(JSON.parse(contentRequest.options.body).structuredQuery.where.fieldFilter.value.stringValue === 'published', '文章查询未限定 published');

    globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'PERMISSION_DENIED' } }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
    });
    const hiddenArticleResponse = await content.onRequestGet({ request: new Request('https://site.test/api/content?type=articles&id=draft') });
    assert(hiddenArticleResponse.status === 404, '未发布文章的权限拒绝未映射为 404');

    const authProxy = await importSource('functions/api/auth-proxy.js');
    let fetchCount = 0;
    globalThis.fetch = async () => { fetchCount += 1; return new Response('{}', { status: 500 }); };
    const invalidAuthResponse = await authProxy.onRequestPost({
        request: new Request('https://site.test/api/auth-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': 'test-invalid' },
            body: JSON.stringify({ action: 'login', email: 'not-an-email', password: '123456' })
        })
    });
    assert(invalidAuthResponse.status === 400 && fetchCount === 0, '无效认证输入不应请求 Firebase');

    globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'EMAIL_NOT_FOUND' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
    });
    const resetResponse = await authProxy.onRequestPost({
        request: new Request('https://site.test/api/auth-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': 'test-reset' },
            body: JSON.stringify({ action: 'reset-password', email: 'missing@example.com' })
        })
    });
    const resetBody = await resetResponse.json();
    assert(resetResponse.status === 200 && !JSON.stringify(resetBody).includes('EMAIL_NOT_FOUND'), '密码重置泄露账号是否存在');

    const optionsResponse = await authProxy.onRequestOptions();
    assert(optionsResponse.headers.get('Access-Control-Allow-Origin') !== '*', '认证接口仍允许通配 CORS');

    console.log(`函数回归通过：${passed} 项断言。`);
} finally {
    globalThis.fetch = originalFetch;
}
