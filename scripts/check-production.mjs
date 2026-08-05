#!/usr/bin/env node

const base = new URL(process.argv[2] || 'https://xylaoshi.pages.dev/');
const failures = [];
let assertions = 0;

function assert(condition, message) {
    assertions += 1;
    if (!condition) failures.push(message);
}

async function request(path, options = {}) {
    try {
        return await fetch(new URL(path, base), {
            redirect: 'manual',
            signal: AbortSignal.timeout(15000),
            ...options
        });
    } catch (error) {
        failures.push(`${path} 请求失败：${error.message}`);
        return null;
    }
}

const routes = ['/', '/agents', '/multimodal', '/classroom-tools', '/tools', '/resources', '/news', '/paths', '/articles', '/prompts'];
for (const route of routes) {
    const response = await request(route);
    if (!response) continue;
    const body = await response.text();
    assert(response.status === 200, `${route} 返回 ${response.status}`);
    assert(response.headers.get('content-type')?.includes('text/html'), `${route} Content-Type 不是 HTML`);
    assert(body.includes('<title>') && body.includes('id="main-content"'), `${route} 缺少标题或主内容锚点`);
}

const home = await request('/');
if (home) {
    const body = await home.text();
    assert(home.headers.get('x-content-type-options') === 'nosniff', '缺少 nosniff 响应头');
    assert(home.headers.get('content-security-policy')?.includes("object-src 'none'"), '缺少基础 CSP');
    assert(home.headers.get('strict-transport-security')?.includes('max-age='), '缺少 HSTS');
    assert(body.includes('css/pwa.css?v=20260805-appshell2'), '首页未加载当前 PWA 样式版本');
    assert(body.includes('js/pwa.js?v=20260805-appshell2'), '首页未加载当前 PWA 脚本版本');
    assert(body.includes('<meta name="mobile-web-app-capable" content="yes">'), '首页缺少标准移动 Web App 声明');
}

const pwaScript = await request('/js/pwa.js?v=20260805-appshell2');
if (pwaScript) {
    const body = await pwaScript.text();
    assert(pwaScript.status === 200 && pwaScript.headers.get('content-type')?.includes('javascript'), '当前 PWA 脚本未上线');
    assert(body.includes('pwa-task-dialog') && body.includes('pwa_task_started'), 'PWA 任务启动层或统计事件未上线');
    assert(/data-pwa-tab="home"[\s\S]+data-pwa-tab="workspace"[\s\S]+data-pwa-start[\s\S]+data-pwa-tab="classroom"[\s\S]+data-pwa-more/.test(body), 'PWA 底部主导航顺序异常');
}

const manifest = await request('/manifest.webmanifest');
if (manifest) {
    const body = await manifest.json().catch(() => null);
    assert(manifest.status === 200 && body?.display === 'standalone', 'PWA Manifest 未正确上线');
    assert(body?.launch_handler?.client_mode?.includes('navigate-existing'), 'PWA Manifest 未配置复用现有应用窗口');
}

const serviceWorker = await request('/sw.js');
if (serviceWorker) {
    const body = await serviceWorker.text();
    assert(serviceWorker.status === 200 && body.includes('20260805-v5'), '当前 Service Worker 版本未上线');
}

const safeRender = await request('/js/safe-render.js?v=20260719-security');
if (safeRender) {
    const body = await safeRender.text();
    assert(safeRender.status === 200 && safeRender.headers.get('content-type')?.includes('javascript'), 'SafeRender 脚本未上线');
    assert(body.includes('initSafeRender') && body.includes('sanitizeHtml'), 'SafeRender 内容不完整');
}

const content = await request('/api/content?type=articles');
if (content) {
    const body = await content.json().catch(() => null);
    assert(content.status === 200 && content.headers.get('content-type')?.includes('application/json'), '公开内容代理未返回 JSON');
    assert(body?.ok === true && Array.isArray(body.items) && body.items.every(item => item.status === 'published'), '文章代理包含异常或未发布内容');
    assert(content.headers.get('cache-control')?.includes('s-maxage=600'), '公开内容代理缓存策略异常');
}

const auth = await request('/api/auth-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'unknown' })
});
if (auth) {
    const body = await auth.json().catch(() => null);
    assert(auth.status === 400 && body?.ok === false, '认证代理的无效操作校验异常');
    assert(auth.headers.get('cache-control') === 'no-store', '认证响应未禁用缓存');
    assert(auth.headers.get('access-control-allow-origin') !== '*', '认证代理仍允许通配 CORS');
}

const redirect = await request('/main');
if (redirect) {
    assert([301, 302, 307, 308].includes(redirect.status), `/main 未跳转，状态为 ${redirect.status}`);
    assert((redirect.headers.get('location') || '').endsWith('/resources'), '/main 未跳转到 /resources');
}

for (const file of ['/robots.txt', '/sitemap.xml']) {
    const response = await request(file);
    if (!response) continue;
    const body = await response.text();
    assert(response.status === 200 && body.includes('xylaoshi.pages.dev'), `${file} 未正确上线`);
}

const image = await request('/多模态素材/poem-landscape-web.jpg');
if (image) {
    const bytes = await image.arrayBuffer();
    assert(image.status === 200 && image.headers.get('content-type')?.includes('image/jpeg'), '多模态优化图未上线');
    assert(bytes.byteLength < 500 * 1024, '多模态优化图超过 500 KB');
}

if (failures.length) {
    console.error(`生产检查失败（${failures.length} 项）：`);
    failures.forEach(item => console.error(`- ${item}`));
    process.exitCode = 1;
} else {
    console.log(`生产检查通过：${assertions} 项断言，目标 ${base.origin}。`);
}
