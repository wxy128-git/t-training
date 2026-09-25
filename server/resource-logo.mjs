import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

import { localFeatureSession } from './local-firestore-store.mjs';

const MAX_HTML_BYTES = 768 * 1024;
const MAX_LOGO_BYTES = 320 * 1024;
const MAX_POST_BYTES = 520 * 1024;
const FETCH_TIMEOUT_MS = 8000;
const FILE_PATTERN = /^[a-f0-9]{24}\.(?:png|jpg|webp|gif|ico)$/;
const JSON_HEADERS = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
};

function jsonResponse(status, body) {
    return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function httpError(statusCode, message, code = '') {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    return error;
}

async function readJsonLimited(request, maxBytes) {
    const declared = Number(request.headers.get('content-length') || 0);
    if (declared > maxBytes) throw httpError(413, '上传内容过大');
    if (!request.body) return {};
    const reader = request.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
            await reader.cancel().catch(() => {});
            throw httpError(413, '上传内容过大');
        }
        chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw httpError(400, '请求格式不正确'); }
}

function logoDirectory(env = {}) {
    const configured = String(env.T_TRAINING_RESOURCE_LOGO_DIR || process.env.T_TRAINING_RESOURCE_LOGO_DIR || '').trim();
    if (configured) return resolve(configured);
    return process.env.NODE_ENV === 'production'
        ? '/home/ubuntu/t-training/shared/resource-logos'
        : join(tmpdir(), 't-training-resource-logos');
}

export function normalizeWebsiteUrl(value) {
    let url;
    try { url = new URL(String(value || '').trim()); }
    catch { throw httpError(400, '请先填写以 http:// 或 https:// 开头的网站地址'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        throw httpError(400, '只支持公开的 http:// 或 https:// 网站地址');
    }
    if ((url.protocol === 'http:' && url.port && url.port !== '80') || (url.protocol === 'https:' && url.port && url.port !== '443')) {
        throw httpError(400, '暂不支持使用特殊端口的网站地址');
    }
    return url;
}

function ipv4Number(parts) {
    return parts.reduce((value, part) => (value * 256) + Number(part), 0) >>> 0;
}

export function isPrivateAddress(address) {
    const value = String(address || '').trim().toLowerCase();
    if (!value) return true;
    if (value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')) return true;
    const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    const ipv4 = mapped || (/^\d+\.\d+\.\d+\.\d+$/.test(value) ? value : '');
    if (!ipv4) return false;
    const parts = ipv4.split('.').map(Number);
    if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true;
    const number = ipv4Number(parts);
    const inRange = (start, mask) => (number & mask) === (start & mask);
    return inRange(ipv4Number([0, 0, 0, 0]), 0xff000000)
        || inRange(ipv4Number([10, 0, 0, 0]), 0xff000000)
        || inRange(ipv4Number([100, 64, 0, 0]), 0xffc00000)
        || inRange(ipv4Number([127, 0, 0, 0]), 0xff000000)
        || inRange(ipv4Number([169, 254, 0, 0]), 0xffff0000)
        || inRange(ipv4Number([172, 16, 0, 0]), 0xfff00000)
        || inRange(ipv4Number([192, 168, 0, 0]), 0xffff0000)
        || inRange(ipv4Number([224, 0, 0, 0]), 0xf0000000);
}

async function publicAddressFor(hostname) {
    const lowered = String(hostname || '').toLowerCase();
    if (!lowered || lowered === 'localhost' || lowered.endsWith('.localhost') || lowered.endsWith('.local')) {
        throw httpError(400, '该地址不是公开网站', 'PRIVATE_ADDRESS');
    }
    const addresses = await dns.lookup(lowered, { all: true, verbatim: true }).catch(() => []);
    const publicEntry = addresses.find(entry => !isPrivateAddress(entry.address));
    if (!addresses.length) throw httpError(422, '无法解析这个网站的地址，请检查网址是否正确', 'DNS_FAILED');
    if (!publicEntry || addresses.some(entry => isPrivateAddress(entry.address))) {
        throw httpError(400, '为保护服务器安全，不能访问内网或本机地址', 'PRIVATE_ADDRESS');
    }
    return publicEntry.address;
}

async function requestBuffer(urlValue, { maxBytes, redirects = 0, accept = '*/*' }) {
    const url = normalizeWebsiteUrl(urlValue);
    const address = await publicAddressFor(url.hostname);
    const transport = url.protocol === 'https:' ? https : http;
    return new Promise((resolveRequest, rejectRequest) => {
        const request = transport.request({
            protocol: url.protocol,
            hostname: address,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: `${url.pathname}${url.search}`,
            method: 'GET',
            servername: url.hostname,
            headers: {
                Host: url.host,
                Accept: accept,
                'Accept-Encoding': 'identity',
                'User-Agent': 'TeachAILab-LogoFetcher/1.0'
            }
        }, response => {
            const status = Number(response.statusCode || 0);
            if (status >= 300 && status < 400 && response.headers.location) {
                response.resume();
                if (redirects >= 3) return rejectRequest(httpError(422, '网站跳转次数过多，暂时无法识别 Logo', 'TOO_MANY_REDIRECTS'));
                let next;
                try { next = new URL(response.headers.location, url); }
                catch { return rejectRequest(httpError(422, '网站返回了无效的跳转地址', 'INVALID_REDIRECT')); }
                requestBuffer(next, { maxBytes, redirects: redirects + 1, accept }).then(resolveRequest, rejectRequest);
                return;
            }
            if (status < 200 || status >= 300) {
                response.resume();
                return rejectRequest(httpError(422, `网站返回 ${status || '异常'} 状态，暂时无法读取`, 'UPSTREAM_STATUS'));
            }
            const declaredLength = Number(response.headers['content-length'] || 0);
            if (declaredLength > maxBytes) {
                response.resume();
                return rejectRequest(httpError(413, '网站图标文件过大', 'UPSTREAM_TOO_LARGE'));
            }
            const chunks = [];
            let size = 0;
            response.on('data', chunk => {
                size += chunk.length;
                if (size > maxBytes) {
                    response.destroy(httpError(413, '网站图标文件过大', 'UPSTREAM_TOO_LARGE'));
                    return;
                }
                chunks.push(chunk);
            });
            response.on('end', () => resolveRequest({
                body: Buffer.concat(chunks),
                contentType: String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase(),
                finalUrl: url
            }));
            response.on('error', rejectRequest);
        });
        request.setTimeout(FETCH_TIMEOUT_MS, () => request.destroy(httpError(504, '连接网站超时，请稍后重试', 'UPSTREAM_TIMEOUT')));
        request.on('error', rejectRequest);
        request.end();
    });
}

function htmlAttributes(tag) {
    const attrs = {};
    for (const match of tag.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
        attrs[match[1].toLowerCase()] = (match[2] ?? match[3] ?? match[4] ?? '').replace(/&amp;/gi, '&');
    }
    return attrs;
}

export function extractIconCandidates(html, pageUrl) {
    const base = normalizeWebsiteUrl(pageUrl);
    const candidates = [];
    for (const tag of String(html || '').match(/<link\b[^>]*>/gi) || []) {
        const attrs = htmlAttributes(tag);
        const rel = String(attrs.rel || '').toLowerCase();
        if (!rel.includes('icon') || !attrs.href) continue;
        let url;
        try { url = new URL(attrs.href, base); } catch { continue; }
        if (!['http:', 'https:'].includes(url.protocol)) continue;
        const sizes = String(attrs.sizes || '').match(/(\d+)x(\d+)/i);
        const size = sizes ? Math.max(Number(sizes[1]), Number(sizes[2])) : 0;
        const score = (rel.includes('apple-touch-icon') ? 10000 : 5000) + Math.min(size, 1024);
        candidates.push({ url: url.href, score });
    }
    for (const [path, score] of [['/apple-touch-icon.png', 9000], ['/favicon-196x196.png', 7000], ['/favicon.ico', 1000]]) {
        candidates.push({ url: new URL(path, base.origin).href, score });
    }
    return [...new Map(candidates.sort((a, b) => b.score - a.score).map(candidate => [candidate.url, candidate])).values()].map(candidate => candidate.url);
}

export function detectImageType(bytes) {
    const data = Buffer.from(bytes || []);
    if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return { extension: 'png', contentType: 'image/png' };
    if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return { extension: 'jpg', contentType: 'image/jpeg' };
    if (data.length >= 12 && data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP') return { extension: 'webp', contentType: 'image/webp' };
    if (data.length >= 6 && ['GIF87a', 'GIF89a'].includes(data.subarray(0, 6).toString('ascii'))) return { extension: 'gif', contentType: 'image/gif' };
    if (data.length >= 4 && data[0] === 0x00 && data[1] === 0x00 && data[2] === 0x01 && data[3] === 0x00) return { extension: 'ico', contentType: 'image/x-icon' };
    return null;
}

export function decodeLogoDataUrl(value) {
    const match = String(value || '').match(/^data:image\/(?:png|jpeg|jpg|webp|gif|x-icon|vnd\.microsoft\.icon);base64,([A-Za-z0-9+/=]+)$/i);
    if (!match) throw httpError(400, '请选择 PNG、JPG、WebP、GIF 或 ICO 图片');
    const bytes = Buffer.from(match[1], 'base64');
    if (!bytes.length || bytes.length > MAX_LOGO_BYTES) throw httpError(413, 'Logo 图片不能超过 320KB');
    if (!detectImageType(bytes)) throw httpError(400, '图片内容无法识别，请换一张图片');
    return bytes;
}

async function saveLogoBytes(env, bytes) {
    const type = detectImageType(bytes);
    if (!type) throw httpError(422, '没有找到可使用的图片格式', 'UNSUPPORTED_IMAGE');
    const file = `${crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 24)}.${type.extension}`;
    const directory = logoDirectory(env);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, file), bytes, { flag: 'wx' }).catch(error => {
        if (error?.code !== 'EEXIST') throw error;
    });
    return { file, logo: `/api/resource-logo?file=${file}`, contentType: type.contentType };
}

async function detectWebsiteLogo(env, websiteUrl) {
    const target = normalizeWebsiteUrl(websiteUrl);
    let page;
    try {
        page = await requestBuffer(target, { maxBytes: MAX_HTML_BYTES, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.2' });
    } catch (error) {
        if (!['UPSTREAM_STATUS', 'UPSTREAM_TOO_LARGE'].includes(error?.code)) throw error;
        page = { body: Buffer.alloc(0), finalUrl: target };
    }
    const html = page.body.toString('utf8');
    const candidates = extractIconCandidates(html, page.finalUrl || target).slice(0, 10);
    for (const candidate of candidates) {
        try {
            const image = await requestBuffer(candidate, { maxBytes: MAX_LOGO_BYTES, accept: 'image/png,image/webp,image/jpeg,image/gif,image/x-icon,*/*;q=0.1' });
            if (!detectImageType(image.body)) continue;
            return { ...(await saveLogoBytes(env, image.body)), detectedFrom: candidate };
        } catch { /* Try the next advertised icon. */ }
    }
    throw httpError(422, '没有自动找到清晰 Logo，可以改用“上传图片”', 'LOGO_NOT_FOUND');
}

async function assertAdmin(env, idToken) {
    const session = await localFeatureSession(env, idToken);
    if (!session?.user?.isAdmin) throw httpError(403, '当前账号没有管理员权限');
}

export async function onRequestGet({ request, env = {} }) {
    const url = new URL(request.url);
    const file = basename(url.searchParams.get('file') || '');
    if (!FILE_PATTERN.test(file)) return jsonResponse(400, { ok: false, msg: 'Logo 文件编号无效' });
    try {
        const bytes = await readFile(join(logoDirectory(env), file));
        const type = detectImageType(bytes);
        if (!type) return jsonResponse(404, { ok: false, msg: 'Logo 不存在' });
        return new Response(bytes, { status: 200, headers: {
            'Content-Type': type.contentType,
            'Content-Length': String(bytes.length),
            'Cache-Control': 'public, max-age=31536000, immutable',
            'X-Content-Type-Options': 'nosniff'
        }});
    } catch (error) {
        return jsonResponse(error?.code === 'ENOENT' ? 404 : 500, { ok: false, msg: error?.code === 'ENOENT' ? 'Logo 不存在' : '暂时无法读取 Logo' });
    }
}

export async function onRequestPost({ request, env = {} }) {
    let payload;
    try { payload = await readJsonLimited(request, MAX_POST_BYTES); }
    catch (error) { return jsonResponse(error.statusCode || 400, { ok: false, msg: error.message || '请求格式不正确' }); }
    try {
        await assertAdmin(env, String(payload.idToken || ''));
        if (payload.action === 'detect') {
            const result = await detectWebsiteLogo(env, payload.websiteUrl);
            return jsonResponse(200, { ok: true, logo: result.logo, source: 'detected' });
        }
        if (payload.action === 'upload') {
            const result = await saveLogoBytes(env, decodeLogoDataUrl(payload.dataUrl));
            return jsonResponse(200, { ok: true, logo: result.logo, source: 'uploaded' });
        }
        return jsonResponse(400, { ok: false, msg: '不支持的 Logo 操作' });
    } catch (error) {
        return jsonResponse(error.statusCode || 500, { ok: false, msg: error.message || 'Logo 处理失败', code: error.code });
    }
}
