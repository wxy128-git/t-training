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
    else if (!canonical.startsWith('https://xylaoshi.pages.dev/')) fail(file, `canonical 域名不正确：${canonical}`);
    else if (/\.html(?:[?#]|$)/i.test(canonical)) fail(file, `canonical 仍含 .html：${canonical}`);
}

for (const file of appPages) {
    const html = text(file);
    if (!/js\/safe-render\.js\?v=20260719-security/.test(html)) fail(file, '未加载当前 SafeRender');
    if (!/css\/style\.css\?v=20260719-a11y/.test(html)) fail(file, '样式缓存版本未统一');
    if (!/js\/auth\.js\?v=20260719-securityreset/.test(html)) fail(file, '认证脚本缓存版本未统一');
    if (!/js\/assistant\.js\?v=20260719-a11ysecurity/.test(html)) fail(file, '网站向导缓存版本未统一');
}

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

const safeRender = text('js/safe-render.js');
if (!/createElement\(['"]template['"]\)/.test(safeRender) || !/safeUrl/.test(safeRender)) fail('js/safe-render.js', 'HTML 清洗或 URL 校验器缺失');
if (!/reset-password/.test(text('functions/api/auth-proxy.js'))) fail('functions/api/auth-proxy.js', '密码重置代理缺失');
if (/Access-Control-Allow-Origin['"]?\s*[:,]\s*['"]\*/.test(text('functions/api/auth-proxy.js'))) fail('functions/api/auth-proxy.js', '认证接口不应允许通配 CORS');

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
    if (!sitemap.includes(`<loc>https://xylaoshi.pages.dev${route}</loc>`)) fail('sitemap.xml', `缺少 ${route}`);
}

notices.push(`检查 ${publicPages.length} 个公开页面、${appPages.length} 个应用页面`);
if (failures.length) {
    console.error(`站点检查失败（${failures.length} 项）：`);
    failures.forEach(item => console.error(`- ${item}`));
    process.exitCode = 1;
} else {
    console.log(`站点检查通过：${notices.join('；')}。`);
}
