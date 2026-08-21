const FIREBASE_API_KEY = 'AIzaSyBx7adowufG1syf9ryrsFhywcVMS-sWxWo';
const FIREBASE_PROJECT_ID = 'xylaoshi-28f6c';
const FIREBASE_AUTH_BASE = 'https://identitytoolkit.googleapis.com/v1';
const FIRESTORE_USER_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users`;
const ADMIN_EMAIL = 'admin@xylaoshi.com';
const ADMIN_SCOPES = [
    'https://www.googleapis.com/auth/identitytoolkit',
    'https://www.googleapis.com/auth/datastore'
].join(' ');

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

let cachedAccessToken = null;

function jsonResponse(status, body) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
}

function authEmailFromIdentifier(identifier) {
    const cleaned = String(identifier || '').trim().replace(/\s/g, '');
    if (/^1[3-9]\d{9}$/.test(cleaned)) return `tel_${cleaned}@xylaoshi.tel`;
    return cleaned.toLowerCase();
}

function base64ToString(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
}

function decodeMaybeBase64(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.startsWith('{') || raw.includes('BEGIN PRIVATE KEY')) return raw;
    try {
        return base64ToString(raw);
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

function readServiceAccount(env) {
    const jsonRaw = env.FIREBASE_SERVICE_ACCOUNT
        || env.FIREBASE_ADMIN_CREDENTIALS
        || env.GOOGLE_SERVICE_ACCOUNT_JSON
        || env.GOOGLE_CREDENTIALS;

    if (jsonRaw) {
        try {
            const parsed = JSON.parse(decodeMaybeBase64(jsonRaw));
            return {
                client_email: parsed.client_email,
                private_key: normalizePrivateKey(parsed.private_key)
            };
        } catch {}
    }

    const clientEmail = env.FIREBASE_CLIENT_EMAIL || env.GOOGLE_CLIENT_EMAIL;
    const privateKey = env.FIREBASE_PRIVATE_KEY || env.GOOGLE_PRIVATE_KEY;
    if (!clientEmail || !privateKey) return null;
    return {
        client_email: clientEmail,
        private_key: normalizePrivateKey(privateKey)
    };
}

function base64UrlFromString(s) {
    const bytes = new TextEncoder().encode(s);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlFromBuffer(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function pemToArrayBuffer(pem) {
    const cleaned = pem
        .replace(/-----BEGIN [^-]+-----/g, '')
        .replace(/-----END [^-]+-----/g, '')
        .replace(/\s/g, '');
    const binary = atob(cleaned);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
}

async function signJwtRS256(signingInput, privateKeyPem) {
    const key = await crypto.subtle.importKey(
        'pkcs8',
        pemToArrayBuffer(privateKeyPem),
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        key,
        new TextEncoder().encode(signingInput)
    );
    return base64UrlFromBuffer(signature);
}

async function getGoogleAccessToken(env) {
    if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60000) {
        return cachedAccessToken.token;
    }

    const serviceAccount = readServiceAccount(env);
    if (!serviceAccount?.client_email || !serviceAccount?.private_key) {
        const error = new Error('服务器缺少 Firebase 管理凭据，暂时不能执行用户管理操作');
        error.statusCode = 501;
        throw error;
    }

    const now = Math.floor(Date.now() / 1000);
    const header = base64UrlFromString(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = base64UrlFromString(JSON.stringify({
        iss: serviceAccount.client_email,
        scope: ADMIN_SCOPES,
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600
    }));
    const signingInput = `${header}.${claim}`;
    const signature = await signJwtRS256(signingInput, serviceAccount.private_key);
    const assertion = `${signingInput}.${signature}`;

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

function decodeFirestoreValue(value = {}) {
    if ('stringValue' in value) return value.stringValue;
    if ('timestampValue' in value) return value.timestampValue;
    if ('booleanValue' in value) return value.booleanValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return Number(value.doubleValue);
    if ('nullValue' in value) return null;
    return '';
}

export function decodeUserDocument(document = {}) {
    const fields = document.fields || {};
    const rawId = String(document.name || '').split('/').pop() || '';
    let uid = rawId;
    try { uid = decodeURIComponent(rawId); } catch {}
    return {
        uid,
        name: String(decodeFirestoreValue(fields.name) || ''),
        email: String(decodeFirestoreValue(fields.email) || ''),
        phone: String(decodeFirestoreValue(fields.phone) || ''),
        school: String(decodeFirestoreValue(fields.school) || ''),
        isAdmin: decodeFirestoreValue(fields.isAdmin) === true,
        joinedAt: String(decodeFirestoreValue(fields.joinedAt) || '')
    };
}

async function listFirestoreUsers(accessToken) {
    const users = [];
    let pageToken = '';
    const seenTokens = new Set();
    for (let page = 0; page < 20; page += 1) {
        const url = new URL(FIRESTORE_USER_BASE);
        url.searchParams.set('pageSize', '300');
        if (pageToken) url.searchParams.set('pageToken', pageToken);
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(data?.error?.message || '用户列表读取失败');
            error.statusCode = response.status;
            throw error;
        }
        users.push(...(data.documents || []).map(decodeUserDocument));
        pageToken = String(data.nextPageToken || '');
        if (!pageToken) break;
        if (seenTokens.has(pageToken)) throw new Error('用户列表分页状态异常');
        seenTokens.add(pageToken);
    }
    return users.sort((a, b) => String(b.joinedAt).localeCompare(String(a.joinedAt)));
}

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost({ request, env }) {
    let payload;
    try {
        payload = await request.json();
    } catch {
        return jsonResponse(400, { ok: false, msg: '请求格式不正确' });
    }

    const { action, adminIdToken } = payload || {};
    if (!['listUsers', 'deleteUser'].includes(action)) {
        return jsonResponse(400, { ok: false, msg: '未知管理操作' });
    }

    try {
        const admin = await verifyAdmin(adminIdToken);
        const accessToken = await getGoogleAccessToken(env);
        if (action === 'listUsers') {
            const users = await listFirestoreUsers(accessToken);
            return jsonResponse(200, { ok: true, users });
        }

        const email = payload.identifier ? authEmailFromIdentifier(payload.identifier) : '';
        if (!payload.uid && !email) return jsonResponse(400, { ok: false, msg: '请提供要删除的用户 UID、邮箱或手机号' });

        const target = await lookupAuthUser(accessToken, { uid: payload.uid, email });
        const targetUid = target?.localId || payload.uid;
        if (!targetUid) {
            return jsonResponse(404, { ok: false, msg: 'Firebase Authentication 中没有找到这个账号' });
        }
        if (targetUid === admin.localId || String(target.email || '').toLowerCase() === ADMIN_EMAIL) {
            return jsonResponse(400, { ok: false, msg: '不能删除管理员账号' });
        }

        const authDeleted = await deleteAuthUser(accessToken, targetUid);
        await deleteFirestoreUser(accessToken, targetUid);

        return jsonResponse(200, {
            ok: true,
            uid: targetUid,
            email: target?.email || email,
            authDeleted
        });
    } catch(error) {
        return jsonResponse(error.statusCode || 500, {
            ok: false,
            msg: error.message || '删除用户失败',
            code: error.code || 'ADMIN_USERS_ERROR'
        });
    }
}
