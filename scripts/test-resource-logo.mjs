#!/usr/bin/env node

import {
    decodeLogoDataUrl,
    detectImageType,
    extractIconCandidates,
    isPrivateAddress,
    normalizeWebsiteUrl,
    onRequestGet,
    onRequestPost
} from '../server/resource-logo.mjs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let passed = 0;
function assert(condition, message) {
    if (!condition) throw new Error(message);
    passed += 1;
}

for (const address of ['127.0.0.1', '10.2.3.4', '172.16.1.2', '192.168.1.3', '169.254.169.254', '::1', 'fc00::1', '::ffff:127.0.0.1']) {
    assert(isPrivateAddress(address), `未拦截内网地址：${address}`);
}
for (const address of ['1.1.1.1', '8.8.8.8', '2001:4860:4860::8888']) {
    assert(!isPrivateAddress(address), `误拦截公开地址：${address}`);
}

assert(normalizeWebsiteUrl('https://example.com/path').hostname === 'example.com', '公开网址解析失败');
for (const url of ['file:///etc/passwd', 'https://user:pass@example.com', 'https://example.com:8443']) {
    let rejected = false;
    try { normalizeWebsiteUrl(url); } catch { rejected = true; }
    assert(rejected, `未拒绝不安全网址：${url}`);
}

const candidates = extractIconCandidates(`
    <html><head>
    <link rel="icon" sizes="32x32" href="/small.png">
    <link rel="apple-touch-icon" sizes="180x180" href="/apple.png">
    <link rel="icon" sizes="196x196" href="https://cdn.example.com/large.png">
    </head></html>
`, 'https://example.com/folder/page');
assert(candidates[0] === 'https://example.com/apple.png', '没有优先选择 Apple Touch Icon');
assert(candidates.includes('https://cdn.example.com/large.png'), '没有保留绝对图标地址');
assert(candidates.at(-1) === 'https://example.com/favicon.ico', '没有补充 favicon.ico 回退');

const png = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
const jpeg = Buffer.from([0xff,0xd8,0xff,0xdb]);
const webp = Buffer.from('RIFF0000WEBP', 'ascii');
const ico = Buffer.from([0x00,0x00,0x01,0x00,0x01,0x00]);
assert(detectImageType(png)?.extension === 'png', 'PNG 识别失败');
assert(detectImageType(jpeg)?.extension === 'jpg', 'JPEG 识别失败');
assert(detectImageType(webp)?.extension === 'webp', 'WebP 识别失败');
assert(detectImageType(ico)?.extension === 'ico', 'ICO 识别失败');
assert(detectImageType(Buffer.from('<svg></svg>')) === null, '不应接受未清理的 SVG');

const decoded = decodeLogoDataUrl(`data:image/png;base64,${png.toString('base64')}`);
assert(decoded.equals(png), '上传图片解码失败');
let rejectedSvg = false;
try { decodeLogoDataUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='); } catch { rejectedSvg = true; }
assert(rejectedSvg, '不应接受 SVG 上传');

const invalidFile = await onRequestGet({ request: new Request('https://ai.teachailab.com/api/resource-logo?file=../../secret'), env: {} });
assert(invalidFile.status === 400, '文件名穿越未被拦截');

const oversized = await onRequestPost({
    request: new Request('https://ai.teachailab.com/api/resource-logo', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ data: 'x'.repeat(530 * 1024) })
    }),
    env: {}
});
assert(oversized.status === 413, '分块请求绕过了上传大小限制');

const logoDir = await mkdtemp(join(tmpdir(), 't-training-resource-logo-test-'));
try {
    const file = '0123456789abcdef01234567.png';
    await writeFile(join(logoDir, file), png);
    const served = await onRequestGet({
        request: new Request(`https://ai.teachailab.com/api/resource-logo?file=${file}`),
        env: { T_TRAINING_RESOURCE_LOGO_DIR: logoDir }
    });
    assert(served.status === 200, '服务器没有返回已保存的 Logo');
    assert(served.headers.get('content-type') === 'image/png', 'Logo MIME 类型不正确');
    assert(served.headers.get('cache-control')?.includes('immutable'), 'Logo 没有启用不可变缓存');
    assert(Buffer.from(await served.arrayBuffer()).equals(png), 'Logo 响应内容不一致');
} finally {
    await rm(logoDir, { recursive:true, force:true });
}

console.log(`资源 Logo 服务测试通过：${passed} 项断言。`);
