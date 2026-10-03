import { localFeatureSession } from './local-firestore-store.mjs';
import { getPool, publicUser } from './local-auth-store.mjs';
import { previewAccountDeletion, deleteEmptyAccount } from './local-account-deletion.mjs';

const CORS_HEADERS = { 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
function response(status, body) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS_HEADERS } }); }
function adminOnly(session) { if (!session.user.isAdmin) { const error = new Error('当前账号没有管理员权限'); error.statusCode = 403; throw error; } }
export async function onRequestOptions() { return new Response(null, { status: 204, headers: CORS_HEADERS }); }
export async function onRequestPost({ request, env }) {
    let payload; try { payload = await request.json(); } catch { return response(400, { ok: false, msg: '请求格式不正确' }); }
    if (!payload || !['listUsers', 'previewDeleteUser', 'deleteUser'].includes(payload.action)) return response(400, { ok: false, msg: '未知管理操作' });
    try {
        const session = await localFeatureSession(env, payload.adminIdToken);
        adminOnly(session);
        if (payload.action === 'listUsers') {
            const [rows] = await getPool(env).execute(`
                SELECT a.uid, a.email, a.email_verified, a.display_name, a.disabled, a.created_at_iso,
                       p.name, p.phone, p.school, p.joined_at_iso
                FROM auth_users a LEFT JOIN user_profiles p ON p.uid = a.uid
                ORDER BY COALESCE(p.joined_at_iso, a.created_at_iso) DESC
            `);
            return response(200, { ok: true, users: rows.map(row => ({
                ...publicUser(row), disabled: row.disabled === 1,
                joinedAt: row.joined_at_iso || row.created_at_iso || ''
            })) });
        }
        const targetUid = String(payload.uid || '').trim();
        if (!targetUid) return response(400, { ok: false, msg: '迁移后的管理接口需要用户 UID' });
        if (targetUid === session.user.uid) return response(400, { ok: false, msg: '不能删除当前管理员账号' });
        if (targetUid.length > 128) return response(400, { ok: false, msg: '账号编号无效' });
        const result = payload.action === 'previewDeleteUser'
            ? await previewAccountDeletion(env, session.user.uid, targetUid)
            : await deleteEmptyAccount(env, session.user.uid, { ...payload, uid: targetUid });
        return response(200, { ok: true, ...result });
    } catch (error) { return response(error.statusCode || 500, { ok: false, msg: error.message || '用户管理服务暂时不可用', code: error.code }); }
}
