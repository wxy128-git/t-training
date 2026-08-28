#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = process.argv[2] ? resolve(process.argv[2]) : '';
if (!output) throw new Error('请提供一个新的空目录作为打包目标');
if (output === root || output === dirname(root)) throw new Error('打包目标不能是项目目录或其父目录');
if (existsSync(output) && readdirSync(output).length) throw new Error('打包目标必须不存在或为空');

const listed = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: root,
    encoding: 'utf8'
});
if (listed.status !== 0) throw new Error(listed.stderr || '无法读取 Git 文件清单');
const files = listed.stdout.split('\0').filter(Boolean).filter(file => existsSync(join(root, file)));

const rootStaticFiles = new Set([
    'manifest.webmanifest', 'offline.html', 'robots.txt', 'sitemap.xml', 'sw.js'
]);
const isStatic = file => (
    (dirname(file) === '.' && extname(file) === '.html')
    || rootStaticFiles.has(file)
    || /^(?:assets|css|js|vendor|多模态素材)\//.test(file)
);
const isApi = file => (
    /^functions\/api\/[^/]+\.js$/.test(file)
    || file === 'js/curriculum-guard.js'
    || file === 'server/tencent-api.mjs'
    || file === 'package.json'
);
const isOps = file => /^deploy\/tencent\//.test(file);

function copy(relative, destinationRoot, destinationRelative = relative) {
    const destination = join(destinationRoot, destinationRelative);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(root, relative), destination);
}

const staticFiles = files.filter(isStatic).sort();
const apiFiles = files.filter(isApi).sort();
const opsFiles = files.filter(isOps).sort();
if (!staticFiles.includes('index.html') || apiFiles.length < 10) {
    throw new Error('部署文件清单不完整，拒绝打包');
}

for (const file of staticFiles) copy(file, join(output, 'www'));
for (const file of apiFiles) copy(file, join(output, 'app'));
for (const file of opsFiles) {
    copy(file, join(output, 'ops'), file.replace(/^deploy\/tencent\//, ''));
}

const hash = relative => createHash('sha256').update(readFileSync(join(root, relative))).digest('hex');
const revision = spawnSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
const dirty = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).stdout.trim();
writeFileSync(join(output, 'deployment-manifest.json'), `${JSON.stringify({
    revision: `${revision}${dirty ? '-dirty' : ''}`,
    createdAt: new Date().toISOString(),
    staticFiles: Object.fromEntries(staticFiles.map(file => [file, hash(file)])),
    apiFiles: Object.fromEntries(apiFiles.map(file => [file, hash(file)]))
}, null, 2)}\n`);

console.log(`腾讯云部署包已生成：${staticFiles.length} 个静态文件，${apiFiles.length} 个 API 文件。`);
