#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { normalizeTool } from '../server/local-tools.mjs';

let passed = 0;
function assert(condition, message) {
    if (!condition) throw new Error(message);
    passed += 1;
}

const requests = [];
const context = vm.createContext({
    console,
    AbortController,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    location: { pathname: '/admin', hostname: 'ai.teachailab.com' },
    Auth: { getIdToken: async () => 'admin-session-token' },
    fetch: async (url, options = {}) => {
        requests.push({ url: String(url), options });
        const type = new URL(String(url), 'https://ai.teachailab.com').searchParams.get('type');
        const items = type === 'tools'
            ? [{ id: 'tool-1', name: '测试工具', url: 'https://example.com', logo: '/api/resource-logo?file=0123456789abcdef01234567.png' }]
            : type === 'resources'
                ? [{ id: 'images', title: '测试素材', items: [] }]
                : [];
        return { ok: true, status: 200, json: async () => ({ ok: true, items }) };
    }
});

vm.runInContext(readFileSync(new URL('../js/data.js', import.meta.url), 'utf8'), context, { filename: 'js/data.js' });

const tools = await vm.runInContext('DB.getTools()', context);
assert(Array.isArray(tools) && tools.length === 1 && tools[0].name === '测试工具', '后台工具列表没有保持数组返回值');
const resources = await vm.runInContext('DB.getResources()', context);
assert(Array.isArray(resources) && resources.length === 1 && resources[0].title === '测试素材', '后台素材列表没有保持数组返回值');
assert(requests.length === 2 && requests.every(entry => entry.url.includes('scope=admin')), '后台列表没有请求管理员数据范围');
assert(requests.every(entry => entry.options.headers.Authorization === 'Bearer admin-session-token'), '后台列表请求没有携带本地登录令牌');

const logoPath = '/api/resource-logo?file=0123456789abcdef01234567.png';
const normalizedTool = normalizeTool({ id:'tool-1', name:'测试工具', desc:'说明', url:'https://example.com', logo:logoPath, logoSource:'uploaded', order:1 });
assert(normalizedTool?.logo === logoPath, '腾讯工具接口丢失后台保存的 Logo');
assert(normalizedTool?.logoSource === 'uploaded', '腾讯工具接口丢失 Logo 来源');

// Admin API failures must never fall back to Firestore or default content.
let firestoreCalls = 0;
context.db = { collection() { firestoreCalls++; throw new Error('Forbidden fallback'); } };
for (const status of [404, 500]) {
    context.fetch = async () => ({ ok: false, status, json: async () => ({ msg: '模拟接口失败' }) });
    for (const method of ['getTools', 'getPrompts', 'getPaths', 'getAnnouncements', 'getArticles', 'getResources', 'getCommunityPrompts', 'getSubscribers', 'getMessages']) {
        let rejected = false;
        try { await vm.runInContext(`DB.${method}()`, context); } catch { rejected = true; }
        assert(rejected, `${method} 错误被误报为空列表`);
    }
    let rejected = false;
    try { await vm.runInContext('DB.setTools([])', context); } catch { rejected = true; }
    assert(rejected, '写入失败未上报');
}
assert(firestoreCalls === 0, '后台失败时仍连接旧 Firebase');
let sent;
context.fetch = async (url, options = {}) => {
    if (options.method === 'POST') sent = JSON.parse(options.body);
    return { ok: true, status: 200, json: async () => ({ ok: true, items: [], revision: options.method === 'POST' ? 'next' : 'baseline' }) };
};
await vm.runInContext('DB.getTools()', context);
await vm.runInContext('DB.setTools([])', context);
assert(sent.revision === 'baseline', '保存未带读取版本');
await vm.runInContext('DB.setTools([])', context);
assert(sent.revision === 'next', '保存后未更新版本');

context.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
let malformedRejected = false;
try { await vm.runInContext('DB.setTools([])', context); } catch { malformedRejected = true; }
assert(malformedRejected, '异常成功响应不能显示保存成功');

console.log(`后台内容客户端通过：${passed} 项断言。`);
