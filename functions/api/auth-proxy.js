const FIREBASE_API_KEY = 'AIzaSyBx7adowufG1syf9ryrsFhywcVMS-sWxWo';
const FIREBASE_PROJECT_ID = 'xylaoshi-28f6c';
const FIREBASE_AUTH_BASE = 'https://identitytoolkit.googleapis.com/v1';
const FIRESTORE_USER_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users`;
const ADMIN_EMAIL = 'admin@xylaoshi.com';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function jsonResponse(status, body) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
}

function firebaseErrorMessage(code) {
    const messages = {
        EMAIL_EXISTS: '该账号已被注册，请直接登录',
        OPERATION_NOT_ALLOWED: 'Firebase 未开启邮箱/密码注册，请在 Firebase Authentication 中启用 Email/Password',
        TOO_MANY_ATTEMPTS_TRY_LATER: '注册或登录请求过于频繁，请稍后再试',
        WEAK_PASSWORD: '密码强度不足，请使用至少 6 位密码',
        INVALID_EMAIL: '邮箱格式不正确',
        EMAIL_NOT_FOUND: '账号不存在，请先注册',
        INVALID_PASSWORD: '密码错误',
        INVALID_LOGIN_CREDENTIALS: '账号或密码错误',
        USER_DISABLED: '该账号已被停用'
    };
    return messages[code] || `Firebase 返回错误：${code || 'UNKNOWN_ERROR'}`;
}

async function callFirebaseAuth(endpoint, payload) {
    const response = await fetch(`${FIREBASE_AUTH_BASE}/${endpoint}?key=${FIREBASE_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
        const code = data?.error?.message;
        const error = new Error(firebaseErrorMessage(code));
        error.code = code;
        throw error;
    }
    return data;
}

function firestoreFields(profile) {
    return {
        name: { stringValue: profile.name || '' },
        email: { stringValue: profile.email || '' },
        phone: { stringValue: profile.phone || '' },
        school: { stringValue: profile.school || '' },
        isAdmin: { booleanValue: profile.isAdmin === true },
        joinedAt: { stringValue: profile.joinedAt || new Date().toISOString() }
    };
}

async function saveUserProfile(idToken, uid, profile) {
    if (!idToken || !uid || !profile) return;
    try {
        await fetch(`${FIRESTORE_USER_BASE}/${uid}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ fields: firestoreFields(profile) })
        });
    } catch {
        // A profile write failure should not block account creation.
    }
}

async function readUserProfile(idToken, uid) {
    try {
        const response = await fetch(`${FIRESTORE_USER_BASE}/${uid}`, {
            headers: { 'Authorization': `Bearer ${idToken}` }
        });
        if (!response.ok) return null;
        const data = await response.json();
        const fields = data.fields || {};
        return {
            name: fields.name?.stringValue || '',
            email: fields.email?.stringValue || '',
            phone: fields.phone?.stringValue || '',
            school: fields.school?.stringValue || '',
            isAdmin: fields.isAdmin?.booleanValue === true,
            joinedAt: fields.joinedAt?.stringValue || ''
        };
    } catch {
        return null;
    }
}

function userFromAuth(data, profile = {}) {
    const rawEmail = data.email || profile.email || '';
    const phoneMatch = rawEmail.match(/^tel_(1[3-9]\d{9})@xylaoshi\.tel$/);
    const phone = phoneMatch ? phoneMatch[1] : (profile.phone || '');
    const email = phoneMatch ? '' : rawEmail;
    return {
        uid: data.localId,
        name: profile.name || data.displayName || (phone ? `手机用户${phone.slice(-4)}` : (email.split('@')[0] || '教师用户')),
        email,
        phone,
        school: profile.school || '',
        isAdmin: profile.isAdmin === true || rawEmail === ADMIN_EMAIL,
        joinedAt: profile.joinedAt || new Date().toISOString()
    };
}

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost({ request }) {
    let payload;
    try {
        payload = await request.json();
    } catch {
        return jsonResponse(400, { ok: false, msg: '请求格式不正确' });
    }

    const { action, email, password } = payload || {};
    if (!email || !password || password.length < 6) {
        return jsonResponse(400, { ok: false, msg: '请填写有效账号和至少 6 位密码' });
    }

    try {
        if (action === 'register') {
            const profile = payload.profile || {};
            const authData = await callFirebaseAuth('accounts:signUp', {
                email,
                password,
                returnSecureToken: true
            });
            if (profile.name) {
                try {
                    await callFirebaseAuth('accounts:update', {
                        idToken: authData.idToken,
                        displayName: profile.name,
                        returnSecureToken: false
                    });
                } catch {}
            }
            const user = userFromAuth(authData, profile);
            await saveUserProfile(authData.idToken, authData.localId, user);
            return jsonResponse(200, { ok: true, ...authData, user });
        }

        if (action === 'login') {
            const authData = await callFirebaseAuth('accounts:signInWithPassword', {
                email,
                password,
                returnSecureToken: true
            });
            const profile = await readUserProfile(authData.idToken, authData.localId);
            const user = userFromAuth(authData, profile || {});
            return jsonResponse(200, { ok: true, ...authData, user });
        }

        return jsonResponse(400, { ok: false, msg: '未知认证操作' });
    } catch(error) {
        return jsonResponse(400, { ok: false, msg: error.message, code: error.code || 'AUTH_PROXY_ERROR' });
    }
}
