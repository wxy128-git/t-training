import { localFeatureSession, listDocuments } from './local-firestore-store.mjs';
import { getPool, findUserByUid, publicUser } from './local-auth-store.mjs';

const CORS_HEADERS = { 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
function response(status, body) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS_HEADERS } }); }
function adminOnly(session) { if (!session.user.isAdmin) { const error = new Error('当前账号没有管理员权限'); error.statusCode = 403; throw error; } }
export async function onRequestOptions() { return new Response(null, { status: 204, headers: CORS_HEADERS }); }
export async function onRequestPost({ request, env }) {
    let payload; try { payload = await request.json(); } catch { return response(400, { ok: false, msg: '请求格式不正确' }); }
    if (!['listUsers', 'deleteUser'].includes(payload.action)) return response(400, { ok: false, msg: '未知管理操作' });
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
        if (!await findUserByUid(env, targetUid)) return response(404, { ok: false, msg: '没有找到这个账号' });
        // Firebase 仍处于回滚源阶段；删除动作必须等双写切换完成，避免只删一侧造成账号复现。
        return response(409, { ok: false, code: 'MIGRATION_DELETE_PENDING', msg: '迁移并行阶段暂不执行删除，请完成正式切换后再操作。' });
    } catch (error) { return response(error.statusCode || 500, { ok: false, msg: error.message || '用户管理服务暂时不可用', code: error.code }); }
}
