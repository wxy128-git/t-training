#!/usr/bin/env node

const base = new URL(process.argv[2] || 'https://ai.teachailab.com/');
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

const routes = ['/', '/agents', '/multimodal', '/classroom-tools', '/tools', '/resources', '/news', '/paths', '/articles', '/prompts', '/workspace'];
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
    assert(body.includes('css/style.css?v=20260823-content-team-workbook'), '首页未加载当前全局样式版本');
    assert(body.includes('css/pwa.css?v=20260822-phase1'), '首页未加载当前 PWA 样式版本');
    assert(body.includes('js/auth.js?v=20260823-content-team-workbook'), '首页未加载当前导航与账户脚本版本');
    assert(body.includes('js/data.js?v=20260823-page-copy') && body.includes('js/site-copy.js?v=20260824-agent-directory'), '首页未加载当前页面文案模块');
    assert(body.includes('js/assistant.js?v=20260821-tencent'), '首页未加载当前网站向导脚本版本');
    assert(body.includes('js/pwa.js?v=20260822-phase1'), '首页未加载当前 PWA 脚本版本');
    assert(body.includes('/vendor/firebase/10.12.0/firebase-app-compat.js'), '首页未加载本地 Firebase SDK');
    assert(!/https:\/\/(?:www\.gstatic\.com\/firebasejs|unpkg\.com\/@phosphor-icons)/.test(body), '首页仍依赖海外脚本 CDN');
    assert(body.includes('id="th-mobile-more"') && body.includes('th-mobile-secondary'), '首页移动端渐进展开入口未上线');
    assert(body.includes('<meta name="mobile-web-app-capable" content="yes">'), '首页缺少标准移动 Web App 声明');
}

const pwaScript = await request('/js/pwa.js?v=20260822-phase1');
if (pwaScript) {
    const body = await pwaScript.text();
    assert(pwaScript.status === 200 && pwaScript.headers.get('content-type')?.includes('javascript'), '当前 PWA 脚本未上线');
    assert(body.includes('pwa-task-dialog') && body.includes('pwa_task_started'), 'PWA 任务启动层或统计事件未上线');
    assert(/data-pwa-tab="home"[\s\S]+data-pwa-tab="workspace"[\s\S]+data-pwa-start[\s\S]+data-pwa-tab="classroom"[\s\S]+data-pwa-more/.test(body), 'PWA 底部主导航顺序异常');
}

const authScript = await request('/js/auth.js?v=20260823-content-team-workbook');
if (authScript) {
    const body = await authScript.text();
    assert(authScript.status === 200 && authScript.headers.get('content-type')?.includes('javascript'), '当前认证脚本未上线');
    assert(!/showWelcomeOverlay\('login'/.test(body), '登录成功仍使用短暂全屏欢迎层');
    assert(/showToast\(userName \? `登录成功/.test(body), '登录成功缺少非阻塞反馈');
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
    assert(serviceWorker.status === 200 && body.includes('20260828-v18'), '当前 Service Worker 版本未上线');
    assert(body.includes("'/'") && body.includes("'/agents'") && body.includes("'/classroom-tools'"), 'Service Worker 未预缓存核心任务页');
}

const health = await request('/healthz');
if (health) {
    const body = await health.json().catch(() => null);
    assert(health.status === 200 && body?.service === 't-training-api', '腾讯云 API 健康检查异常');
}

const paths = await request('/paths');
if (paths) {
    const body = await paths.text();
    assert(body.includes('PATH_PROGRESS_PREFIX') && body.includes('id="path-continue"'), '学习路径进度与继续学习入口未上线');
    assert(body.includes('step-complete-btn') && body.includes('pathsPageCopy.completeAction'), '学习步骤完成操作未上线');
}

const classroom = await request('/classroom-tools');
if (classroom) {
    const body = await classroom.text();
    assert((body.match(/<button type="button" class="ct-tool-card"/g) || []).length === 9, '课堂工具卡片未全部升级为原生按钮');
    assert(body.includes('ct-tool-open') && body.includes('data-site-copy="presentationNote"'), '课堂演示模式说明或界面避让未上线');
}

const agents = await request('/agents');
if (agents) {
    const body = await agents.text();
    assert(body.includes('class="agent-directory"') && body.includes('function departmentHtml') && body.includes('function showAllAgents'), '智能体部门目录或全部成员入口未上线');
    assert(!/agent-roster-list|HERO_ROSTER|renderHeroRoster/.test(body), '智能体默认页仍保留重复的人物在席墙');
    assert(body.includes('class="agent-member"') && body.includes('assets/agent-portraits/'), '数字教研团队人物化界面未上线');
    assert(body.includes('AGENT_BRIEF_PRIMARY_KEYS') && body.includes('教学任务描述') && body.includes('展开全部参数'), '数字成员任务简报或渐进参数未上线');
    assert(body.includes('id="ws-presence"') && body.includes('function setAgentWorkStage') && body.includes('任务已说清，开始起草'), '数字成员工作阶段或成员化操作未上线');
    assert(body.includes('${escapeHtml(a.name)}的交付') && body.includes('AI 交付的是初稿'), '数字成员交付归属或教师核验提示未上线');
    assert(body.includes('js/curriculum-guard.js?v=20260828-curriculum-gate') && body.includes('function curriculumContext'), '课程匹配守卫未上线');
    assert(!body.includes('教材校验章') && !body.includes('ws-textbook-locator') && body.includes('error.curriculum'), '旧教材校验章未移除或服务端拦截反馈未上线');
}

const curriculumGuard = await request('/js/curriculum-guard.js?v=20260828-curriculum-gate');
if (curriculumGuard) {
    const body = await curriculumGuard.text();
    assert(curriculumGuard.status === 200 && curriculumGuard.headers.get('content-type')?.includes('javascript'), '课程匹配守卫脚本未正确上线');
    assert(body.includes('CurriculumGuard') && body.includes('GUARDED_AGENT_IDS') && body.includes("result('unknown'"), '课程匹配守卫脚本内容不完整');
}

const workspace = await request('/workspace');
if (workspace) {
    const body = await workspace.text();
    assert(body.includes('class="wb-desk-scene wb-workbook-light"') && body.includes('class="wb-binder-spine"') && body.includes('class="wb-directory-page"'), '轻量备课本或装订线索界面未上线');
    assert(body.includes('data-type="reviewed"') && body.includes('class="wb-card-more"') && body.includes('wb-sheet-open'), '备课本筛选、页侧操作或轻量打开交互未上线');
    assert(!/class="(?:wb-paper-under|wb-page-hole|wb-binder-ring|wb-sheet-hole)"/.test(body), '备课本仍渲染过重拟物装饰');
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

for (const file of [
    '/vendor/firebase/10.12.0/firebase-auth-compat.js',
    '/vendor/marked/9.1.6/marked.min.js',
    '/vendor/phosphor/2.1.2/regular/Phosphor.woff2'
]) {
    const response = await request(file);
    if (!response) continue;
    assert(response.status === 200, `${file} 未正确上线`);
    assert(response.headers.get('cache-control')?.includes('max-age=31536000'), `${file} 未启用长期缓存`);
}

const blockedRss = await request('/api/rss-proxy?url=http://127.0.0.1:3001/healthz');
if (blockedRss) {
    const body = await blockedRss.json().catch(() => null);
    assert(blockedRss.status === 400 && body?.error === 'unsupported feed', 'RSS 代理仍可能访问任意地址');
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
    assert(response.status === 200 && body.includes('ai.teachailab.com'), `${file} 未正确上线`);
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
