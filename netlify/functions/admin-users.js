const crypto = require('crypto');

const FIREBASE_API_KEY = 'AIzaSyBx7adowufG1syf9ryrsFhywcVMS-sWxWo';
const FIREBASE_PROJECT_ID = 'xylaoshi-28f6c';
const FIREBASE_AUTH_BASE = 'https://identitytoolkit.googleapis.com/v1';
const FIRESTORE_USER_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users`;
const ADMIN_EMAIL = 'admin@xylaoshi.com';
const ADMIN_SCOPES = [
    'https://www.googleapis.com/auth/identitytoolkit',
    'https://www.googleapis.com/auth/datastore'
].join(' ');

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

let cachedAccessToken = null;

function json(statusCode, body) {
    return {
        statusCode,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    };
}

function authEmailFromIdentifier(identifier) {
    const cleaned = String(identifier || '').trim().replace(/\s/g, '');
    if (/^1[3-9]\d{9}$/.test(cleaned)) return `tel_${cleaned}@xylaoshi.tel`;
    return cleaned.toLowerCase();
}

function decodeMaybeBase64(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.startsWith('{') || raw.includes('BEGIN PRIVATE KEY')) return raw;
    try {
        return Buffer.from(raw, 'base64').toString('utf8');
    } catch {
        return raw;
    }
}

function normalizePrivateKey(value) {
    return decodeMaybeBase64(value)
        .replace(/^"|"$/g, '')
        .replace(/\\n/g, '\n')
        .trim();
}

function readServiceAccount() {
    const jsonRaw = process.env.FIREBASE_SERVICE_ACCOUNT
        || process.env.FIREBASE_ADMIN_CREDENTIALS
        || process.env.GOOGLE_SERVICE_ACCOUNT_JSON
        || process.env.GOOGLE_CREDENTIALS;

    if (jsonRaw) {
        try {
            const parsed = JSON.parse(decodeMaybeBase64(jsonRaw));
            return {
                client_email: parsed.client_email,
                private_key: normalizePrivateKey(parsed.private_key)
            };
        } catch {}
    }

    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY;
    if (!clientEmail || !privateKey) return null;
    return {
        client_email: clientEmail,
        private_key: normalizePrivateKey(privateKey)
    };
}

function base64Url(input) {
    return Buffer.from(input)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

async function getGoogleAccessToken() {
    if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60000) {
        return cachedAccessToken.token;
    }

    const serviceAccount = readServiceAccount();
    if (!serviceAccount?.client_email || !serviceAccount?.private_key) {
        const error = new Error('服务器缺少 Firebase 管理凭据，暂时不能删除 Authentication 账号');
        error.statusCode = 501;
        throw error;
    }

    const now = Math.floor(Date.now() / 1000);
    const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = base64Url(JSON.stringify({
        iss: serviceAccount.client_email,
        scope: ADMIN_SCOPES,
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600
    }));
    const signingInput = `${header}.${claim}`;
    const signature = crypto
        .createSign('RSA-SHA256')
        .update(signingInput)
        .end()
        .sign(serviceAccount.private_key);
    const assertion = `${signingInput}.${base64Url(signature)}`;

    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion
        })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(data.error_description || data.error || '无法获取 Firebase 管理访问令牌');
        error.statusCode = response.status;
        throw error;
    }

    cachedAccessToken = {
        token: data.access_token,
        expiresAt: Date.now() + Math.max(300, Number(data.expires_in || 3600) - 60) * 1000
    };
    return cachedAccessToken.token;
}

async function verifyAdmin(adminIdToken) {
    if (!adminIdToken) {
        const error = new Error('请先登录管理员账号');
        error.statusCode = 401;
        throw error;
    }

    const response = await fetch(`${FIREBASE_AUTH_BASE}/accounts:lookup?key=${FIREBASE_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: adminIdToken })
    });
    const data = await response.json().catch(() => ({}));
    const user = data.users?.[0];
    if (!response.ok || !user) {
        const error = new Error('管理员登录状态已过期，请重新登录');
        error.statusCode = 401;
        throw error;
    }
    if (String(user.email || '').toLowerCase() !== ADMIN_EMAIL) {
        const error = new Error('当前账号没有管理员权限');
        error.statusCode = 403;
        throw error;
    }
    return user;
}

async function callAdminAuth(endpoint, accessToken, payload) {
    const response = await fetch(`${FIREBASE_AUTH_BASE}/projects/${FIREBASE_PROJECT_ID}/${endpoint}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const code = data?.error?.message || data?.error?.status || 'AUTH_ADMIN_ERROR';
        const error = new Error(code);
        error.code = code;
        error.statusCode = response.status;
        throw error;
    }
    return data;
}

async function lookupAuthUser(accessToken, { uid, email }) {
    const payload = uid ? { localId: [uid] } : { email: [email] };
    try {
        const data = await callAdminAuth('accounts:lookup', accessToken, payload);
        return data.users?.[0] || null;
    } catch(error) {
        if (error.code === 'USER_NOT_FOUND' || error.statusCode === 404) return null;
        throw error;
    }
}

async function deleteAuthUser(accessToken, uid) {
    try {
        await callAdminAuth('accounts:delete', accessToken, { localId: uid });
        return true;
    } catch(error) {
        if (error.code === 'USER_NOT_FOUND' || error.statusCode === 404) return false;
        throw error;
    }
}

async function deleteFirestoreUser(accessToken, uid) {
    const response = await fetch(`${FIRESTORE_USER_BASE}/${encodeURIComponent(uid)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (response.ok || response.status === 404) return;
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.error?.message || '用户资料删除失败');
}

exports.handler = async function(event) {
    if (event.httpMethod === 'OPTIONS') return json(204, {});
    if (event.httpMethod !== 'POST') return json(405, { ok: false, msg: 'method not allowed' });

    let payload;
    try {
        payload = JSON.parse(event.body || '{}');
    } catch {
        return json(400, { ok: false, msg: '请求格式不正确' });
    }

    const { action, adminIdToken } = payload;
    if (action !== 'deleteUser') return json(400, { ok: false, msg: '未知管理操作' });

    try {
        const admin = await verifyAdmin(adminIdToken);
        const accessToken = await getGoogleAccessToken();
        const email = payload.identifier ? authEmailFromIdentifier(payload.identifier) : '';
        if (!payload.uid && !email) return json(400, { ok: false, msg: '请提供要删除的用户 UID、邮箱或手机号' });

        const target = await lookupAuthUser(accessToken, { uid: payload.uid, email });
        const targetUid = target?.localId || payload.uid;
        if (!targetUid) {
            return json(404, { ok: false, msg: 'Firebase Authentication 中没有找到这个账号' });
        }
        if (targetUid === admin.localId || String(target.email || '').toLowerCase() === ADMIN_EMAIL) {
            return json(400, { ok: false, msg: '不能删除管理员账号' });
        }

        const authDeleted = await deleteAuthUser(accessToken, targetUid);
        await deleteFirestoreUser(accessToken, targetUid);

        return json(200, {
            ok: true,
            uid: targetUid,
            email: target?.email || email,
            authDeleted
        });
    } catch(error) {
        return json(error.statusCode || 500, {
            ok: false,
            msg: error.message || '删除用户失败',
            code: error.code || 'ADMIN_USERS_ERROR'
        });
    }
};
