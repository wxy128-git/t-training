const FIREBASE_API_KEY = 'AIzaSyBx7adowufG1syf9ryrsFhywcVMS-sWxWo';
const FIREBASE_PROJECT_ID = 'xylaoshi-28f6c';
const FIREBASE_AUTH_BASE = 'https://identitytoolkit.googleapis.com/v1';
const FIRESTORE_ROOT = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
const ADMIN_SCOPES = 'https://www.googleapis.com/auth/datastore';

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
    try { return base64ToString(raw); } catch { return raw; }
}

function normalizePrivateKey(value) {
    return decodeMaybeBase64(value).replace(/^"|"$/g, '').replace(/\\n/g, '\n').trim();
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
        const error = new Error('服务器缺少 Firebase 管理凭据，暂时不能读取备课本');
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
    const assertion = `${signingInput}.${await signJwtRS256(signingInput, serviceAccount.private_key)}`;

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

async function lookupIdToken(idToken) {
    if (!idToken) return null;
    const response = await fetch(`${FIREBASE_AUTH_BASE}/accounts:lookup?key=${FIREBASE_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.users?.[0]) return null;
    return data.users[0];
}

async function requireUser(idToken) {
    const user = await lookupIdToken(idToken);
    if (!user?.localId) {
        const error = new Error('登录状态已过期，请重新登录');
        error.statusCode = 401;
        throw error;
    }
    return user;
}

function clampString(value, max = 200) {
    return String(value || '').trim().slice(0, max);
}

function safeObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value;
}

function firestoreValue(value) {
    if (value === null || value === undefined) return { nullValue: null };
    if (value instanceof Date) return { timestampValue: value.toISOString() };
    if (typeof value === 'boolean') return { booleanValue: value };
    if (typeof value === 'number') {
        if (Number.isInteger(value)) return { integerValue: String(value) };
        return { doubleValue: value };
    }
    if (Array.isArray(value)) {
        return { arrayValue: { values: value.slice(0, 60).map(firestoreValue) } };
    }
    if (typeof value === 'object') {
        const fields = {};
        Object.entries(value).slice(0, 80).forEach(([k, v]) => {
            fields[clampString(k, 80)] = firestoreValue(v);
        });
        return { mapValue: { fields } };
    }
    return { stringValue: String(value) };
}

function firestoreFields(obj) {
    const fields = {};
    Object.entries(obj).forEach(([key, value]) => { fields[key] = firestoreValue(value); });
    return fields;
}

function parseFirestoreValue(value) {
    if (!value) return null;
    if ('stringValue' in value) return value.stringValue;
    if ('integerValue' in value) return Number(value.integerValue || 0);
    if ('doubleValue' in value) return Number(value.doubleValue || 0);
    if ('booleanValue' in value) return value.booleanValue === true;
    if ('timestampValue' in value) return value.timestampValue;
    if ('nullValue' in value) return null;
    if ('arrayValue' in value) return (value.arrayValue.values || []).map(parseFirestoreValue);
    if ('mapValue' in value) {
        const out = {};
        Object.entries(value.mapValue.fields || {}).forEach(([k, v]) => { out[k] = parseFirestoreValue(v); });
        return out;
    }
    return null;
}

function parseDocument(doc) {
    const out = { id: String(doc.name || '').split('/').pop() };
    Object.entries(doc.fields || {}).forEach(([key, value]) => { out[key] = parseFirestoreValue(value); });
    return out;
}

function validDocId(id) {
    return /^[A-Za-z0-9_-]{1,128}$/.test(String(id || ''));
}

function normalizeWork(raw, uid) {
    const work = safeObject(raw);
    const now = new Date().toISOString();
    return {
        uid,
        agentId: clampString(work.agentId, 80),
        agentName: clampString(work.agentName, 120),
        agentType: clampString(work.agentType, 40),
        workType: clampString(work.workType, 40),
        title: clampString(work.title || '未命名内容', 160),
        content: String(work.content || '').slice(0, 240000),
        inputs: safeObject(work.inputs),
        createdAt: now,
        updatedAt: now
    };
}

async function runQuery(accessToken, structuredQuery) {
    const response = await fetch(`${FIRESTORE_ROOT}:runQuery`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ structuredQuery })
    });
    const body = await response.json().catch(() => []);
    if (!response.ok) {
        const error = new Error(body?.error?.message || '备课本读取失败');
        error.statusCode = response.status;
        throw error;
    }
    return body.filter(row => row.document).map(row => parseDocument(row.document));
}

async function getWork(accessToken, id, uid) {
    if (!validDocId(id)) {
        const error = new Error('备课本条目不存在');
        error.statusCode = 404;
        throw error;
    }
    const response = await fetch(`${FIRESTORE_ROOT}/works/${encodeURIComponent(id)}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error('备课本条目不存在');
        error.statusCode = response.status === 404 ? 404 : response.status;
        throw error;
    }
    const work = parseDocument(body);
    if (work.uid !== uid) {
        const error = new Error('无权操作这条备课本内容');
        error.statusCode = 403;
        throw error;
    }
    return work;
}

async function createWork(accessToken, work) {
    const response = await fetch(`${FIRESTORE_ROOT}/works`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields: firestoreFields(work) })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(body?.error?.message || '备课本保存失败');
        error.statusCode = response.status;
        throw error;
    }
    return parseDocument(body).id;
}

async function patchWork(accessToken, id, data) {
    const qs = Object.keys(data)
        .map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
        .join('&');
    const response = await fetch(`${FIRESTORE_ROOT}/works/${encodeURIComponent(id)}?${qs}`, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields: firestoreFields(data) })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(body?.error?.message || '备课本更新失败');
        error.statusCode = response.status;
        throw error;
    }
}

async function deleteWork(accessToken, id) {
    const response = await fetch(`${FIRESTORE_ROOT}/works/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const error = new Error(body?.error?.message || '备课本删除失败');
        error.statusCode = response.status;
        throw error;
    }
}

async function handleList(accessToken, uid) {
    const items = await runQuery(accessToken, {
        from: [{ collectionId: 'works' }],
        where: {
            fieldFilter: {
                field: { fieldPath: 'uid' },
                op: 'EQUAL',
                value: { stringValue: uid }
            }
        },
        limit: 1000
    });
    items.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
    return { ok: true, works: items };
}

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost({ request, env }) {
    const len = Number(request.headers.get('content-length') || 0);
    if (len > 300000) return jsonResponse(413, { ok: false, msg: '备课本请求过大' });

    let payload;
    try {
        payload = await request.json();
    } catch {
        return jsonResponse(400, { ok: false, msg: '请求格式不正确' });
    }

    try {
        const user = await requireUser(payload.idToken);
        const uid = user.localId;
        const accessToken = await getGoogleAccessToken(env);

        if (payload.action === 'list') {
            return jsonResponse(200, await handleList(accessToken, uid));
        }
        if (payload.action === 'create') {
            const id = await createWork(accessToken, normalizeWork(payload.work, uid));
            return jsonResponse(200, { ok: true, id });
        }
        if (payload.action === 'rename') {
            await getWork(accessToken, payload.id, uid);
            await patchWork(accessToken, payload.id, {
                title: clampString(payload.title || '未命名内容', 160),
                updatedAt: new Date().toISOString()
            });
            return jsonResponse(200, { ok: true });
        }
        if (payload.action === 'delete') {
            await getWork(accessToken, payload.id, uid);
            await deleteWork(accessToken, payload.id);
            return jsonResponse(200, { ok: true });
        }

        return jsonResponse(400, { ok: false, msg: '未知备课本操作' });
    } catch (error) {
        return jsonResponse(error.statusCode || 500, {
            ok: false,
            msg: error.message || '备课本服务暂时不可用'
        });
    }
}
