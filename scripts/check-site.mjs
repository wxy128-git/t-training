#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const notices = [];
const publicPages = [
    'index.html', 'agents.html', 'multimodal.html', 'classroom-tools.html',
    'tools.html', 'resources.html', 'news.html', 'paths.html',
    'articles.html', 'article.html', 'prompts.html'
];
const appPages = [...publicPages, 'workspace.html', 'admin.html'];
const pwaPages = [...publicPages, 'workspace.html'];

function fail(file, message) { failures.push(`${file}: ${message}`); }
function text(file) { return readFileSync(join(root, file), 'utf8'); }

for (const file of publicPages) {
    const html = text(file);
    if (!/<html\b[^>]*\blang="zh-CN"/i.test(html)) fail(file, '缺少 lang="zh-CN"');
    if (!/<meta\s+name="viewport"/i.test(html)) fail(file, '缺少 viewport');
    if (!/<meta\s+name="description"\s+content="[^"]+"/i.test(html)) fail(file, '缺少页面描述');
    if (!/<title>[^<]+<\/title>/i.test(html)) fail(file, '缺少标题');
    if (!/<h1\b/i.test(html)) fail(file, '缺少 H1');
    if (!/id="main-content"/i.test(html)) fail(file, '跳到主要内容的锚点缺失');
    const canonical = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i)?.[1];
    if (!canonical) fail(file, '缺少 canonical');
    else if (!canonical.startsWith('https://ai.teachailab.com/')) fail(file, `canonical 域名不正确：${canonical}`);
    else if (/\.html(?:[?#]|$)/i.test(canonical)) fail(file, `canonical 仍含 .html：${canonical}`);
}

for (const file of appPages) {
    const html = text(file);
    if (!/js\/safe-render\.js\?v=20260719-security/.test(html)) fail(file, '未加载当前 SafeRender');
    if (!/css\/style\.css\?v=20260822-phase1/.test(html)) fail(file, '样式缓存版本未统一');
    if (!/js\/firebase-config\.js\?v=20260822-phase1/.test(html)) fail(file, 'Firebase 配置缓存版本未统一');
    if (!/js\/auth\.js\?v=20260822-phase1/.test(html)) fail(file, '认证脚本缓存版本未统一');
    if (!/js\/assistant\.js\?v=20260821-tencent/.test(html)) fail(file, '网站向导缓存版本未统一');
}

for (const asset of [
    'vendor/firebase/10.12.0/firebase-app-compat.js',
    'vendor/firebase/10.12.0/firebase-auth-compat.js',
    'vendor/firebase/10.12.0/firebase-firestore-compat.js',
    'vendor/marked/9.1.6/marked.min.js',
    'vendor/phosphor/2.1.2/regular/style.css',
    'vendor/phosphor/2.1.2/regular/Phosphor.woff2',
    'vendor/phosphor/2.1.2/fill/style.css',
    'vendor/phosphor/2.1.2/fill/Phosphor-Fill.woff2',
    'vendor/phosphor/2.1.2/bold/style.css',
    'vendor/phosphor/2.1.2/bold/Phosphor-Bold.woff2',
    'vendor/phosphor/2.1.2/light/style.css',
    'vendor/phosphor/2.1.2/light/Phosphor-Light.woff2'
]) {
    if (!existsSync(join(root, asset))) fail(asset, '本地运行依赖缺失');
}

for (const file of pwaPages) {
    const html = text(file);
    if (!/viewport-fit=cover/.test(html)) fail(file, 'PWA 页面 viewport 未适配设备安全区');
    if (!/display-mode:\s*standalone/.test(html)) fail(file, '缺少安装态首帧识别');
    if (!/<meta\s+name="mobile-web-app-capable"\s+content="yes">/i.test(html)) fail(file, '缺少标准移动 Web App 声明');
    if (!/css\/pwa\.css\?v=20260822-phase1/.test(html)) fail(file, 'PWA 样式缓存版本未统一');
    if (!/js\/pwa\.js\?v=20260822-phase1/.test(html)) fail(file, 'PWA 脚本缓存版本未统一');
}

const pwaSource = text('js/pwa.js');
if (!/pwa-app-tabbar/.test(pwaSource) || !/pwa-app-home/.test(pwaSource) || !/pwa-task-dialog/.test(pwaSource)) fail('js/pwa.js', '安装态 App 壳层不完整');
if (!/data-pwa-tab="home"[\s\S]+data-pwa-tab="workspace"[\s\S]+data-pwa-start[\s\S]+data-pwa-tab="classroom"[\s\S]+data-pwa-more/.test(pwaSource)) fail('js/pwa.js', 'App 底部主导航顺序不正确');
const pwaCss = text('css/pwa.css');
if (!/safe-area-inset-bottom/.test(pwaCss) || !/nav-drawer-panel/.test(pwaCss) || !/pwa-task-sheet/.test(pwaCss)) fail('css/pwa.css', '安装态安全区或底部菜单样式缺失');
const classroomHtml = text('classroom-tools.html');
const classroomButtons = [...classroomHtml.matchAll(/<button\b[^>]*class="ct-tool-card"[^>]*data-tool=/g)];
if (classroomButtons.length !== 9 || /<div\b[^>]*class="ct-tool-card"/.test(classroomHtml)) fail('classroom-tools.html', '课堂工具卡必须是 9 个原生按钮');
if (!/ct-tool-open[\s\S]+assistant-launcher/.test(classroomHtml)) fail('classroom-tools.html', '课堂工具工作区未隐藏网站向导');
const homeHtml = text('index.html');
if (!/th-mobile-more/.test(homeHtml) || !/th-mobile-secondary/.test(homeHtml)) fail('index.html', '移动首页未接入任务优先折叠结构');
const pathsHtml = text('paths.html');
if (!/PATH_PROGRESS_PREFIX/.test(pathsHtml) || !/step-complete-btn/.test(pathsHtml) || !/path-continue/.test(pathsHtml)) fail('paths.html', '学习路径续学或完成进度功能不完整');
const offlineHtml = text('offline.html');
if (!/viewport-fit=cover/.test(offlineHtml) || !/mobile-web-app-capable/.test(offlineHtml) || !/js\/pwa\.js\?v=20260822-phase1/.test(offlineHtml)) fail('offline.html', '离线页未接入当前 App 壳层');
const manifest = JSON.parse(text('manifest.webmanifest'));
if (manifest.display !== 'standalone' || manifest.scope !== '/') fail('manifest.webmanifest', 'PWA 显示模式或 scope 不正确');
if (!manifest.launch_handler?.client_mode?.includes('navigate-existing')) fail('manifest.webmanifest', 'PWA 未配置复用现有应用窗口');
if (!/20260822-v8/.test(text('sw.js'))) fail('sw.js', 'Service Worker 缓存版本未更新');
if (!/['"]\/agents['"][\s\S]+['"]\/classroom-tools['"]/.test(text('sw.js'))) fail('sw.js', '智能体目录或课堂工具未加入核心离线页面');

for (const file of readdirSync(root).filter(name => name.endsWith('.html'))) {
    const html = text(file);
    const oldLinks = [...html.matchAll(/(?:href|action)\s*=\s*["'][^"']*\.html(?:[?#"'])/gi)];
    if (oldLinks.length) fail(file, `发现 ${oldLinks.length} 个站内 .html 链接`);
    const imageTags = [...html.matchAll(/<img\b[^>]*>/gi)];
    imageTags.forEach(tag => {
        if (!/\balt\s*=\s*["'][^"']*["']/i.test(tag[0])) fail(file, `图片缺少 alt：${tag[0].slice(0, 80)}`);
    });
    for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        const attributes = script[1] || '';
        if (/\bsrc\s*=/i.test(attributes) || /type=["']application\/ld\+json["']/i.test(attributes)) continue;
        try { new Function(script[2]); }
        catch (error) { fail(file, `内联脚本语法错误：${error.message}`); }
    }
}

for (const file of ['agents.html', 'workspace.html', 'article.html']) {
    const html = text(file);
    const directMarked = [...html.matchAll(/\bmarked\.parse\s*\(/g)];
    if (directMarked.length) fail(file, '业务页不得直接使用 marked.parse，必须经 SafeRender.markdown');
}

const localRefPattern = /(?:href|src)\s*=\s*["']([^"']+)["']/gi;
const routeFiles = new Set(readdirSync(root).filter(name => name.endsWith('.html')).map(name => `/${name.replace(/\.html$/, '')}`));
routeFiles.add('/');
for (const file of readdirSync(root).filter(name => name.endsWith('.html'))) {
    const html = text(file);
    for (const match of html.matchAll(localRefPattern)) {
        const ref = match[1];
        if (!ref || /^(?:https?:|mailto:|tel:|data:|javascript:|about:|#|\/\/)/i.test(ref)) continue;
        const clean = ref.split(/[?#]/)[0];
        if (!clean || clean.includes('${')) continue;
        if (clean.startsWith('/')) {
            if (!extname(clean) && !routeFiles.has(clean)) fail(file, `不存在的站内路由：${clean}`);
            else if (extname(clean) && !existsSync(join(root, clean.slice(1)))) fail(file, `不存在的本地文件：${clean}`);
        } else if (!existsSync(join(root, dirname(file), clean))) {
            fail(file, `不存在的相对文件：${clean}`);
        }
    }
}

for (const file of ['firestore.rules', 'firebase.json', '_headers', '_redirects', 'robots.txt', 'sitemap.xml']) {
    if (!existsSync(join(root, file))) fail(file, '必需文件不存在');
}

const nginxConfig = text('deploy/tencent/nginx-ai.teachailab.com.conf');
if (!/listen 443 ssl http2;/.test(nginxConfig)) fail('deploy/tencent/nginx-ai.teachailab.com.conf', '生产站未启用 HTTP/2');
if (!/gzip_types[\s\S]*text\/css[\s\S]*application\/javascript[\s\S]*application\/json/.test(nginxConfig)) {
    fail('deploy/tencent/nginx-ai.teachailab.com.conf', 'CSS、JS 或 JSON 未纳入 Gzip');
}

const redirects = text('_redirects');
if (!/^\/main\s+https:\/\/ai\.teachailab\.com\/resources\s+302\s*$/m.test(redirects)) {
    fail('_redirects', '旧站 /main 未使用 302 跳转到新站资源页');
}
if (!/^\/\*\s+https:\/\/ai\.teachailab\.com\/:splat\s+302\s*$/m.test(redirects)) {
    fail('_redirects', 'Cloudflare 旧站未使用保留路径的 302 全站跳转');
}

const safeRender = text('js/safe-render.js');
if (!/createElement\(['"]template['"]\)/.test(safeRender) || !/safeUrl/.test(safeRender)) fail('js/safe-render.js', 'HTML 清洗或 URL 校验器缺失');
if (!/reset-password/.test(text('functions/api/auth-proxy.js'))) fail('functions/api/auth-proxy.js', '密码重置代理缺失');
if (/Access-Control-Allow-Origin['"]?\s*[:,]\s*['"]\*/.test(text('functions/api/auth-proxy.js'))) fail('functions/api/auth-proxy.js', '认证接口不应允许通配 CORS');
const authSource = text('js/auth.js');
if (!/sessionStorage[\s\S]+persistent/.test(authSource)) fail('js/auth.js', '“记住我”未区分会话与长期存储');
if (/const PROTECTED_PAGE_NAMES = new Set\(\[[\s\S]*?'tools\.html'/.test(authSource)) fail('js/auth.js', '公开内容页面仍被整页登录门保护');
if (!/required aria-required="true"/.test(authSource)) fail('js/auth.js', '登录注册必填项缺少可访问性语义');
if (!/const RSS_FEEDS = Object\.freeze/.test(text('functions/api/rss-proxy.js')) || /new URL\(request\.url\)\.searchParams\.get\(['"]url['"]\)[\s\S]*\^https\?:/.test(text('functions/api/rss-proxy.js'))) {
    fail('functions/api/rss-proxy.js', 'RSS 代理未使用固定白名单');
}

for (const file of appPages) {
    const html = text(file);
    if (/https:\/\/(?:www\.gstatic\.com\/firebasejs|unpkg\.com\/@phosphor-icons|cdn\.jsdelivr\.net\/npm\/marked)/.test(html)) {
        fail(file, '关键运行依赖仍从海外 CDN 加载');
    }
}

for (const asset of [
    '多模态素材/poem-landscape-web.jpg',
    '多模态素材/science-hot-air-poster-web.jpg',
    '多模态素材/class-meeting-cooperation-web.jpg',
    '多模态素材/history-market-observation-web.jpg'
]) {
    const path = join(root, asset);
    if (!existsSync(path)) fail(asset, '优化图不存在');
    else if (statSync(path).size > 500 * 1024) fail(asset, '优化图超过 500 KB');
}

const sitemap = text('sitemap.xml');
for (const file of publicPages.filter(name => name !== 'article.html')) {
    const route = file === 'index.html' ? '/' : `/${file.replace(/\.html$/, '')}`;
    if (!sitemap.includes(`<loc>https://ai.teachailab.com${route}</loc>`)) fail('sitemap.xml', `缺少 ${route}`);
}

notices.push(`检查 ${publicPages.length} 个公开页面、${appPages.length} 个应用页面`);
if (failures.length) {
    console.error(`站点检查失败（${failures.length} 项）：`);
    failures.forEach(item => console.error(`- ${item}`));
    process.exitCode = 1;
} else {
    console.log(`站点检查通过：${notices.join('；')}。`);
}
