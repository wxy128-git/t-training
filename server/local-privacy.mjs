import '../js/privacy-policy.js';
import {getPool, readLocalAccessToken} from './local-auth-store.mjs';
export function parsePrivacy(value) {
    if (value && typeof value === 'object') return value;
    try { return JSON.parse(value || 'null'); } catch { return null; }
}
export async function readPrivacy(env, uid) {
    const [rows] = await getPool(env).execute('SELECT privacy_json FROM user_profiles WHERE uid=?', [uid]);
    return parsePrivacy(rows[0]?.privacy_json);
}
export async function savePrivacy(env, uid, input) {
    const connection = await getPool(env).getConnection();
    try {
        await connection.beginTransaction();
        const [rows] = await connection.execute('SELECT privacy_json FROM user_profiles WHERE uid=? FOR UPDATE', [uid]);
        if (!rows[0]) throw Object.assign(new Error('用户资料不存在，请联系管理员'), {statusCode:409});
        const privacy = globalThis.PrivacyPolicy.update(parsePrivacy(rows[0].privacy_json), input);
        await connection.execute('UPDATE user_profiles SET privacy_json=? WHERE uid=?', [JSON.stringify(privacy), uid]);
        await connection.commit();
        return privacy;
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
}
const reply = (status, body) => new Response(JSON.stringify(body), {status, headers:{'Content-Type':'application/json', 'Cache-Control':'no-store'}});
export async function onRequestPost({request, env}) {
    try {
        const payload = await request.json();
        const session = await readLocalAccessToken(env, payload.idToken);
        if (!session) return reply(401, {ok:false,msg:'请先登录'});
        if (!['get','save'].includes(payload.action)) return reply(400,{ok:false,msg:'未知隐私操作'});
        const privacy = payload.action === 'save' ? await savePrivacy(env, session.user.uid, payload.choice) : await readPrivacy(env, session.user.uid);
        return reply(200,{ok:true,privacy,version:globalThis.PrivacyPolicy.VERSION});
    } catch (error) { return reply(error.statusCode || 500,{ok:false,msg:error.statusCode ? error.message : '隐私设置暂时不可用，请稍后重试'}); }
}
export async function onRequestOptions() {return new Response(null,{status:204});}

// Compatibility for callers of the previous consent-gated writer: no DB access.
export async function storeConsentedEvent() { return false; }
