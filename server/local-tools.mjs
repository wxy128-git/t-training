import { listDocuments } from './local-firestore-store.mjs';
const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
function response(status, body, extra = {}) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', ...CORS_HEADERS, ...extra } }); }
function text(value, max) { return String(value || '').trim().slice(0, max); }
export function normalizeTool(item) {
    const tool = {
        id: text(item.id, 120), name: text(item.name, 120), desc: text(item.desc, 500), url: text(item.url, 2048),
        icon: text(item.icon || 'ph-toolbox', 80), color: text(item.color || 'text-blue-500', 80), bg: text(item.bg || 'bg-blue-50', 80),
        category: text(item.category || 'more', 80), taskCategory: text(item.taskCategory, 30), tags: text(item.tags, 120), fit: text(item.fit, 240), reviewedAt: text(item.reviewedAt, 10),
        logo: text(item.logo, 240), logoSource: text(item.logoSource, 30), order: Number(item.order)
    };
    if (!tool.id || !tool.name || !/^https?:\/\//i.test(tool.url)) return null;
    if (!Number.isFinite(tool.order)) tool.order = 9999;
    return tool;
}
export async function onRequestOptions() { return new Response(null, { status: 204, headers: CORS_HEADERS }); }
export async function onRequestGet({ env }) {
    try {
        const tools = (await listDocuments(env, 'tools')).map(normalizeTool).filter(Boolean).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'zh-CN'));
        if (!tools.length) return response(502, { ok: false, msg: '工具清单暂时为空' });
        return response(200, { ok: true, count: tools.length, tools }, { 'Cache-Control': 'public, max-age=300', 'X-Cache': 'LOCAL' });
    } catch { return response(503, { ok: false, msg: '本地工具清单暂时不可用' }); }
}
