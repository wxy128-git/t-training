import crypto from 'node:crypto';
import { localFeatureSession, listDocuments, getDocument, upsertDocument, deleteDocument } from './local-firestore-store.mjs';

const CORS_HEADERS = { 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };

function jsonResponse(status, body) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS_HEADERS } });
}

function text(value, max) { return String(value || '').trim().slice(0, max); }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function validId(value) { return /^[A-Za-z0-9_-]{1,128}$/.test(String(value || '')); }

function normalizeWork(raw, uid) {
    const value = object(raw);
    const now = new Date().toISOString();
    return {
        uid,
        agentId: text(value.agentId, 80),
        agentName: text(value.agentName, 120),
        agentType: text(value.agentType, 40),
        workType: text(value.workType, 40),
        title: text(value.title || '未命名内容', 160),
        content: String(value.content || '').slice(0, 240000),
        inputs: object(value.inputs),
        createdAt: text(value.createdAt, 64) || now,
        updatedAt: now
    };
}

async function ownedWork(env, id, uid) {
    if (!validId(id)) {
        const error = new Error('备课本条目不存在'); error.statusCode = 404; throw error;
    }
    const work = await getDocument(env, 'works', id);
    if (!work) { const error = new Error('备课本条目不存在'); error.statusCode = 404; throw error; }
    if (work.uid !== uid) { const error = new Error('无权操作这条备课本内容'); error.statusCode = 403; throw error; }
    return work;
}

export async function onRequestOptions() { return new Response(null, { status: 204, headers: CORS_HEADERS }); }

export async function onRequestPost({ request, env }) {
    if (Number(request.headers.get('content-length') || 0) > 300000) return jsonResponse(413, { ok: false, msg: '备课本请求过大' });
    let payload;
    try { payload = await request.json(); } catch { return jsonResponse(400, { ok: false, msg: '请求格式不正确' }); }
    try {
        const session = await localFeatureSession(env, payload.idToken);
        const uid = session.user.uid;
        if (payload.action === 'list') {
            const works = (await listDocuments(env, 'works'))
                .filter(work => work.uid === uid)
                .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
            return jsonResponse(200, { ok: true, works });
        }
        if (payload.action === 'create') {
            const work = normalizeWork(payload.work, uid);
            const id = crypto.randomUUID().replaceAll('-', '');
            await upsertDocument(env, 'works', id, work);
            return jsonResponse(200, { ok: true, id });
        }
        if (payload.action === 'rename') {
            const work = await ownedWork(env, payload.id, uid);
            await upsertDocument(env, 'works', payload.id, { ...work, title: text(payload.title || '未命名内容', 160), updatedAt: new Date().toISOString() });
            return jsonResponse(200, { ok: true });
        }
        if (payload.action === 'delete') {
            await ownedWork(env, payload.id, uid);
            await deleteDocument(env, 'works', payload.id);
            return jsonResponse(200, { ok: true });
        }
        return jsonResponse(400, { ok: false, msg: '未知备课本操作' });
    } catch (error) {
        return jsonResponse(error.statusCode || 500, { ok: false, code: error.code, msg: error.message || '备课本服务暂时不可用' });
    }
}
