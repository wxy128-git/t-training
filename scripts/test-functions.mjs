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
const originalWindow = globalThis.window;

try {
    await importSource('js/safe-render.js');
    assert(globalThis.SafeRender.escape('<img onerror=1>') === '&lt;img onerror=1&gt;', 'SafeRender.escape 未转义标签');
    assert(globalThis.SafeRender.safeUrl('javascript:alert(1)') === '', 'SafeRender.safeUrl 未拒绝 javascript URL');
    assert(globalThis.SafeRender.safeUrl('https://example.com/path') === 'https://example.com/path', 'SafeRender.safeUrl 误拒绝 HTTPS');

    globalThis.window = globalThis;
    await importSource('js/site-copy.js');
    const homeDefaults = globalThis.SiteCopy.defaults('home');
    assert(homeDefaults.heroAccent === 'AI' && homeDefaults.taskHeading === '今天要完成什么？', '首页默认文案不完整');
    assert(Object.keys(globalThis.SiteCopy.definitions).length === 12 && globalThis.SiteCopy.defaults('classroom').routineName === '课堂活动模板', '全站页面文案定义不完整');
    const pageFiles = { home:'index.html', classroom:'classroom-tools.html' };
    for (const [pageId, definition] of Object.entries(globalThis.SiteCopy.definitions)) {
        assert(globalThis.SiteCopy.validate(pageId, globalThis.SiteCopy.defaults(pageId)).ok, `${pageId} 默认文案未通过校验`);
        const pageSource = readFileSync(join(root, pageFiles[pageId] || `${pageId}.html`), 'utf8');
        const missingKeys = definition.fields.map(field => field.key).filter(key => !pageSource.includes(key));
        assert(missingKeys.length === 0, `${pageId} 页面未使用文案字段：${missingKeys.join(', ')}`);
    }
    assert(globalThis.SiteCopy.normalize('home', { fields: { heroTitle: '' } }).heroTitle === homeDefaults.heroTitle, '无效后台文案未回退到本地默认值');
    assert(globalThis.SiteCopy.validate('home', { ...homeDefaults, heroAccent: '课堂外' }).ok === false, '标题强调词校验未生效');

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
    const cachedArticleListResponse = await content.onRequestGet({ request: new Request('https://site.test/api/content?type=articles') });
    assert(cachedArticleListResponse.headers.get('X-Cache') === 'HIT', '公开内容没有命中进程内缓存');

    globalThis.fetch = async () => new Response(JSON.stringify({
        name: 'projects/demo/databases/(default)/documents/page_copy/home',
        fields: {
            fields: {
                mapValue: {
                    fields: {
                        heroTitle: { stringValue: '让 AI 真正走进你的课堂' },
                        heroAccent: { stringValue: 'AI' }
                    }
                }
            },
            updatedAt: { stringValue: '2026-08-23T00:00:00.000Z' }
        }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const pageCopyResponse = await content.onRequestGet({ request: new Request('https://site.test/api/content?type=pageCopy&id=home') });
    const pageCopy = await pageCopyResponse.json();
    assert(pageCopyResponse.status === 200 && pageCopy.item?.fields?.heroTitle === '让 AI 真正走进你的课堂', '页面文案代理未正确解码响应');
    assert(pageCopyResponse.headers.get('Cache-Control') === 'no-store' && pageCopyResponse.headers.get('X-Cache') === 'BYPASS', '页面文案代理不应返回旧缓存');

    let pageCopyFetchCount = 0;
    globalThis.fetch = async () => { pageCopyFetchCount += 1; return new Response('{}', { status: 500 }); };
    const invalidPageCopyResponse = await content.onRequestGet({ request: new Request('https://site.test/api/content?type=pageCopy&id=unknown') });
    assert(invalidPageCopyResponse.status === 400 && pageCopyFetchCount === 0, '无效页面文案编号不应请求 Firestore');

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

    const rssProxy = await importSource('functions/api/rss-proxy.js');
    fetchCount = 0;
    globalThis.fetch = async () => { fetchCount += 1; return new Response('<rss><channel><item><title>测试</title><link>https://example.com</link></item></channel></rss>', {
        status: 200,
        headers: { 'Content-Type': 'application/rss+xml' }
    }); };
    const blockedRssResponse = await rssProxy.onRequestGet({ request: new Request('https://site.test/api/rss-proxy?url=http://127.0.0.1:3001/healthz') });
    assert(blockedRssResponse.status === 400 && fetchCount === 0, 'RSS 代理仍可请求任意地址');
    const allowedRssResponse = await rssProxy.onRequestGet({ request: new Request('https://site.test/api/rss-proxy?feed=qbitai') });
    assert(allowedRssResponse.status === 200 && allowedRssResponse.headers.get('X-Cache') === 'MISS' && fetchCount === 1, 'RSS 白名单源未正确抓取');
    const legacyRssResponse = await rssProxy.onRequestGet({ request: new Request('https://site.test/api/rss-proxy?url=https%3A%2F%2Fwww.jiqizhixin.com%2Frss') });
    assert(legacyRssResponse.status === 200, '旧版资讯页面没有安全兼容到新白名单源');
    const cachedRssResponse = await rssProxy.onRequestGet({ request: new Request('https://site.test/api/rss-proxy?feed=qbitai') });
    assert(cachedRssResponse.headers.get('X-Cache') === 'HIT' && fetchCount === 1, 'RSS 源没有命中进程内缓存');

    const adminUsers = await importSource('functions/api/admin-users.js');
    const decodedUser = adminUsers.decodeUserDocument({
        name: 'projects/demo/databases/(default)/documents/users/user-1',
        fields: {
            name: { stringValue: '测试教师' },
            email: { stringValue: 'teacher@example.com' },
            isAdmin: { booleanValue: false },
            joinedAt: { timestampValue: '2026-08-21T00:00:00Z' }
        }
    });
    assert(decodedUser.uid === 'user-1' && decodedUser.name === '测试教师' && decodedUser.joinedAt.startsWith('2026-08-21'), '管理员用户列表未正确解码 Firestore 文档');

    globalThis.fetch = async () => new Response('{}', { status: 500 });
    const unauthenticatedList = await adminUsers.onRequestPost({
        request: new Request('https://site.test/api/admin-users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'listUsers' })
        }),
        env: {}
    });
    assert(unauthenticatedList.status === 401, '用户列表接口未拒绝未登录请求');

    console.log(`函数回归通过：${passed} 项断言。`);
} finally {
    globalThis.fetch = originalFetch;
    delete globalThis.SiteCopy;
    if (typeof originalWindow === 'undefined') delete globalThis.window;
    else globalThis.window = originalWindow;
}
