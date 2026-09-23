import assert from 'node:assert/strict';
import { createAuthActionToken, getPool } from '../server/local-auth-store.mjs';

const baseUrl = process.env.T_TRAINING_CANDIDATE_URL || 'http://127.0.0.1:3003';
const parsedBase = new URL(baseUrl);
if (!['127.0.0.1', 'localhost', '::1'].includes(parsedBase.hostname)) throw new Error('候选测试只允许访问本机回环地址');

const env = {
    T_TRAINING_DB_HOST: process.env.T_TRAINING_DB_HOST,
    T_TRAINING_DB_PORT: process.env.T_TRAINING_DB_PORT,
    T_TRAINING_DB_NAME: process.env.T_TRAINING_DB_NAME,
    T_TRAINING_DB_USER: process.env.T_TRAINING_DB_USER,
    T_TRAINING_DB_PASSWORD: process.env.T_TRAINING_DB_PASSWORD,
    T_TRAINING_AUTH_SECRET: process.env.T_TRAINING_AUTH_SECRET
};
const email = 'local-registration-candidate@example.invalid';
const password = 'CandidatePassword123!';
const newPassword = 'CandidatePassword456!';
const pool = getPool(env);
let uid = '';

async function post(body) {
    const response = await fetch(`${baseUrl}/api/auth-proxy`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    return { response, body: await response.json().catch(() => ({})) };
}

async function cleanup() {
    const [rows] = await pool.execute('SELECT uid FROM auth_users WHERE email=? OR uid=?', [email, uid || '__none__']);
    const uids = [...new Set(rows.map(row => row.uid).concat(uid ? [uid] : []))];
    for (const candidateUid of uids) {
        await pool.execute('DELETE FROM auth_sessions WHERE uid=?', [candidateUid]);
        await pool.execute('DELETE FROM auth_action_tokens WHERE uid=?', [candidateUid]);
        await pool.execute('DELETE FROM user_profiles WHERE uid=?', [candidateUid]);
        await pool.execute('DELETE FROM auth_users WHERE uid=?', [candidateUid]);
    }
}

try {
    await cleanup();
    let result = await post({ action: 'register', email, password, profile: { name: '本地注册候选测试', email, school: '测试学校' } });
    assert.equal(result.response.status, 200); uid = result.body.user.uid; assert.ok(uid); assert.equal(result.body.user.emailVerified, false);
    const accessToken = result.body.idToken;

    result = await post({ action: 'verify-email', idToken: accessToken, email });
    assert.equal(result.response.status, 200); assert.equal(result.body.sentTo, email);

    await pool.execute('UPDATE auth_action_tokens SET used_at=CURRENT_TIMESTAMP(3) WHERE uid=? AND action_type="verify_email" AND used_at IS NULL', [uid]);
    const verifyToken = await createAuthActionToken(env, uid, 'verify_email', email, 30);
    result = await post({ action: 'complete-local-email-action', mode: 'localVerifyEmail', token: verifyToken });
    assert.equal(result.response.status, 200);
    result = await post({ action: 'complete-local-email-action', mode: 'localVerifyEmail', token: verifyToken });
    assert.equal(result.response.status, 400);
    result = await post({ action: 'email-status', idToken: accessToken });
    assert.equal(result.response.status, 200); assert.equal(result.body.user.emailVerified, true);

    result = await post({ action: 'reset-password', email });
    assert.equal(result.response.status, 200);
    await pool.execute('UPDATE auth_action_tokens SET used_at=CURRENT_TIMESTAMP(3) WHERE uid=? AND action_type="reset_password" AND used_at IS NULL', [uid]);
    const resetToken = await createAuthActionToken(env, uid, 'reset_password', email, 30);
    result = await post({ action: 'complete-local-email-action', mode: 'localResetPassword', token: resetToken });
    assert.equal(result.response.status, 200); assert.equal(result.body.needsPassword, true);
    result = await post({ action: 'complete-local-email-action', mode: 'localResetPassword', token: resetToken, newPassword });
    assert.equal(result.response.status, 200); assert.equal(result.body.needsPassword, false);
    result = await post({ action: 'complete-local-email-action', mode: 'localResetPassword', token: resetToken, newPassword });
    assert.equal(result.response.status, 400);
    result = await post({ action: 'login', email, password });
    assert.equal(result.response.status, 400);
    result = await post({ action: 'login', email, password: newPassword });
    assert.equal(result.response.status, 200); assert.equal(result.body.user.emailVerified, true);

    console.log('本地注册/邮箱候选回归通过：注册、发信、单次验证、密码重置与新密码登录共 14 项断言。');
} finally {
    await cleanup();
    await pool.end();
}
