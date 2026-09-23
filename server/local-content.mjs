import crypto from 'node:crypto';
import {
    localFeatureSession,
    listDocuments,
    getDocument,
    upsertDocument,
    createDocument,
    deleteDocument
} from './local-firestore-store.mjs';

const CONTENT_TYPES = {
    announcements: 'announcements', articles: 'articles', paths: 'paths', prompts: 'prompts',
    resources: 'resource_categories', pageCopy: 'page_copy', tools: 'tools',
    subscribers: 'subscribers', messages: 'contact_messages', communityPrompts: 'community_prompts',
    ratings: 'tool_ratings', agentUsage: 'agent_usage'
};
const PAGE_COPY_IDS = new Set(['home', 'multimodal', 'agents', 'classroom', 'tools', 'resources', 'news', 'paths', 'articles', 'article', 'prompts', 'workspace']);
const PUBLIC_TYPES = new Set(['announcements', 'articles', 'paths', 'prompts', 'resources', 'pageCopy', 'tools', 'communityPrompts', 'ratings', 'agentUsage']);
const ADMIN_TYPES = new Set(['subscribers', 'messages']);
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;
const headers = { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' };
const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };

function response(status, body, extra = {}) { return new Response(JSON.stringify(body), { status, headers: { ...headers, ...CORS_HEADERS, ...extra } }); }
function text(value, max) { return String(value ?? '').trim().slice(0, max); }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function validId(value) { return /^[A-Za-z0-9_:\-.]{1,180}$/.test(String(value || '')); }
function adminError() { const error = new Error('当前账号没有管理员权限'); error.statusCode = 403; return error; }
function assertAdmin(session) { if (!session.user.isAdmin) throw adminError(); }
function clearCache(type) { for (const key of cache.keys()) if (key.startsWith(`${type}:`)) cache.delete(key); }
function collectionFor(type) { return CONTENT_TYPES[type] || ''; }
function sortItems(type, items, includeDrafts = false) {
    if (['paths', 'prompts', 'resources', 'tools'].includes(type)) return items.sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    if (type === 'articles') return items.filter(item => includeDrafts || item.status === 'published').sort((a, b) => new Date(b.publishedAt || b.createdAt || 0) - new Date(a.publishedAt || a.createdAt || 0));
    if (['announcements', 'subscribers', 'messages', 'communityPrompts'].includes(type)) return items.sort((a, b) => new Date(b.createdAt || b.subscribedAt || 0) - new Date(a.createdAt || a.subscribedAt || 0));
    if (type === 'agentUsage') return items.sort((a, b) => Number(b.count || 0) - Number(a.count || 0));
    return items;
}
async function adminSession(env, idToken) { const session = await localFeatureSession(env, idToken); assertAdmin(session); return session; }
function publicCommunityItems(items, status) { return items.filter(item => status ? item.status === status : item.status === 'approved'); }

export async function onRequestOptions() { return new Response(null, { status: 204, headers: CORS_HEADERS }); }

export async function onRequestGet({ request, env }) {
    const url = new URL(request.url); const type = url.searchParams.get('type') || ''; const collection = collectionFor(type);
    if (!collection || (!PUBLIC_TYPES.has(type) && !ADMIN_TYPES.has(type))) return response(400, { ok: false, msg: '不支持的内容类型' }, { 'Cache-Control': 'no-store' });
    const id = url.searchParams.get('id') || ''; const scope = url.searchParams.get('scope') || ''; const includeDrafts = scope === 'admin';
    if (type === 'pageCopy' && (!PAGE_COPY_IDS.has(id) || !id)) return response(400, { ok: false, msg: '页面编号无效' }, { 'Cache-Control': 'no-store' });
    if (id && type !== 'pageCopy' && !validId(id)) return response(400, { ok: false, msg: '内容编号无效' }, { 'Cache-Control': 'no-store' });
    let session = null;
    if (includeDrafts || ADMIN_TYPES.has(type) || scope === 'mine') {
        const authorization = request.headers.get('authorization') || '';
        const idToken = authorization.replace(/^Bearer\s+/i, '').trim();
        try { session = includeDrafts || ADMIN_TYPES.has(type) ? await adminSession(env, idToken) : await localFeatureSession(env, idToken); }
        catch (error) { return response(error.statusCode || 401, { ok: false, msg: error.message || '没有访问权限', code: error.code }); }
    }
    if (type === 'communityPrompts' && !includeDrafts && scope !== 'mine') {
        const items = publicCommunityItems(await listDocuments(env, collection), url.searchParams.get('status') || 'approved');
        return response(200, { ok: true, type, count: items.length, items: sortItems(type, items) }, { 'Cache-Control': 'public, max-age=60', 'X-Cache': 'LOCAL' });
    }
    const key = `${type}:${id || 'list'}:${includeDrafts ? 'admin' : 'public'}`; const now = Date.now(); const cached = cache.get(key);
    if (!id && cached && now - cached.savedAt < CACHE_TTL_MS) return response(200, cached.body, { ...headers, ...CORS_HEADERS, 'X-Cache': 'HIT', 'Cache-Control': 'public, max-age=120, s-maxage=600' });
    try {
        if (id) {
            const item = await getDocument(env, collection, id);
            if (!item || (type === 'articles' && !includeDrafts && item.status !== 'published')) return response(type === 'pageCopy' ? 200 : 404, type === 'pageCopy' ? { ok: true, item: null } : { ok: false, msg: '内容不存在' }, { 'Cache-Control': 'no-store' });
            return response(200, { ok: true, type, item }, type === 'pageCopy' ? { 'Cache-Control': 'no-store', 'X-Cache': 'BYPASS' } : { 'X-Cache': 'LOCAL' });
        }
        let items = await listDocuments(env, collection);
        if (scope === 'mine' && session) items = items.filter(item => item.authorId === session.user.uid);
        if (type === 'communityPrompts' && !includeDrafts && scope !== 'mine') items = publicCommunityItems(items, url.searchParams.get('status') || 'approved');
        const body = { ok: true, type, count: items.length, items: sortItems(type, items, includeDrafts) };
        if (!ADMIN_TYPES.has(type) && !includeDrafts) cache.set(key, { body, savedAt: now });
        return response(200, body, { 'X-Cache': 'LOCAL', 'Cache-Control': includeDrafts ? 'no-store' : 'public, max-age=120, s-maxage=600' });
    } catch { return response(503, { ok: false, msg: '本地内容服务暂时不可用' }, { 'Cache-Control': 'no-store' }); }
}

function cleanPageFields(fields) { return Object.fromEntries(Object.entries(object(fields)).slice(0, 40).map(([key, value]) => [text(key, 80), text(value, 4000)]).filter(([key]) => key)); }
function cleanArticle(data, existing = {}) {
    const value = object(data);
    return { ...existing, ...value, title: text(value.title || existing.title, 200), excerpt: text(value.excerpt || existing.excerpt, 800), content: text(value.content || existing.content, 240000), status: ['draft', 'published'].includes(value.status || existing.status) ? (value.status || existing.status) : 'draft', updatedAt: new Date().toISOString() };
}
async function replaceCollection(env, type, items) {
    const collection = collectionFor(type); const existing = await listDocuments(env, collection); const nextIds = new Set();
    for (const [index, raw] of (Array.isArray(items) ? items : []).slice(0, 300).entries()) {
        const value = object(raw); const id = text(value.id, 180) || crypto.randomUUID().replaceAll('-', ''); nextIds.add(id);
        await upsertDocument(env, collection, id, { ...value, id, order: Number.isFinite(Number(value.order)) ? Number(value.order) : index });
    }
    for (const row of existing) if (!nextIds.has(row.id)) await deleteDocument(env, collection, row.id);
    clearCache(type);
}

async function handleAdminMutation(env, payload) {
    await adminSession(env, payload.idToken); const action = text(payload.action, 40); const type = text(payload.type, 40);
    if (action === 'savePageCopy') {
        if (!PAGE_COPY_IDS.has(payload.id)) throw Object.assign(new Error('不支持的页面'), { statusCode: 400 });
        const item = await upsertDocument(env, 'page_copy', payload.id, { fields: cleanPageFields(payload.fields), updatedAt: new Date().toISOString() }); clearCache('pageCopy'); return { item };
    }
    if (action === 'replaceCollection' && ['tools', 'prompts', 'paths', 'resources'].includes(type)) { await replaceCollection(env, type, payload.items); return {}; }
    if (action === 'addAnnouncement') { const id = await createDocument(env, 'announcements', { title: text(payload.title, 200), content: text(payload.content, 10000), createdAt: new Date().toISOString() }); clearCache('announcements'); return { id }; }
    if (['updateAnnouncement', 'deleteAnnouncement'].includes(action)) {
        if (!validId(payload.id)) throw Object.assign(new Error('公告编号无效'), { statusCode: 400 });
        if (action === 'deleteAnnouncement') await deleteDocument(env, 'announcements', payload.id); else await upsertDocument(env, 'announcements', payload.id, { title: text(payload.title, 200), content: text(payload.content, 10000), updatedAt: new Date().toISOString() });
        clearCache('announcements'); return {};
    }
    if (['addArticle', 'updateArticle', 'deleteArticle'].includes(action)) {
        if (action === 'addArticle') { const now = new Date().toISOString(); const id = await createDocument(env, 'articles', cleanArticle({ ...payload.data, readCount: 0, publishedAt: now, createdAt: now })); clearCache('articles'); return { id }; }
        if (!validId(payload.id)) throw Object.assign(new Error('文章编号无效'), { statusCode: 400 });
        if (action === 'deleteArticle') await deleteDocument(env, 'articles', payload.id); else await upsertDocument(env, 'articles', payload.id, cleanArticle(payload.data, await getDocument(env, 'articles', payload.id) || {}));
        clearCache('articles'); return {};
    }
    if (['setResources', 'saveResourceCategory', 'deleteResourceCategory'].includes(action)) {
        if (action === 'setResources') await replaceCollection(env, 'resources', payload.categories);
        else { const id = payload.id || payload.category?.id; if (!validId(id)) throw Object.assign(new Error('资源分类编号无效'), { statusCode: 400 }); if (action === 'deleteResourceCategory') await deleteDocument(env, 'resource_categories', id); else { const { id: ignored, ...rest } = object(payload.category); await upsertDocument(env, 'resource_categories', id, rest); } clearCache('resources'); }
        return {};
    }
    if (['approveCommunityPrompt', 'deleteCommunityPrompt'].includes(action)) {
        if (!validId(payload.id)) throw Object.assign(new Error('提示词编号无效'), { statusCode: 400 });
        if (action === 'deleteCommunityPrompt') await deleteDocument(env, 'community_prompts', payload.id); else await upsertDocument(env, 'community_prompts', payload.id, { ...(await getDocument(env, 'community_prompts', payload.id) || {}), status: 'approved' });
        clearCache('communityPrompts'); return {};
    }
    if (['deleteSubscriber', 'updateMessage', 'deleteMessage'].includes(action)) {
        if (!validId(payload.id)) throw Object.assign(new Error('记录编号无效'), { statusCode: 400 }); const collection = action === 'deleteSubscriber' ? 'subscribers' : 'contact_messages';
        if (action.startsWith('delete')) await deleteDocument(env, collection, payload.id); else await upsertDocument(env, collection, payload.id, object(payload.data)); return {};
    }
    throw Object.assign(new Error('未知管理操作'), { statusCode: 400 });
}

async function handleUserMutation(env, payload) {
    const session = await localFeatureSession(env, payload.idToken); const action = text(payload.action, 40);
    if (action === 'submitContact') {
        const data = object(payload.data);
        const item = {
            name: text(data.name || session.user.name, 80),
            contact: text(data.contact || session.user.email || session.user.phone, 160),
            message: text(data.message, 6000),
            page: text(data.page, 500),
            userId: session.user.uid,
            userEmail: text(session.user.email, 160),
            userPhone: text(session.user.phone, 40),
            createdAt: new Date().toISOString(),
            handled: false
        };
        if (!item.message) throw Object.assign(new Error('留言内容不能为空'), { statusCode: 400 });
        return { id: await createDocument(env, 'contact_messages', item) };
    }
    if (action === 'submitCommunityPrompt') { const item = { ...object(payload.data), authorId: session.user.uid, authorName: text(session.user.name, 80), status: 'pending', likes: 0, likedBy: [], createdAt: new Date().toISOString() }; return { id: await createDocument(env, 'community_prompts', item) }; }
    if (action === 'likeCommunityPrompt') {
        if (!validId(payload.id)) throw Object.assign(new Error('提示词编号无效'), { statusCode: 400 }); const item = await getDocument(env, 'community_prompts', payload.id); if (!item) return { liked: false };
        const likedBy = Array.isArray(item.likedBy) ? item.likedBy : []; const liked = likedBy.includes(session.user.uid); const next = liked ? likedBy.filter(uid => uid !== session.user.uid) : [...likedBy, session.user.uid].slice(-500);
        await upsertDocument(env, 'community_prompts', payload.id, { ...item, likedBy: next, likes: next.length }); return { liked: !liked };
    }
    if (action === 'bumpAgentUsage') { const id = text(payload.id, 120); if (!id) throw Object.assign(new Error('智能体编号无效'), { statusCode: 400 }); const item = await getDocument(env, 'agent_usage', id) || { id, count: 0 }; await upsertDocument(env, 'agent_usage', id, { ...item, count: Number(item.count || 0) + 1, updatedAt: new Date().toISOString() }); clearCache('agentUsage'); return {}; }
    if (action === 'rateTool') {
        const id = text(payload.id, 120); const rating = Math.max(1, Math.min(5, Number(payload.rating))); if (!id || !Number.isFinite(rating)) throw Object.assign(new Error('评分参数无效'), { statusCode: 400 });
        const item = await getDocument(env, 'tool_ratings', id) || { ratings: {} }; const ratings = { ...object(item.ratings), [session.user.uid]: rating }; const values = Object.values(ratings).map(Number).filter(Number.isFinite);
        await upsertDocument(env, 'tool_ratings', id, { ...item, ratings, avg: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10, count: values.length }); return { rating };
    }
    throw Object.assign(new Error('未知用户操作'), { statusCode: 400 });
}

export async function onRequestPost({ request, env }) {
    if (Number(request.headers.get('content-length') || 0) > 400000) return response(413, { ok: false, msg: '请求内容过大' });
    let payload; try { payload = await request.json(); } catch { return response(400, { ok: false, msg: '请求格式不正确' }); }
    try {
        const action = text(payload.action, 40); const adminActions = new Set(['savePageCopy', 'replaceCollection', 'addAnnouncement', 'updateAnnouncement', 'deleteAnnouncement', 'addArticle', 'updateArticle', 'deleteArticle', 'setResources', 'saveResourceCategory', 'deleteResourceCategory', 'approveCommunityPrompt', 'deleteCommunityPrompt', 'deleteSubscriber', 'updateMessage', 'deleteMessage']);
        const result = adminActions.has(action) ? await handleAdminMutation(env, payload) : await handleUserMutation(env, payload); return response(200, { ok: true, ...result });
    } catch (error) { return response(error.statusCode || 500, { ok: false, msg: error.message || '本地内容服务暂时不可用', code: error.code }); }
}
