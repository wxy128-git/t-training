import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import '../js/account-policy.js';

const FIREBASE_PROJECT_ID = 'xylaoshi-28f6c';
const FIREBASE_API_KEY = 'AIzaSyBx7adowufG1syf9ryrsFhywcVMS-sWxWo';
const FIREBASE_AUTH_BASE = 'https://identitytoolkit.googleapis.com/v1';
const ACCESS_TOKEN_TTL_SECONDS = 3600;
const REFRESH_TOKEN_TTL_DAYS = 30;
const pools = new Map();

function requiredSecret(env) {
    const secret = String(env.T_TRAINING_AUTH_SECRET || '');
    if (secret.length < 32) {
        const error = new Error('本地认证尚未配置安全密钥');
        error.statusCode = 501;
        error.code = 'LOCAL_AUTH_SECRET_MISSING';
        throw error;
    }
    return secret;
}

export function getPool(env) {
    const host = env.T_TRAINING_DB_HOST || '127.0.0.1';
    const port = Number(env.T_TRAINING_DB_PORT || 3306);
    const database = env.T_TRAINING_DB_NAME || 't_training_migration';
    const user = env.T_TRAINING_DB_USER || 't_training_migration';
    const password = env.T_TRAINING_DB_PASSWORD;
    if (!password) {
        const error = new Error('本地认证数据库尚未配置');
        error.statusCode = 501;
        error.code = 'LOCAL_AUTH_DATABASE_MISSING';
        throw error;
    }
    const key = `${host}:${port}/${database}/${user}`;
    if (!pools.has(key)) {
        pools.set(key, mysql.createPool({
            host,
            port,
            database,
            user,
            password,
            charset: 'utf8mb4',
            waitForConnections: true,
            connectionLimit: 8,
            maxIdle: 4,
            idleTimeout: 60000,
            enableKeepAlive: true
        }));
    }
    return pools.get(key);
}

export function cleanText(value, maxLength = 200) {
    return String(value ?? '')
        .normalize('NFKC')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim()
        .slice(0, maxLength);
}

export function normalizeEmail(value) {
    return cleanText(value, 320).toLowerCase();
}

export function realEmail(value) {
    const email = normalizeEmail(value);
    return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        && !/@xylaoshi\.tel$/.test(email) ? email : '';
}

function base64Url(value) {
    return Buffer.from(value).toString('base64url');
}

function fromBase64Url(value) {
    return Buffer.from(value, 'base64url');
}

function sessionHash(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function tokenSignature(payload, secret) {
    return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function tokenFor(uid, sessionId, secret, ttl = ACCESS_TOKEN_TTL_SECONDS) {
    const now = Math.floor(Date.now() / 1000);
    const payload = base64Url(JSON.stringify({ uid, sid: sessionId, iat: now, exp: now + ttl }));
    return `local.${payload}.${tokenSignature(payload, secret)}`;
}

function parseLocalToken(token, secret) {
    const parts = String(token || '').split('.');
    if (parts.length !== 3 || parts[0] !== 'local') return null;
    const [,, signature] = parts;
    const expected = tokenSignature(parts[1], secret);
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
    let payload;
    try { payload = JSON.parse(fromBase64Url(parts[1]).toString('utf8')); } catch { return null; }
    if (!payload?.uid || !payload?.sid || Number(payload.exp || 0) <= Math.floor(Date.now() / 1000)) return null;
    return payload;
}

export function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('base64url');
    const hash = crypto.scryptSync(String(password), salt, 32, {
        N: 16384,
        r: 8,
        p: 1,
        maxmem: 64 * 1024 * 1024
    }).toString('base64url');
    return { hash, salt, scheme: 'scrypt-N16384-r8-p1' };
}

export function verifyPassword(password, hash, salt, scheme) {
    if (!hash || !salt || scheme !== 'scrypt-N16384-r8-p1') return false;
    const actual = crypto.scryptSync(String(password), salt, 32, {
        N: 16384,
        r: 8,
        p: 1,
        maxmem: 64 * 1024 * 1024
    });
    const expected = Buffer.from(hash, 'base64url');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function profileFromRow(row) {
    const rawEmail = normalizeEmail(row.email || '');
    const phoneMatch = rawEmail.match(/^tel_(1[3-9]\d{9})@xylaoshi\.tel$/);
    const phone = phoneMatch ? phoneMatch[1] : cleanText(row.phone || '', 20);
    const email = phoneMatch ? '' : rawEmail;
    const adminUid = globalThis.AccountPolicy?.ADMIN_UID || 'MCUSTieySYczODKB9hkERtyvtZG2';
    const displayName = cleanText(row.name || row.display_name || (phone ? `手机用户${phone.slice(-4)}` : (email.split('@')[0] || '教师用户')), 80);
    return {
        uid: row.uid,
        name: displayName,
        email,
        phone,
        school: cleanText(row.school || '', 120),
        emailVerified: email ? row.email_verified === 1 || row.email_verified === true : false,
        isAdmin: row.uid === adminUid,
        joinedAt: /^\d{4}-\d{2}-\d{2}T/.test(String(row.joined_at_iso || '')) ? row.joined_at_iso : ''
    };
}

export function canUseFeatures(user) {
    const adminUid = globalThis.AccountPolicy?.ADMIN_UID || 'MCUSTieySYczODKB9hkERtyvtZG2';
    return user?.uid === adminUid || Boolean(realEmail(user?.email) && user?.emailVerified === true);
}

export function assertCanUseFeatures(user) {
    if (canUseFeatures(user)) return;
    const error = new Error('请先绑定并验证邮箱，再使用网站功能');
    error.statusCode = 403;
    error.code = 'EMAIL_VERIFICATION_REQUIRED';
    throw error;
}

export async function findUserByEmail(env, email) {
    const [rows] = await getPool(env).execute(`
        SELECT a.*, p.name, p.email AS profile_email, p.phone, p.school, p.is_admin,
               p.joined_at_iso
        FROM auth_users a LEFT JOIN user_profiles p ON p.uid = a.uid
        WHERE LOWER(a.email) = LOWER(?) LIMIT 1
    `, [normalizeEmail(email)]);
    if (!rows[0]) return null;
    return { ...rows[0], email: rows[0].email || rows[0].profile_email || '' };
}

export async function findUserByUid(env, uid) {
    const [rows] = await getPool(env).execute(`
        SELECT a.*, p.name, p.email AS profile_email, p.phone, p.school, p.is_admin,
               p.joined_at_iso
        FROM auth_users a LEFT JOIN user_profiles p ON p.uid = a.uid
        WHERE a.uid = ? LIMIT 1
    `, [cleanText(uid, 128)]);
    return rows[0] ? { ...rows[0], email: rows[0].email || rows[0].profile_email || '' } : null;
}

export function publicUser(row) {
    return profileFromRow(row);
}

export async function updateEmailState(env, uid, email, emailVerified) {
    await getPool(env).execute(`
        UPDATE auth_users SET email = ?, email_verified = ? WHERE uid = ?
    `, [normalizeEmail(email), emailVerified ? 1 : 0, uid]);
    await getPool(env).execute(`
        UPDATE user_profiles SET email = ? WHERE uid = ?
    `, [normalizeEmail(email), uid]);
}

export async function upsertFirebaseAccount(env, authData, profile = {}) {
    const uid = cleanText(authData.localId || authData.user_id || '', 128);
    if (!uid) throw new Error('Firebase 账号缺少 UID');
    const email = normalizeEmail(authData.email || profile.email || '');
    await getPool(env).execute(`
        INSERT INTO auth_users
          (uid, email, display_name, email_verified, disabled, phone_number,
           created_at_iso, last_login_at_iso, last_refresh_at_iso, password_updated_at_iso,
           valid_since, password_hash, password_salt, hash_version, raw_json)
        VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?)
        ON DUPLICATE KEY UPDATE
          email=VALUES(email), display_name=COALESCE(NULLIF(VALUES(display_name), ''), display_name),
          email_verified=VALUES(email_verified), phone_number=VALUES(phone_number),
          last_login_at_iso=VALUES(last_login_at_iso), last_refresh_at_iso=VALUES(last_refresh_at_iso)
    `, [
        uid, email, cleanText(authData.displayName || profile.name || '', 200), authData.emailVerified === true ? 1 : 0,
        cleanText(authData.phoneNumber || profile.phone || '', 40), cleanText(authData.createdAt || '', 64),
        cleanText(authData.lastLoginAt || '', 64), cleanText(authData.lastRefreshAt || '', 64),
        cleanText(authData.passwordUpdatedAt || '', 64), cleanText(authData.validSince || '', 64), JSON.stringify(authData)
    ]);
    if (profile && (profile.name || profile.school || profile.phone || profile.email)) {
        await upsertProfile(env, uid, { ...profile, email: email || profile.email || '' });
    }
    return findUserByUid(env, uid);
}

export async function upsertProfile(env, uid, profile) {
    const user = profile || {};
    await getPool(env).execute(`
        INSERT INTO user_profiles (uid, name, email, phone, school, is_admin, joined_at_iso, raw_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name=VALUES(name), email=VALUES(email), phone=VALUES(phone), school=VALUES(school),
          is_admin=VALUES(is_admin), joined_at_iso=VALUES(joined_at_iso), raw_json=VALUES(raw_json)
    `, [
        uid, cleanText(user.name, 200), normalizeEmail(user.email || ''), cleanText(user.phone, 40),
        cleanText(user.school, 240), user.isAdmin === true ? 1 : 0, cleanText(user.joinedAt, 64), JSON.stringify(user)
    ]);
}

export async function setLocalPassword(env, uid, password) {
    const record = hashPassword(password);
    await getPool(env).execute(`
        UPDATE auth_users SET local_password_hash = ?, local_password_salt = ?,
          local_password_scheme = ?, local_password_migrated_at = CURRENT_TIMESTAMP()
        WHERE uid = ?
    `, [record.hash, record.salt, record.scheme, uid]);
    return record;
}

export async function createLocalAccount(env, email, password, profile = {}) {
    const normalized = realEmail(email);
    if (!normalized) throw Object.assign(new Error('邮箱格式不正确'), { statusCode: 400, code: 'INVALID_EMAIL' });
    if (await findUserByEmail(env, normalized)) throw Object.assign(new Error('该账号已被注册，请直接登录'), { statusCode: 400, code: 'EMAIL_EXISTS' });
    const uid = crypto.randomBytes(24).toString('base64url').slice(0, 28);
    const passwordRecord = hashPassword(password);
    const now = new Date().toISOString();
    const safeProfile = {
        name: cleanText(profile.name, 80), email: normalized, phone: cleanText(profile.phone, 20),
        school: cleanText(profile.school, 120), isAdmin: false, joinedAt: cleanText(profile.joinedAt, 64) || now
    };
    const connection = await getPool(env).getConnection();
    try {
        await connection.beginTransaction();
        await connection.execute(`
            INSERT INTO auth_users
              (uid, email, display_name, email_verified, disabled, created_at_iso,
               local_password_hash, local_password_salt, local_password_scheme, local_password_migrated_at, raw_json)
            VALUES (?, ?, ?, 0, 0, ?, ?, ?, ?, CURRENT_TIMESTAMP(), ?)
        `, [uid, normalized, safeProfile.name, now, passwordRecord.hash, passwordRecord.salt, passwordRecord.scheme, JSON.stringify({ local: true, createdAt: now })]);
        await connection.execute(`
            INSERT INTO user_profiles (uid, name, email, phone, school, is_admin, joined_at_iso, raw_json)
            VALUES (?, ?, ?, ?, ?, 0, ?, ?)
        `, [uid, safeProfile.name, normalized, safeProfile.phone, safeProfile.school, safeProfile.joinedAt, JSON.stringify(safeProfile)]);
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        if (error?.code === 'ER_DUP_ENTRY') throw Object.assign(new Error('该账号已被注册，请直接登录'), { statusCode: 400, code: 'EMAIL_EXISTS' });
        throw error;
    } finally { connection.release(); }
    return findUserByUid(env, uid);
}

function actionTokenHash(token) { return crypto.createHash('sha256').update(String(token || '')).digest('hex'); }

export async function createAuthActionToken(env, uid, actionType, targetEmail, ttlMinutes = 30, metadata = {}) {
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const now = new Date();
    const expires = new Date(now.getTime() + Math.max(5, Math.min(120, Number(ttlMinutes) || 30)) * 60000);
    const connection = await getPool(env).getConnection();
    try {
        await connection.beginTransaction();
        await connection.execute('UPDATE auth_action_tokens SET used_at=CURRENT_TIMESTAMP(3) WHERE uid=? AND action_type=? AND used_at IS NULL', [uid, actionType]);
        await connection.execute(`
            INSERT INTO auth_action_tokens
              (token_hash, uid, action_type, target_email, expires_at, created_at, metadata_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [actionTokenHash(rawToken), uid, actionType, normalizeEmail(targetEmail), expires, now, JSON.stringify(metadata || {})]);
        await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
    return rawToken;
}

export async function readAuthActionToken(env, rawToken, actionType) {
    if (!/^[A-Za-z0-9_-]{40,128}$/.test(String(rawToken || ''))) return null;
    const [rows] = await getPool(env).execute(`
        SELECT token_hash, uid, action_type, target_email, expires_at, created_at, metadata_json
        FROM auth_action_tokens
        WHERE token_hash=? AND action_type=? AND used_at IS NULL AND expires_at>CURRENT_TIMESTAMP(3)
        LIMIT 1
    `, [actionTokenHash(rawToken), actionType]);
    return rows[0] || null;
}

export async function consumeAuthActionToken(env, rawToken, actionType, callback) {
    if (!/^[A-Za-z0-9_-]{40,128}$/.test(String(rawToken || ''))) return null;
    const connection = await getPool(env).getConnection();
    try {
        await connection.beginTransaction();
        const [rows] = await connection.execute(`
            SELECT token_hash, uid, action_type, target_email, expires_at, created_at, metadata_json
            FROM auth_action_tokens
            WHERE token_hash=? AND action_type=? AND used_at IS NULL AND expires_at>CURRENT_TIMESTAMP(3)
            LIMIT 1 FOR UPDATE
        `, [actionTokenHash(rawToken), actionType]);
        const row = rows[0];
        if (!row) { await connection.rollback(); return null; }
        const value = await callback(connection, row);
        const [result] = await connection.execute('UPDATE auth_action_tokens SET used_at=CURRENT_TIMESTAMP(3) WHERE token_hash=? AND used_at IS NULL', [row.token_hash]);
        if (result.affectedRows !== 1) throw new Error('邮箱操作令牌已被使用');
        await connection.commit();
        return { row, value };
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
}

export async function createSession(env, uid) {
    const pool = getPool(env);
    const sessionId = crypto.randomBytes(32).toString('hex');
    const refreshToken = crypto.randomBytes(48).toString('base64url');
    const now = new Date();
    const expires = new Date(now.getTime() + REFRESH_TOKEN_TTL_DAYS * 86400000);
    await pool.execute(`
        INSERT INTO auth_sessions (session_id, uid, refresh_token_hash, expires_at, created_at, last_used_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `, [sessionId, uid, sessionHash(refreshToken), expires, now, now]);
    return { sessionId, refreshToken, expiresAt: expires };
}

export async function issueLocalSession(env, uid) {
    const { sessionId, refreshToken } = await createSession(env, uid);
    const secret = requiredSecret(env);
    return { idToken: tokenFor(uid, sessionId, secret), refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

export async function readLocalAccessToken(env, token) {
    const secret = requiredSecret(env);
    const payload = parseLocalToken(token, secret);
    if (!payload) return null;
    const [rows] = await getPool(env).execute(`
        SELECT session_id FROM auth_sessions
        WHERE session_id = ? AND uid = ? AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP(3)
        LIMIT 1
    `, [payload.sid, payload.uid]);
    if (!rows[0]) return null;
    const row = await findUserByUid(env, payload.uid);
    return row ? { row, user: publicUser(row), token: payload } : null;
}

export async function rotateLocalSession(env, refreshToken) {
    const pool = getPool(env);
    const hash = sessionHash(refreshToken);
    const [rows] = await pool.execute(`
        SELECT session_id, uid FROM auth_sessions
        WHERE refresh_token_hash = ? AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP(3)
        LIMIT 1
    `, [hash]);
    if (!rows[0]) return null;
    const nextRefresh = crypto.randomBytes(48).toString('base64url');
    const now = new Date();
    const result = await pool.execute(`
        UPDATE auth_sessions SET refresh_token_hash = ?, last_used_at = ?
        WHERE session_id = ? AND refresh_token_hash = ? AND revoked_at IS NULL
    `, [sessionHash(nextRefresh), now, rows[0].session_id, hash]);
    if (result[0].affectedRows !== 1) return null;
    const secret = requiredSecret(env);
    return { idToken: tokenFor(rows[0].uid, rows[0].session_id, secret), refreshToken: nextRefresh, expiresIn: ACCESS_TOKEN_TTL_SECONDS, uid: rows[0].uid };
}

export async function localLogout(env, token) {
    const secret = requiredSecret(env);
    const payload = parseLocalToken(token, secret);
    if (!payload) return;
    await getPool(env).execute('UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP(3) WHERE session_id = ?', [payload.sid]);
}

export function firebaseAuthUrl(endpoint) {
    return `${FIREBASE_AUTH_BASE}/${endpoint}?key=${FIREBASE_API_KEY}`;
}

export async function callFirebaseAuth(endpoint, payload, timeoutMs = 6000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(firebaseAuthUrl(endpoint), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const code = cleanText(data.error?.message || 'AUTH_ERROR', 160).split(/\s*:\s*/, 1)[0];
            const error = new Error(code);
            error.code = code;
            error.statusCode = ['INVALID_PASSWORD', 'INVALID_LOGIN_CREDENTIALS', 'EMAIL_NOT_FOUND', 'EMAIL_EXISTS', 'INVALID_EMAIL', 'WEAK_PASSWORD'].includes(code) ? 400 : 502;
            throw error;
        }
        return data;
    } finally {
        clearTimeout(timer);
    }
}

export async function firebaseRefresh(refreshToken) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
        const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
            signal: controller.signal
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(data.error?.message || 'AUTH_REFRESH_ERROR');
            error.code = data.error?.message || 'AUTH_REFRESH_ERROR';
            error.statusCode = 401;
            throw error;
        }
        return { ...data, idToken: data.id_token, refreshToken: data.refresh_token || refreshToken, localId: data.user_id };
    } finally {
        clearTimeout(timer);
    }
}
