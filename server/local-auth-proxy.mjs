import crypto from 'node:crypto';
import '../js/account-policy.js';
import {
    callFirebaseAuth,
    firebaseRefresh,
    findUserByEmail,
    findUserByUid,
    cleanText,
    normalizeEmail,
    realEmail,
    publicUser,
    canUseFeatures,
    assertCanUseFeatures,
    upsertFirebaseAccount,
    upsertProfile,
    setLocalPassword,
    createLocalAccount,
    createAuthActionToken,
    readAuthActionToken,
    consumeAuthActionToken,
    hashPassword,
    verifyPassword,
    issueLocalSession,
    readLocalAccessToken,
    rotateLocalSession,
    localLogout,
    getPool
} from './local-auth-store.mjs';
import { sendVerificationMail, sendPasswordResetMail } from './local-mailer.mjs';

const CORS_HEADERS = {
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMITS = { login: 15, register: 6, 'reset-password': 4, refresh: 60, logout: 60, subscribe: 10, 'email-status': 60, 'verify-email': 12, 'complete-email-action': 300, 'complete-local-email-action': 300 };
const buckets = new Map();

function jsonResponse(status, body) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS_HEADERS }
    });
}

function retryAfter(request, action, account = '') {
    const limit = RATE_LIMITS[action];
    if (!limit) return 0;
    const ip = cleanText(request.headers.get('CF-Connecting-IP') || 'unknown', 64);
    const keys = [`${action}:ip:${ip}`];
    if (account) keys.push(`${action}:account:${normalizeEmail(account)}`);
    let retry = 0;
    const now = Date.now();
    for (const key of keys) {
        const recent = (buckets.get(key) || []).filter(time => now - time < RATE_WINDOW_MS);
        if (recent.length >= limit) retry = Math.max(retry, Math.ceil((RATE_WINDOW_MS - (now - recent[0])) / 1000));
        else recent.push(now);
        buckets.set(key, recent);
    }
    return retry;
}

function errorInfo(code) {
    const messages = {
        EMAIL_EXISTS: '该账号已被注册，请直接登录',
        EMAIL_NOT_FOUND: '账号不存在，请先注册',
        INVALID_PASSWORD: '账号或密码错误',
        INVALID_LOGIN_CREDENTIALS: '账号或密码错误',
        INVALID_EMAIL: '邮箱格式不正确',
        WEAK_PASSWORD: '密码强度不足，请使用至少 6 位密码',
        USER_DISABLED: '该账号已被停用',
        TOO_MANY_ATTEMPTS_TRY_LATER: '请求过于频繁，请稍后重试',
        INVALID_ID_TOKEN: '登录状态已过期，请重新登录',
        TOKEN_EXPIRED: '登录状态已过期，请重新登录',
        CREDENTIAL_TOO_OLD_LOGIN_AGAIN: '请重新输入密码后再发送验证邮件',
        INVALID_OOB_CODE: '验证链接无效，请重新发送验证邮件',
        EXPIRED_OOB_CODE: '验证链接已过期，请重新发送验证邮件',
        PASSWORD_DOES_NOT_MEET_REQUIREMENTS: '新密码不符合安全要求，请换一个密码'
    };
    const message = messages[code] || '认证服务暂时不可用，请稍后重试';
    const status = ['EMAIL_EXISTS', 'EMAIL_NOT_FOUND', 'INVALID_PASSWORD', 'INVALID_LOGIN_CREDENTIALS', 'INVALID_EMAIL', 'WEAK_PASSWORD', 'USER_DISABLED', 'TOO_MANY_ATTEMPTS_TRY_LATER', 'PASSWORD_DOES_NOT_MEET_REQUIREMENTS'].includes(code) ? 400 : (['INVALID_ID_TOKEN', 'TOKEN_EXPIRED', 'CREDENTIAL_TOO_OLD_LOGIN_AGAIN'].includes(code) ? 401 : 502);
    return { message, status };
}

function mapError(error) {
    const code = error?.code || 'LOCAL_AUTH_ERROR';
    const mapped = errorInfo(code);
    return { status: error?.statusCode || mapped.status, body: { ok: false, msg: error?.message && code === 'LOCAL_AUTH_SECRET_MISSING' ? error.message : (mapped.message || error?.message), code, reauthRequired: code === 'CREDENTIAL_TOO_OLD_LOGIN_AGAIN' } };
}

function maskEmail(value) {
    const email = normalizeEmail(value);
    const at = email.lastIndexOf('@');
    if (at <= 0) return '';
    const local = email.slice(0, at);
    return `${local.slice(0, Math.min(2, local.length))}${'*'.repeat(Math.max(2, Math.min(6, local.length - 2)))}${email.slice(at)}`;
}

function cleanProfile(profile) {
    const value = profile && typeof profile === 'object' ? profile : {};
    return {
        name: cleanText(value.name, 80),
        email: realEmail(value.email),
        phone: cleanText(value.phone, 20),
        school: cleanText(value.school, 120),
        isAdmin: false,
        joinedAt: cleanText(value.joinedAt, 64) || new Date().toISOString()
    };
}

async function accountFromLocalToken(env, idToken) {
    const session = await readLocalAccessToken(env, idToken);
    if (!session) {
        const error = new Error('登录状态已过期，请重新登录');
        error.statusCode = 401;
        error.code = 'INVALID_ID_TOKEN';
        throw error;
    }
    return session;
}

async function localLogin(env, email, password) {
    let row = await findUserByEmail(env, email);
    let authData = null;
    if (row?.disabled) {
        const error = new Error('USER_DISABLED');
        error.code = 'USER_DISABLED';
        throw error;
    }
    if (row?.local_password_hash) {
        if (!verifyPassword(password, row.local_password_hash, row.local_password_salt, row.local_password_scheme)) {
            const error = new Error('INVALID_LOGIN_CREDENTIALS');
            error.code = 'INVALID_LOGIN_CREDENTIALS';
            throw error;
        }
    } else {
        // 首次登录迁移：Firebase 只负责验证这一次密码，明文不会进入数据库。
        authData = await callFirebaseAuth('accounts:signInWithPassword', { email, password, returnSecureToken: true });
        if (row && authData.localId !== row.uid) {
            const error = new Error('INVALID_LOGIN_CREDENTIALS');
            error.code = 'INVALID_LOGIN_CREDENTIALS';
            throw error;
        }
        row = await upsertFirebaseAccount(env, authData, row ? {
            name: row.name,
            email: realEmail(authData.email || row.email),
            phone: row.phone,
            school: row.school,
            joinedAt: row.joined_at_iso
        } : {});
        await setLocalPassword(env, row.uid, password);
        row = await findUserByUid(env, row.uid);
    }
    if (!row) throw new Error('账号不存在，请先注册');
    const user = publicUser(row);
    const session = await issueLocalSession(env, row.uid);
    return { ...session, user, authBackend: 'local' };
}

function validLoginIdentifier(email) {
    return Boolean(realEmail(email) || /^tel_1[3-9]\d{9}@xylaoshi\.tel$/.test(normalizeEmail(email)));
}

async function localRegister(env, email, password, profile) {
    const existing = await findUserByEmail(env, email);
    if (existing) {
        const error = new Error('EMAIL_EXISTS');
        error.code = 'EMAIL_EXISTS';
        throw error;
    }
    const safeProfile = cleanProfile({ ...profile, email });
    if (env.T_TRAINING_REGISTRATION_BACKEND === 'local') {
        const row = await createLocalAccount(env, email, password, safeProfile);
        return { ...(await issueLocalSession(env, row.uid)), user: publicUser(row), authBackend: 'local' };
    }
    // 过渡期仍在 Firebase 创建账号，以保留验证邮件和原有邮箱操作链路；登录会话和密码哈希由腾讯管理。
    const authData = await callFirebaseAuth('accounts:signUp', { email, password, returnSecureToken: true });
    const row = await upsertFirebaseAccount(env, { ...authData, email, emailVerified: false }, safeProfile);
    await setLocalPassword(env, row.uid, password);
    await upsertProfile(env, row.uid, safeProfile);
    const fresh = await findUserByUid(env, row.uid);
    return { ...(await issueLocalSession(env, row.uid)), user: publicUser(fresh), authBackend: 'local' };
}

async function refreshLocalOrFirebase(env, refreshToken) {
    const localSession = await rotateLocalSession(env, refreshToken);
    if (localSession) {
        const row = await findUserByUid(env, localSession.uid);
        return { idToken: localSession.idToken, refreshToken: localSession.refreshToken, expiresIn: localSession.expiresIn, user: publicUser(row), authBackend: 'local' };
    }
    const firebase = await firebaseRefresh(refreshToken);
    const lookup = await callFirebaseAuth('accounts:lookup', { idToken: firebase.idToken });
    const authUser = lookup.users?.[0];
    if (!authUser?.localId) throw Object.assign(new Error('登录状态已过期，请重新登录'), { statusCode: 401, code: 'INVALID_ID_TOKEN' });
    const row = await upsertFirebaseAccount(env, authUser);
    const fresh = await findUserByUid(env, row.uid);
    const issued = await issueLocalSession(env, row.uid);
    return { ...issued, user: publicUser(fresh), authBackend: 'local' };
}

async function completeFirebaseEmailAction(env, mode, oobCode, newPassword) {
    if (mode === 'resetPassword') {
        const result = await callFirebaseAuth('accounts:resetPassword', newPassword ? { oobCode, newPassword } : { oobCode });
        if (newPassword && result.email) {
            const row = await findUserByEmail(env, result.email);
            if (row) await setLocalPassword(env, row.uid, newPassword);
        }
        return { email: result.email, msg: newPassword ? '密码已更新，请使用新密码登录' : '链接有效，请设置新密码', needsPassword: !newPassword };
    }
    const result = await callFirebaseAuth('accounts:update', { oobCode });
    if (result.email || result.localId) {
        const row = result.localId ? await findUserByUid(env, result.localId) : await findUserByEmail(env, result.email);
        if (row) await updateLocalRecovery(env, row.uid, result.email || row.email, true);
    }
    return { email: result.email, msg: mode === 'recoverEmail' ? '邮箱地址已恢复，请重新登录' : '邮箱验证成功，请返回网站登录或继续使用', needsPassword: false };
}

async function updateLocalRecovery(env, uid, email, verified) {
    const pool = getPool(env);
    await pool.execute('UPDATE auth_users SET email = ?, email_verified = ? WHERE uid = ?', [normalizeEmail(email), verified ? 1 : 0, uid]);
    await pool.execute('UPDATE user_profiles SET email = ? WHERE uid = ?', [normalizeEmail(email), uid]);
}

function localEmailEnabled(env) { return env.T_TRAINING_EMAIL_BACKEND === 'local'; }

async function verifyCurrentPassword(env, row, password) {
    if (!password) return false;
    if (row.local_password_hash) return verifyPassword(password, row.local_password_hash, row.local_password_salt, row.local_password_scheme);
    const authData = await callFirebaseAuth('accounts:signInWithPassword', { email: normalizeEmail(row.email), password, returnSecureToken: true });
    if (authData.localId !== row.uid) return false;
    await setLocalPassword(env, row.uid, password);
    return true;
}

async function sendLocalVerifyEmail(env, session, payload) {
    const row = session.row;
    const target = realEmail(payload.email);
    if (!target) throw Object.assign(new Error('请填写能够接收邮件的有效邮箱，不能使用手机号或占位邮箱'), { statusCode: 400, code: 'INVALID_EMAIL' });
    if (row.email_verified === 1 && normalizeEmail(row.email) === target) return { alreadyVerified: true, user: publicUser(row) };
    const duplicate = await findUserByEmail(env, target);
    if (duplicate && duplicate.uid !== row.uid) throw Object.assign(new Error('该邮箱已绑定其他账号，请换一个邮箱'), { statusCode: 400, code: 'EMAIL_EXISTS' });
    const freshSession = Number(session.token?.iat || 0) >= Math.floor(Date.now() / 1000) - 10 * 60;
    if (!freshSession && !await verifyCurrentPassword(env, row, payload.password)) {
        throw Object.assign(new Error('请重新输入当前密码后再发送验证邮件'), { statusCode: 401, code: 'CREDENTIAL_TOO_OLD_LOGIN_AGAIN' });
    }
    const token = await createAuthActionToken(env, row.uid, 'verify_email', target, 30, { previousEmail: normalizeEmail(row.email) });
    await sendVerificationMail(env, { to: target, token });
    return { sentTo: target, retryAfter: 60, msg: '验证邮件已发送。请点击邮件中的链接，再回到此页面确认。' };
}

async function requestLocalPasswordReset(env, email) {
    const row = await findUserByEmail(env, email);
    if (!row || !realEmail(row.email)) return;
    const token = await createAuthActionToken(env, row.uid, 'reset_password', row.email, 30);
    await sendPasswordResetMail(env, { to: row.email, token });
}

function invalidLocalAction() {
    return Object.assign(new Error('验证链接无效或已经过期，请重新发送邮件'), { statusCode: 400, code: 'INVALID_OOB_CODE' });
}

async function completeLocalEmailAction(env, mode, token, newPassword) {
    if (mode === 'localVerifyEmail') {
        const consumed = await consumeAuthActionToken(env, token, 'verify_email', async (connection, row) => {
            const [duplicates] = await connection.execute('SELECT uid FROM auth_users WHERE LOWER(email)=LOWER(?) AND uid<>? LIMIT 1', [row.target_email, row.uid]);
            if (duplicates[0]) throw Object.assign(new Error('该邮箱已绑定其他账号，请重新选择邮箱'), { statusCode: 400, code: 'EMAIL_EXISTS' });
            await connection.execute('UPDATE auth_users SET email=?, email_verified=1 WHERE uid=?', [row.target_email, row.uid]);
            await connection.execute('UPDATE user_profiles SET email=? WHERE uid=?', [row.target_email, row.uid]);
            return { email: row.target_email };
        });
        if (!consumed) throw invalidLocalAction();
        return { email: consumed.value.email, msg: '邮箱验证成功，请返回网站继续使用', needsPassword: false };
    }
    if (mode === 'localResetPassword') {
        const action = await readAuthActionToken(env, token, 'reset_password');
        if (!action) throw invalidLocalAction();
        if (!newPassword) return { email: action.target_email, msg: '链接有效，请设置新密码', needsPassword: true };
        const passwordRecord = hashPassword(newPassword);
        const consumed = await consumeAuthActionToken(env, token, 'reset_password', async (connection, row) => {
            await connection.execute(`
                UPDATE auth_users SET local_password_hash=?, local_password_salt=?, local_password_scheme=?,
                  local_password_migrated_at=CURRENT_TIMESTAMP(), password_updated_at_iso=? WHERE uid=?
            `, [passwordRecord.hash, passwordRecord.salt, passwordRecord.scheme, new Date().toISOString(), row.uid]);
            await connection.execute('UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP(3) WHERE uid=? AND revoked_at IS NULL', [row.uid]);
            return { email: row.target_email };
        });
        if (!consumed) throw invalidLocalAction();
        return { email: consumed.value.email, msg: '密码已更新，请使用新密码登录', needsPassword: false };
    }
    throw invalidLocalAction();
}

async function sendVerifyEmail(env, row, payload) {
    const target = realEmail(payload.email);
    if (!target) {
        const error = new Error('请填写能够接收邮件的有效邮箱，不能使用手机号或占位邮箱');
        error.statusCode = 400;
        error.code = 'INVALID_EMAIL';
        throw error;
    }
    if (row.email_verified === 1 && normalizeEmail(row.email) === target) return { alreadyVerified: true, user: publicUser(row) };
    if (!payload.password) {
        const error = new Error('请重新输入当前密码后再发送验证邮件');
        error.statusCode = 401;
        error.code = 'CREDENTIAL_TOO_OLD_LOGIN_AGAIN';
        throw error;
    }
    const authData = await callFirebaseAuth('accounts:signInWithPassword', { email: normalizeEmail(row.email), password: payload.password, returnSecureToken: true });
    if (authData.localId !== row.uid) throw Object.assign(new Error('账号核验失败，请重新登录'), { statusCode: 401, code: 'INVALID_ID_TOKEN' });
    const changingEmail = target !== normalizeEmail(row.email);
    await callFirebaseAuth('accounts:sendOobCode', changingEmail
        ? { requestType: 'VERIFY_AND_CHANGE_EMAIL', idToken: authData.idToken, newEmail: target }
        : { requestType: 'VERIFY_EMAIL', idToken: authData.idToken, email: target });
    return { sentTo: target, retryAfter: 60, msg: '验证邮件已发送。请点击邮件中的链接，再回到此页面确认。' };
}

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost({ request, env }) {
    let payload;
    try { payload = await request.json(); } catch { return jsonResponse(400, { ok: false, msg: '请求格式不正确' }); }
    const action = cleanText(payload?.action, 40);
    if (!Object.hasOwn(RATE_LIMITS, action)) return jsonResponse(400, { ok: false, msg: '未知认证操作' });
    const retry = retryAfter(request, action, action === 'refresh' ? '' : payload?.email);
    if (retry) return jsonResponse(429, { ok: false, msg: `请求过于频繁，请约 ${retry} 秒后再试`, retryAfter: retry });

    try {
        if (action === 'login') {
            const email = normalizeEmail(payload.email);
            if (!validLoginIdentifier(email) || typeof payload.password !== 'string' || payload.password.length < 6 || payload.password.length > 256) return jsonResponse(400, { ok: false, msg: '请填写有效账号和至少 6 位密码' });
            return jsonResponse(200, { ok: true, ...(await localLogin(env, email, payload.password)) });
        }
        if (action === 'register') {
            const email = realEmail(payload.email);
            const profile = cleanProfile(payload.profile);
            if (!email || typeof payload.password !== 'string' || payload.password.length < 6 || payload.password.length > 256) return jsonResponse(400, { ok: false, msg: '请填写有效邮箱和至少 6 位密码' });
            if (!profile.name) return jsonResponse(400, { ok: false, msg: '请填写姓名' });
            return jsonResponse(200, { ok: true, ...(await localRegister(env, email, payload.password, profile)) });
        }
        if (action === 'refresh') {
            if (!payload.refreshToken) return jsonResponse(400, { ok: false, msg: '缺少刷新令牌' });
            return jsonResponse(200, { ok: true, ...(await refreshLocalOrFirebase(env, payload.refreshToken)) });
        }
        if (action === 'email-status' || action === 'verify-email') {
            const session = await accountFromLocalToken(env, payload.idToken);
            if (action === 'email-status') return jsonResponse(200, { ok: true, user: session.user });
            const result = localEmailEnabled(env)
                ? await sendLocalVerifyEmail(env, session, payload)
                : await sendVerifyEmail(env, session.row, payload);
            const fresh = await findUserByUid(env, session.row.uid);
            return jsonResponse(200, { ok: true, ...result, user: publicUser(fresh) });
        }
        if (action === 'logout') {
            if (payload.idToken) await localLogout(env, payload.idToken);
            return jsonResponse(200, { ok: true });
        }
        if (action === 'complete-email-action') {
            const mode = cleanText(payload.mode, 40);
            const oobCode = cleanText(payload.oobCode, 2048);
            if (!new Set(['verifyEmail', 'verifyAndChangeEmail', 'recoverEmail', 'resetPassword']).has(mode) || !/^[A-Za-z0-9_-]{10,2048}$/.test(oobCode)) return jsonResponse(400, { ok: false, msg: '验证链接不完整或格式不正确' });
            const nextPassword = typeof payload.newPassword === 'string' ? payload.newPassword : '';
            if (nextPassword && (nextPassword.length < 6 || nextPassword.length > 256)) return jsonResponse(400, { ok: false, msg: '新密码至少需要 6 位' });
            const result = await completeFirebaseEmailAction(env, mode, oobCode, nextPassword);
            return jsonResponse(200, { ok: true, ...result, email: maskEmail(result.email) });
        }
        if (action === 'complete-local-email-action') {
            const mode = cleanText(payload.mode, 40);
            const token = cleanText(payload.token, 256);
            if (!localEmailEnabled(env) || !new Set(['localVerifyEmail', 'localResetPassword']).has(mode) || !/^[A-Za-z0-9_-]{40,128}$/.test(token)) return jsonResponse(400, { ok: false, msg: '验证链接不完整或格式不正确' });
            const nextPassword = typeof payload.newPassword === 'string' ? payload.newPassword : '';
            if (nextPassword && (nextPassword.length < 6 || nextPassword.length > 256)) return jsonResponse(400, { ok: false, msg: '新密码至少需要 6 位' });
            const result = await completeLocalEmailAction(env, mode, token, nextPassword);
            return jsonResponse(200, { ok: true, ...result, email: maskEmail(result.email) });
        }
        if (action === 'reset-password') {
            const email = normalizeEmail(payload.email);
            if (!realEmail(email)) return jsonResponse(400, { ok: false, msg: '请输入有效的邮箱地址' });
            if (localEmailEnabled(env)) await requestLocalPasswordReset(env, email);
            else try { await callFirebaseAuth('accounts:sendOobCode', { requestType: 'PASSWORD_RESET', email }); } catch (error) { if (error.code !== 'EMAIL_NOT_FOUND') throw error; }
            return jsonResponse(200, { ok: true, msg: '如果该邮箱已注册，密码重置链接将发送到邮箱，请留意收件箱和垃圾邮件箱。' });
        }
        if (action === 'subscribe') {
            const session = await accountFromLocalToken(env, payload.idToken);
            assertCanUseFeatures(session.user);
            const email = realEmail(payload.email);
            if (!email) return jsonResponse(400, { ok: false, msg: '请输入有效邮箱地址' });
            const documentId = crypto.createHash('sha256').update(email).digest('hex');
            const fields = { email: { stringValue: email }, subscribedAt: { stringValue: new Date().toISOString() } };
            await getPool(env).execute(`
                INSERT INTO firestore_documents (collection_name, document_id, document_name, fields_json, raw_json)
                VALUES ('subscribers', ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE fields_json=VALUES(fields_json), raw_json=VALUES(raw_json), imported_at=CURRENT_TIMESTAMP()
            `, [documentId, `projects/xylaoshi-28f6c/databases/(default)/documents/subscribers/${documentId}`, JSON.stringify(fields), JSON.stringify({ fields })]);
            return jsonResponse(200, { ok: true, msg: '邮箱已登记，通知服务开放后会发送更新' });
        }
        return jsonResponse(400, { ok: false, msg: '未知认证操作' });
    } catch (error) {
        const mapped = mapError(error);
        return jsonResponse(mapped.status, mapped.body);
    }
}
