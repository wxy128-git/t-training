#!/usr/bin/env node
// 可选集成回归。仅允许本机模拟器，不可指向线上数据库。
import assert from 'node:assert/strict';
import '../../js/account-policy.js';
const host = process.env.FIRESTORE_EMULATOR_HOST;
assert.match(host || '', /^(127\.0\.0\.1|localhost):\d+$/, '请先设置本机 FIRESTORE_EMULATOR_HOST');
const project = 'demo-t-training-email';
const base = `http://${host}/v1/projects/${project}/databases/(default)/documents`;
const uid = `email-qa-${Date.now()}`, other = `${uid}-other`;
let passed = 0;
const created = new Set();
const email = 'teacher@example.invalid';
const profile = { name: '测试教师', email: '', phone: '13800138000', school: '原学校', isAdmin: false, joinedAt: '2025-01-01T00:00:00.000Z' };
const fields = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k,
    v instanceof Date ? { timestampValue: v.toISOString() }
        : typeof v === 'number' ? { integerValue: String(v) }
            : typeof v === 'boolean' ? { booleanValue: v } : { stringValue: v }
]));
function token(verified, mail = email, id = uid) {
    const now = Math.floor(Date.now() / 1000);
    const payload = { iss: `https://securetoken.google.com/${project}`, aud: project, sub: id, user_id: id, iat: now, exp: now + 3600, auth_time: now, email: mail, email_verified: verified, firebase: { sign_in_provider: 'password', identities: { email: [mail] } } };
    return Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify(payload)).toString('base64url') + '.';
}
async function call(path, auth, data, expected, label, method = data ? 'PATCH' : 'GET') {
    const response = await fetch(`${base}/${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` }, body: data ? JSON.stringify({ fields: fields(data) }) : undefined });
    const text = await response.text();
    if (method === 'PATCH' && response.ok) created.add(path);
    assert.equal(response.status, expected, `${label}: ${text}`); passed++;
}
try {
    await call(`users/${uid}`, token(false), profile, 200, '未验证用户可创建自己的基本资料');
    await call(`users/${uid}`, token(false), null, 200, '未验证用户可读取自己的资料以完成绑定');
    await call(`users/${other}`, 'owner', { ...profile, name: '他人资料' }, 200, '建立他人资料测试样本');
    await call(`users/${other}`, token(false), null, 403, '不能读取他人资料');
    const work = { uid, title: '绑定前作品', content: '原内容' };
    await call(`works/${uid}`, 'owner', work, 200, '建立原作品样本');
    await call(`works/${uid}`, token(false), null, 403, '未验证用户不能读取作品');
    await call(`works/${uid}-new`, token(false), work, 403, '未验证用户不能新建作品');
    await call(`works/${uid}`, token(false), { ...work, content: '修改' }, 403, '未验证用户不能修改作品');
    await call(`works/${uid}`, token(false), null, 403, '未验证用户不能删除作品', 'DELETE');
    await call(`works/${uid}`, token(true, 'tel_13800138000@XYLAOSHI.TEL'), null, 403, '占位邮箱即使标记已验证也不能读取作品');
    await call(`users/${uid}`, token(false), { ...profile, email }, 403, '未验证用户不能提前修改资料邮箱');
    await call(`users/${uid}`, token(true), { ...profile, email }, 200, '已验证邮箱可同步到原用户资料');
    await call(`users/${uid}`, token(true), { ...profile, email: 'forged@example.invalid' }, 403, '资料邮箱必须与认证身份一致');
    await call(`users/${uid}`, token(true), { ...profile, email, phone: '13900139000' }, 403, '绑定不能改写原手机号');
    await call(`users/${uid}`, token(true), { ...profile, email, isAdmin: true }, 403, '不能借绑定提升为管理员');
    await call(`works/${uid}`, token(true), null, 200, '验证后可读取原作品');
    await call(`works/${uid}`, token(true, email, other), null, 403, '验证后仍不能读取他人的作品');
    await call(`works/${uid}-new`, token(true), work, 200, '验证后可正常保存作品');
    const subscriber = { email, subscribedAt: new Date().toISOString() };
    await call(`subscribers/${uid}`, token(false), subscriber, 403, '未验证用户不能直接登记邮箱');
    await call(`subscribers/${uid}`, token(true), subscriber, 200, '验证后可登记邮箱');
    const contact = { contact: email, createdAt: new Date(), handled: false, message: '测试留言', name: '教师', page: '/', userEmail: email, userId: uid, userPhone: '' };
    await call(`contact_messages/${uid}`, token(false), contact, 403, '未验证用户不能直接留言');
    await call(`contact_messages/${uid}`, token(true), contact, 200, '验证后可正常留言');
    const usage = { count: 1, updatedAt: new Date() };
    await call(`agent_usage/${uid}`, token(false), usage, 403, '未验证用户不能写入使用次数');
    await call(`agent_usage/${uid}`, token(true), usage, 200, '验证后可正常记录使用次数');
    const adminToken = token(false, 'admin@xylaoshi.com', AccountPolicy.ADMIN_UID);
    await call(`tools/${uid}`, adminToken, { title: '工具' }, 200, '原管理员无需验证占位邮箱即可管理内容');
    await call(`users/${other}`, adminToken, null, 200, '原管理员可读取用户资料');
    await call(`works/${uid}-admin`, adminToken, { ...work, uid: AccountPolicy.ADMIN_UID }, 200, '原管理员可保存自己的作品');
    await call(`works/${uid}-admin`, adminToken, null, 200, '原管理员可读取自己的作品');
    await call(`tools/${uid}`, token(true, 'new-admin@example.invalid', AccountPolicy.ADMIN_UID), { title: '工具' }, 200, '管理员换绑邮箱后保留原权限');
    await call(`tools/${uid}`, token(true, 'admin@xylaoshi.com'), { title: '工具' }, 403, '旧邮箱不能把管理权限转给他人');
    console.log(`Firestore 邮箱规则通过：${passed} 项模拟器断言。`);
} finally {
    for (const path of created) {
        const response = await fetch(`${base}/${path}`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
        assert.ok(response.ok, `清理失败：${path}`);
    }
}
