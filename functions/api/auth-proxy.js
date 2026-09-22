import '../../js/account-policy.js';
const FIREBASE_API_KEY = 'AIzaSyBx7adowufG1syf9ryrsFhywcVMS-sWxWo';
const FIREBASE_PROJECT_ID = 'xylaoshi-28f6c';
const FIREBASE_AUTH_BASE = 'https://identitytoolkit.googleapis.com/v1';
const FIREBASE_TOKEN_BASE = 'https://securetoken.googleapis.com/v1';
const FIRESTORE_USER_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users`;

const CORS_HEADERS = {
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const AUTH_RATE_WINDOW_MS = 10 * 60 * 1000;
const AUTH_RATE_LIMITS = { login: 15, register: 6, 'reset-password': 4, refresh: 60, subscribe: 10, 'email-status': 60, 'verify-email': 12 };
const FIREBASE_TIMEOUT_MS = 6000;
const authRateMap = new Map();
const verificationSentAt = new Map();

function cleanText(value, maxLength) {
    return String(value ?? '')
        .normalize('NFKC')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim()
        .slice(0, maxLength);
}

function jsonResponse(status, body) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            ...CORS_HEADERS
        }
    });
}

function rateBucket(key, limit) {
    const now = Date.now();
    const recent = (authRateMap.get(key) || []).filter(time => now - time < AUTH_RATE_WINDOW_MS);
    if (recent.length >= limit) {
        return Math.max(1, Math.ceil((AUTH_RATE_WINDOW_MS - (now - recent[0])) / 1000));
    }
    recent.push(now);
    authRateMap.set(key, recent);
    if (authRateMap.size > 5000) {
        for (const [entryKey, times] of authRateMap) {
            const alive = times.filter(time => now - time < AUTH_RATE_WINDOW_MS);
            if (alive.length) authRateMap.set(entryKey, alive); else authRateMap.delete(entryKey);
        }
    }
    return 0;
}

function authRetryAfter(request, action, account = '') {
    const limit = AUTH_RATE_LIMITS[action];
    if (!limit) return 0;
    const ip = cleanText(request.headers.get('CF-Connecting-IP') || 'unknown', 64);
    const accountKey = cleanText(account, 254).toLowerCase();
    const retries = [rateBucket(`ip:${action}:${ip}`, limit)];
    if (accountKey) retries.push(rateBucket(`account:${action}:${accountKey}`, limit));
    return Math.max(...retries);
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
        USER_DISABLED: '该账号已被停用',
        INVALID_ID_TOKEN: '登录状态已过期，请重新登录',
        TOKEN_EXPIRED: '登录状态已过期，请使用验证后的邮箱和原密码重新登录',
        CREDENTIAL_TOO_OLD_LOGIN_AGAIN: '请再次输入当前登录密码，确认后重新发送验证邮件',
        INVALID_OOB_CODE: '验证链接无效，请重新发送验证邮件',
        EXPIRED_OOB_CODE: '验证链接已过期，请重新发送验证邮件'
    };
    return messages[code] || '认证服务暂时不可用，请稍后重试';
}

function firebaseErrorStatus(code) {
    const definitiveCodes = new Set([
        'EMAIL_EXISTS', 'OPERATION_NOT_ALLOWED', 'TOO_MANY_ATTEMPTS_TRY_LATER',
        'WEAK_PASSWORD', 'INVALID_EMAIL', 'EMAIL_NOT_FOUND', 'INVALID_PASSWORD',
        'INVALID_LOGIN_CREDENTIALS', 'USER_DISABLED', 'CREDENTIAL_TOO_OLD_LOGIN_AGAIN', 'INVALID_OOB_CODE', 'EXPIRED_OOB_CODE'
    ]);
    if (['INVALID_ID_TOKEN', 'TOKEN_EXPIRED', 'USER_NOT_FOUND'].includes(code)) return 401;
    return definitiveCodes.has(code) ? 400 : 502;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = FIREBASE_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

async function callFirebaseAuth(endpoint, payload) {
    let response;
    let data;
    try {
        response = await fetchWithTimeout(`${FIREBASE_AUTH_BASE}/${endpoint}?key=${FIREBASE_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        data = await response.json();
    } catch(cause) {
        const timedOut = cause?.name === 'AbortError';
        const error = new Error(timedOut ? '认证服务连接超时，请稍后重试' : '认证服务暂时不可用，请稍后重试');
        error.statusCode = timedOut ? 504 : 502;
        error.code = timedOut ? 'AUTH_UPSTREAM_TIMEOUT' : 'AUTH_UPSTREAM_UNAVAILABLE';
        throw error;
    }
    if (!response.ok) {
        const code = data?.error?.message;
        const error = new Error(firebaseErrorMessage(code));
        error.code = code;
        error.statusCode = firebaseErrorStatus(code);
        throw error;
    }
    return data;
}

async function refreshFirebaseToken(refreshToken) {
    let response;
    try {
        response = await fetchWithTimeout(`${FIREBASE_TOKEN_BASE}/token?key=${FIREBASE_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken
            })
        });
    } catch(cause) {
        const error = new Error(cause?.name === 'AbortError' ? '登录状态刷新超时，请重新登录' : '登录状态暂时无法刷新，请重新登录');
        error.code = cause?.name === 'AbortError' ? 'AUTH_UPSTREAM_TIMEOUT' : 'AUTH_UPSTREAM_UNAVAILABLE';
        throw error;
    }
    const data = await response.json();
    if (!response.ok) {
        const code = data?.error?.message;
        const error = new Error(firebaseErrorMessage(code) || '登录状态已过期，请重新登录');
        error.code = code;
        throw error;
    }
    return {
        idToken: data.id_token,
        refreshToken: data.refresh_token || refreshToken,
        expiresIn: data.expires_in,
        localId: data.user_id
    };
}

async function lookupIdToken(idToken) {
    if (!idToken || typeof idToken !== 'string') {
        throw Object.assign(new Error('请先登录后绑定邮箱'), { statusCode: 401 });
    }
    const data = await callFirebaseAuth('accounts:lookup', { idToken });
    if (!data.users?.[0]) throw Object.assign(new Error('登录状态已过期，请重新登录'), { statusCode: 401 });
    return data.users[0];
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
        await fetchWithTimeout(`${FIRESTORE_USER_BASE}/${uid}`, {
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
        const response = await fetchWithTimeout(`${FIRESTORE_USER_BASE}/${uid}`, {
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
    // 身份只认 Firebase Auth；管理员按固定 UID 判断，邮箱验证状态单独如实返回。
    const rawEmail = String(data.email || '').trim().toLowerCase();
    const phoneMatch = rawEmail.match(/^tel_(1[3-9]\d{9})@xylaoshi\.tel$/);
    const phone = phoneMatch ? phoneMatch[1] : cleanText(profile.phone, 20);
    const email = phoneMatch ? '' : rawEmail;
    return {
        uid: data.localId,
        name: cleanText(profile.name || data.displayName || (phone ? `手机用户${phone.slice(-4)}` : (email.split('@')[0] || '教师用户')), 80),
        email,
        phone,
        school: cleanText(profile.school, 120),
        emailVerified: globalThis.AccountPolicy.hasVerifiedEmail(data),
        isAdmin: globalThis.AccountPolicy.isAdmin(data),
        joinedAt: /^\d{4}-\d{2}-\d{2}T/.test(profile.joinedAt || '') ? profile.joinedAt : new Date().toISOString()
    };
}

async function currentAccount(idToken, authUser) {
    const lookup = authUser || await lookupIdToken(idToken);
    const profile = await readUserProfile(idToken, lookup.localId);
    const user = userFromAuth(lookup, profile || {});
    // 仅在成功读到原资料时同步认证邮箱；不迁移 UID，不触碰作品与草稿。
    if (profile && user.emailVerified && profile.email !== user.email) {
        await saveUserProfile(idToken, lookup.localId, user);
    }
    return user;
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

    const { action, email, password, refreshToken } = payload || {};
    if (!Object.prototype.hasOwnProperty.call(AUTH_RATE_LIMITS, action)) {
        return jsonResponse(400, { ok: false, msg: '未知认证操作' });
    }
    const retryAfter = authRetryAfter(request, action, action === 'refresh' ? '' : email);
    if (retryAfter) {
        return jsonResponse(429, { ok: false, msg: `请求过于频繁，请约 ${retryAfter} 秒后再试`, retryAfter });
    }
    if (action === 'email-status' || action === 'verify-email') {
        let reservedUid = '', reservedAt = 0;
        try {
            const lookup = await lookupIdToken(payload.idToken);
            if (action === 'email-status') {
                return jsonResponse(200, { ok: true, user: await currentAccount(payload.idToken, lookup) });
            }
            if (globalThis.AccountPolicy.hasVerifiedEmail(lookup)) {
                return jsonResponse(200, { ok: true, alreadyVerified: true, user: await currentAccount(payload.idToken, lookup) });
            }
            const target = globalThis.AccountPolicy.realEmail(payload.email);
            if (!target) return jsonResponse(400, { ok: false, msg: '请填写能够接收邮件的有效邮箱，不能使用手机号或占位邮箱' });
            const remaining = Math.ceil((60000 - (Date.now() - (verificationSentAt.get(lookup.localId) || 0))) / 1000);
            if (remaining > 0) return jsonResponse(429, { ok: false, retryAfter: remaining, msg: `请 ${remaining} 秒后再发送验证邮件` });
            const perUser = rateBucket(`verification-user:${lookup.localId}`, 6);
            if (perUser) return jsonResponse(429, { ok: false, retryAfter: perUser, msg: `验证邮件发送较频繁，请 ${perUser} 秒后重试` });
            // 在网络请求前占用冷却窗口，防止同时点击产生多封邮件。
            reservedUid = lookup.localId;
            reservedAt = Date.now();
            verificationSentAt.set(reservedUid, reservedAt);
            let idToken = payload.idToken;
            if (payload.password) {
                const fresh = await callFirebaseAuth('accounts:signInWithPassword', { email: lookup.email, password: payload.password, returnSecureToken: true });
                if (fresh.localId !== lookup.localId) throw Object.assign(new Error('账号核验失败，请重新登录'), { statusCode: 401 });
                idToken = fresh.idToken;
            }
            const changingEmail = target !== String(lookup.email || '').toLowerCase();
            // 只向 Firebase 发送受控字段；不接受客户端设置 verified、UID 或回跳链接。
            await callFirebaseAuth('accounts:sendOobCode', changingEmail
                ? { requestType: 'VERIFY_AND_CHANGE_EMAIL', idToken, newEmail: target }
                : { requestType: 'VERIFY_EMAIL', idToken, email: target });
            if (verificationSentAt.size > 5000) for (const [uid, time] of verificationSentAt) if (Date.now() - time > 60000) verificationSentAt.delete(uid);
            return jsonResponse(200, { ok: true, sentTo: target, retryAfter: 60, msg: '验证邮件已发送。请点击邮件中的链接，再回到此页面确认。' });
        } catch (error) {
            // Firebase 明确拒绝时没有发信，允许修正邮箱或密码后立即再试；网络结果不明时保留冷却。
            if (error.statusCode < 500 && reservedUid && verificationSentAt.get(reservedUid) === reservedAt) verificationSentAt.delete(reservedUid);
            return jsonResponse(error.statusCode || 502, { ok: false, msg: error.message, code: error.code, reauthRequired: error.code === 'CREDENTIAL_TOO_OLD_LOGIN_AGAIN' });
        }
    }
    if (action === 'refresh') {
        if (!refreshToken) return jsonResponse(400, { ok: false, msg: '缺少刷新令牌' });
        try {
            const authData = await refreshFirebaseToken(refreshToken);
            const lookup = await lookupIdToken(authData.idToken);
            const user = await currentAccount(authData.idToken, lookup);
            return jsonResponse(200, { ok: true, ...authData, user });
        } catch(error) {
            return jsonResponse(401, { ok: false, msg: error.message, code: error.code || 'AUTH_REFRESH_ERROR' });
        }
    }

    if (action === 'subscribe') {
        const normalized = cleanText(email, 254).toLowerCase();
        if (!payload.idToken) return jsonResponse(401, { ok: false, msg: '请先登录后登记' });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return jsonResponse(400, { ok: false, msg: '请输入有效邮箱地址' });
        try {
            const user = await lookupIdToken(payload.idToken);
            if (!user?.localId) return jsonResponse(401, { ok: false, msg: '登录状态已过期，请重新登录' });
            globalThis.AccountPolicy.assertCanUseFeatures(user);
            const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
            const documentId = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
            const collection = FIRESTORE_USER_BASE.replace(/\/users$/, '/subscribers');
            // createDocument + 确定性 ID 完成去重，不读取任何订阅者邮箱。
            const response = await fetchWithTimeout(`${collection}?documentId=${documentId}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${payload.idToken}` },
                body: JSON.stringify({ fields: { email: { stringValue: normalized }, subscribedAt: { stringValue: new Date().toISOString() } } })
            });
            if (!response.ok && response.status !== 409) return jsonResponse(502, { ok: false, msg: '登记暂未成功，请稍后重试' });
            return jsonResponse(200, { ok: true, msg: '邮箱已登记，通知服务开放后会发送更新' });
        } catch (error) { return jsonResponse(error.statusCode || 502, { ok: false, msg: error.message || '登记暂未成功，请稍后重试' }); }
    }

    if (action === 'reset-password') {
        const normalizedEmail = cleanText(email, 254).toLowerCase();
        if (/^tel_.*@xylaoshi\.tel$/.test(normalizedEmail)) {
            return jsonResponse(400, { ok: false, needsSupport: true, msg: '手机号账号无法接收重置邮件，请使用无需登录的账号求助入口。' });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
            return jsonResponse(400, { ok: false, msg: '请输入有效的邮箱地址' });
        }
        try {
            await callFirebaseAuth('accounts:sendOobCode', {
                requestType: 'PASSWORD_RESET',
                email: normalizedEmail
            });
        } catch(error) {
            // 开启邮箱枚举保护后不存在的账号也会返回成功；即便旧配置返回 EMAIL_NOT_FOUND，也保持统一文案。
            if (error.code !== 'EMAIL_NOT_FOUND') {
                return jsonResponse(error.statusCode || 502, { ok: false, msg: error.message, code: error.code || 'AUTH_RESET_ERROR' });
            }
        }
        return jsonResponse(200, { ok: true, msg: '如果该邮箱已注册，密码重置链接将发送到邮箱，请留意收件箱和垃圾邮件箱。' });
    }

    const normalizedEmail = cleanText(email, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
        || typeof password !== 'string'
        || password.length < 6
        || password.length > 256) {
        return jsonResponse(400, { ok: false, msg: '请填写有效账号和至少 6 位密码' });
    }

    try {
        if (action === 'register') {
            if (!globalThis.AccountPolicy.realEmail(normalizedEmail)) return jsonResponse(400, { ok: false, msg: '注册必须使用能够接收邮件的真实邮箱' });
            const submittedProfile = payload.profile || {};
            const profile = {
                name: cleanText(submittedProfile.name, 80),
                school: cleanText(submittedProfile.school, 120),
                joinedAt: new Date().toISOString()
            };
            if (!profile.name) return jsonResponse(400, { ok: false, msg: '请填写姓名' });
            const authData = await callFirebaseAuth('accounts:signUp', {
                email: normalizedEmail,
                password,
                returnSecureToken: true
            });
            // signUp 的请求邮箱即新建 Firebase 账号的认证邮箱；显式传入，避免 profile 冒充管理员邮箱。
            const user = userFromAuth({ ...authData, email: normalizedEmail }, profile);
            // 显示名更新和 Firestore 资料保存互不依赖，并行执行可少等一次海外往返。
            await Promise.all([
                profile.name
                    ? callFirebaseAuth('accounts:update', {
                        idToken: authData.idToken,
                        displayName: profile.name,
                        returnSecureToken: false
                    }).catch(() => null)
                    : Promise.resolve(),
                saveUserProfile(authData.idToken, authData.localId, user)
            ]);
            return jsonResponse(200, { ok: true, ...authData, user });
        }

        if (action === 'login') {
            const authData = await callFirebaseAuth('accounts:signInWithPassword', {
                email: normalizedEmail,
                password,
                returnSecureToken: true
            });
            const user = await currentAccount(authData.idToken);
            return jsonResponse(200, { ok: true, ...authData, user });
        }

        return jsonResponse(400, { ok: false, msg: '未知认证操作' });
    } catch(error) {
        return jsonResponse(error.statusCode || 502, { ok: false, msg: error.message, code: error.code || 'AUTH_PROXY_ERROR' });
    }
}
