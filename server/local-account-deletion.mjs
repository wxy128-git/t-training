import crypto from 'node:crypto';
import { publicUser, withAccountTransaction, deletedAccountKey } from './local-auth-store.mjs';

const error = (statusCode, message, code = 'DELETE_CONFLICT') => Object.assign(new Error(message), { statusCode, code });
const fingerprint = row => crypto.createHash('sha256').update(JSON.stringify([
    row.uid, row.email || '', row.name || '', row.phone || '', row.school || '', row.created_at_iso || ''
])).digest('hex');
const signature = (env, data) => crypto.createHmac('sha256', env.T_TRAINING_AUTH_SECRET).update(data).digest('base64url');

async function inspect(connection, uid) {
    const [rows] = await connection.execute(`
        SELECT a.*, p.name, p.phone, p.school, p.joined_at_iso
        FROM auth_users a LEFT JOIN user_profiles p ON p.uid = a.uid
        WHERE a.uid = ? LIMIT 1 FOR UPDATE
    `, [uid]);
    const row = rows[0];
    if (!row) throw error(404, '账号已不存在，请刷新用户列表', 'ACCOUNT_NOT_FOUND');
    if (publicUser(row).isAdmin) throw error(403, '不能删除管理员账号', 'ADMIN_PROTECTED');
    // Counts only: never put workbook/post text in the preview or operational log.
    const [counts] = await connection.execute(`
        SELECT collection_name, COUNT(*) AS total FROM firestore_documents
        WHERE collection_name NOT IN ('users','analytics_events','contact_messages','subscribers')
          AND (JSON_UNQUOTE(JSON_EXTRACT(fields_json, '$.uid.stringValue')) = ?
            OR JSON_UNQUOTE(JSON_EXTRACT(fields_json, '$.userId.stringValue')) = ?
            OR JSON_UNQUOTE(JSON_EXTRACT(fields_json, '$.authorId.stringValue')) = ?)
        GROUP BY collection_name
    `, [uid, uid, uid]);
    const content = { works: 0, posts: 0, other: 0 };
    for (const item of counts) content[item.collection_name === 'works' ? 'works' : item.collection_name === 'community_prompts' ? 'posts' : 'other'] += Number(item.total);
    return { row, content, blocked: Object.values(content).some(Boolean) };
}

export async function previewAccountDeletion(env, actor, uid) {
    return withAccountTransaction(env, uid, async connection => {
        const { row, content, blocked } = await inspect(connection, uid);
        const user = publicUser(row);
        const data = Buffer.from(JSON.stringify({ uid, actor, fingerprint: fingerprint(row), expires: Date.now() + 10 * 60 * 1000 })).toString('base64url');
        return { user, content, blocked, confirmation: user.email || user.phone || user.uid,
            ticket: blocked ? '' : `${data}.${signature(env, data)}` };
    });
}

export async function deleteEmptyAccount(env, actor, payload) {
    if (typeof payload.ticket !== 'string' || payload.ticket.length > 2000) throw error(409, '请先重新核对待删除账号', 'DELETE_PREVIEW_REQUIRED');
    let ticket;
    try {
        const [data, mac, extra] = payload.ticket.split('.');
        const expected = signature(env, data);
        if (extra || !mac || mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) throw new Error();
        ticket = JSON.parse(Buffer.from(data, 'base64url').toString());
        if (ticket.actor !== actor || ticket.uid !== payload.uid || !Number.isFinite(ticket.expires) || ticket.expires < Date.now()) throw new Error();
    } catch { throw error(409, '确认信息已失效，请重新核对账号', 'DELETE_PREVIEW_REQUIRED'); }
    return withAccountTransaction(env, payload.uid, async connection => {
        const { row, blocked } = await inspect(connection, payload.uid);
        if (blocked) throw error(409, '该账号已有备课本或投稿等内容，暂不能删除；请重新查看关联数量', 'ACCOUNT_HAS_CONTENT');
        if (fingerprint(row) !== ticket.fingerprint) throw error(409, '账号资料已变化，请重新核对后操作');
        const user = publicUser(row);
        if (payload.confirmation !== (user.email || user.phone || user.uid)) throw error(400, '输入的账号与待删除账号不一致', 'CONFIRMATION_MISMATCH');
        // Existing migration metadata table: hashed old UID + time only, no email,
        // phone, password or content. A new registration receives a new UID.
        await connection.execute('INSERT INTO migration_meta (meta_key, meta_value) VALUES (?, ?)',
            [deletedAccountKey(row.uid), JSON.stringify({ deletedAt: new Date().toISOString() })]);
        await connection.execute('DELETE FROM auth_sessions WHERE uid = ?', [row.uid]);
        await connection.execute('DELETE FROM auth_action_tokens WHERE uid = ?', [row.uid]);
        await connection.execute('DELETE FROM user_profiles WHERE uid = ?', [row.uid]);
        await connection.execute("DELETE FROM firestore_documents WHERE collection_name = 'users' AND document_id = ?", [row.uid]);
        await connection.execute('DELETE FROM auth_users WHERE uid = ?', [row.uid]);
        return { deleted: true, uid: row.uid };
    });
}
