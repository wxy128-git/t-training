const FIREBASE_API_KEY = 'AIzaSyBx7adowufG1syf9ryrsFhywcVMS-sWxWo';
const FIREBASE_PROJECT_ID = 'xylaoshi-28f6c';
const FIREBASE_AUTH_BASE = 'https://identitytoolkit.googleapis.com/v1';
const FIRESTORE_ROOT = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
const ADMIN_EMAIL = 'admin@xylaoshi.com';
const ADMIN_SCOPES = [
    'https://www.googleapis.com/auth/datastore',
    'https://www.googleapis.com/auth/identitytoolkit'
].join(' ');

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const EVENT_ACTIONS = new Set([
    'page_view',
    'agent_open',
    'agent_run',
    'generation_failed',
    'draft_restored',
    'project_saved',
    'teacher_reviewed',
    'result_feedback',
    'workflow_continue',
    'workbook_view',
    'workbook_open',
    'workbook_save',
    'multimodal_case_open',
    'multimodal_video_open',
    'multimodal_audio_play'
]);

const EVENT_FEATURES = new Set([
    'site',
    'agents',
    'workspace',
    'multimodal',
    'classroom',
    'tools',
    'prompts',
    'paths',
    'articles',
    'resources',
    'news'
]);

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
        const error = new Error('服务器缺少 Firebase 管理凭据，暂时不能写入统计数据');
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

async function verifyAdmin(adminIdToken) {
    const user = await lookupIdToken(adminIdToken);
    if (!user) {
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

function clampString(value, max = 160) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeId(value, max = 128) {
    return String(value || '').trim().slice(0, max);
}

function safeMeta(meta) {
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
    const out = {};
    Object.entries(meta).slice(0, 12).forEach(([key, value]) => {
        const k = clampString(key, 40);
        if (!k) return;
        if (typeof value === 'number' && Number.isFinite(value)) out[k] = value;
        else if (typeof value === 'boolean') out[k] = value;
        else out[k] = clampString(value, 180);
    });
    return out;
}

function chinaDay(date = new Date()) {
    return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function addDays(day, offset) {
    const [y, m, d] = day.split('-').map(Number);
    const utc = Date.UTC(y, m - 1, d + offset);
    return new Date(utc).toISOString().slice(0, 10);
}

function chinaDayToUtcIso(day) {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d) - 8 * 60 * 60 * 1000).toISOString();
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
        return { arrayValue: { values: value.slice(0, 30).map(firestoreValue) } };
    }
    if (typeof value === 'object') {
        const fields = {};
        Object.entries(value).forEach(([k, v]) => { fields[k] = firestoreValue(v); });
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

async function addDocument(accessToken, collection, data) {
    const response = await fetch(`${FIRESTORE_ROOT}/${collection}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields: firestoreFields(data) })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(body?.error?.message || '统计数据写入失败');
        error.statusCode = response.status;
        throw error;
    }
    return body;
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
        const error = new Error(body?.error?.message || '统计数据读取失败');
        error.statusCode = response.status;
        throw error;
    }
    return body.filter(row => row.document).map(row => parseDocument(row.document));
}

function normalizeEvent(raw = {}, verifiedUser, request) {
    const action = EVENT_ACTIONS.has(raw.action) ? raw.action : '';
    if (!action) {
        const error = new Error('未知统计事件');
        error.statusCode = 400;
        throw error;
    }

    const feature = EVENT_FEATURES.has(raw.feature) ? raw.feature : 'site';
    const profile = verifiedUser && raw.user && typeof raw.user === 'object' ? raw.user : {};
    const now = new Date();

    return {
        action,
        feature,
        ts: now,
        day: chinaDay(now),
        visitorId: normalizeId(raw.visitorId),
        sessionId: normalizeId(raw.sessionId),
        path: clampString(raw.path, 260),
        pageTitle: clampString(raw.pageTitle, 120),
        referrer: clampString(raw.referrer, 260),
        targetId: normalizeId(raw.targetId),
        targetName: clampString(raw.targetName, 120),
        uid: verifiedUser?.localId || '',
        userEmail: verifiedUser ? clampString(profile.email || verifiedUser.email || '', 120) : '',
        userPhone: verifiedUser ? clampString(profile.phone || '', 40) : '',
        userName: verifiedUser ? clampString(profile.name || verifiedUser.displayName || '', 80) : '',
        userSchool: verifiedUser ? clampString(profile.school || '', 120) : '',
        meta: safeMeta(raw.meta)
    };
}

function emptyDaily(days) {
    const map = new Map();
    days.forEach(day => {
        map.set(day, {
            day,
            visitors: 0,
            pageViews: 0,
            agentRuns: 0,
            generationFailures: 0,
            teacherReviews: 0,
            workbookSaves: 0,
            workbookUses: 0,
            multimodalUses: 0,
            _visitors: new Set()
        });
    });
    return map;
}

function sortedTop(map, limit = 8) {
    return [...map.values()]
        .sort((a, b) => b.count - a.count || String(a.name).localeCompare(String(b.name), 'zh-CN'))
        .slice(0, limit);
}

function summarizeEvents(events, days) {
    const daily = emptyDaily(days);
    const users = new Map();
    const topAgents = new Map();
    const topMultimodal = new Map();
    let pageViews = 0;
    const visitors = new Set();
    const loggedUsers = new Set();
    let agentRuns = 0;
    let generationFailures = 0;
    let teacherReviews = 0;
    let workbookSaves = 0;
    let projectSaves = 0;
    let workflowContinues = 0;
    let totalGenerationMs = 0;
    let generationDurationCount = 0;
    let workbookUses = 0;
    let multimodalUses = 0;
    const feedbackReasons = new Map();
    const funnelSets = {
        opened: new Set(),
        generated: new Set(),
        reviewed: new Set(),
        saved: new Set(),
        continued: new Set()
    };

    function userRow(e) {
        if (!e.uid) return null;
        if (!users.has(e.uid)) {
            users.set(e.uid, {
                uid: e.uid,
                name: e.userName || '未命名用户',
                account: e.userEmail || e.userPhone || '',
                school: e.userSchool || '',
                visits: 0,
                agentRuns: 0,
                workbookUses: 0,
                multimodalUses: 0,
                lastAction: '',
                lastSeen: ''
            });
        }
        return users.get(e.uid);
    }

    events.forEach(e => {
        const day = e.day || (e.ts ? chinaDay(new Date(e.ts)) : '');
        const d = daily.get(day);
        const visitorKey = e.visitorId || e.uid || e.sessionId || '';
        const sessionKey = e.sessionId || e.uid || e.visitorId || '';
        if (e.action === 'page_view') {
            pageViews += 1;
            if (visitorKey) visitors.add(visitorKey);
            if (d) {
                d.pageViews += 1;
                if (visitorKey) d._visitors.add(visitorKey);
            }
        }
        if (e.uid) loggedUsers.add(e.uid);

        const row = userRow(e);
        if (row) {
            if (e.action === 'page_view') row.visits += 1;
            if (!row.lastSeen || String(e.ts || '') > row.lastSeen) {
                row.lastSeen = e.ts || '';
                row.lastAction = e.action;
                row.name = e.userName || row.name;
                row.account = e.userEmail || e.userPhone || row.account;
                row.school = e.userSchool || row.school;
            }
        }

        if (e.action === 'agent_run') {
            agentRuns += 1;
            if (d) d.agentRuns += 1;
            if (row) row.agentRuns += 1;
            if (sessionKey) funnelSets.generated.add(sessionKey);
            const duration = Number(e.meta?.durationMs || 0);
            if (duration > 0 && duration < 10 * 60 * 1000) {
                totalGenerationMs += duration;
                generationDurationCount += 1;
            }
            const key = e.targetId || e.targetName || 'unknown';
            const item = topAgents.get(key) || { id: e.targetId || key, name: e.targetName || key, count: 0 };
            item.count += 1;
            topAgents.set(key, item);
        }

        if (e.action === 'agent_open' && sessionKey) funnelSets.opened.add(sessionKey);
        if (e.action === 'generation_failed') {
            generationFailures += 1;
            if (d) d.generationFailures += 1;
        }
        if (e.action === 'teacher_reviewed') {
            teacherReviews += 1;
            if (d) d.teacherReviews += 1;
            if (sessionKey) funnelSets.reviewed.add(sessionKey);
        }
        if (e.action === 'project_saved') projectSaves += 1;
        if (e.action === 'workflow_continue') {
            workflowContinues += 1;
            if (sessionKey) funnelSets.continued.add(sessionKey);
        }
        if (e.action === 'result_feedback') {
            const reason = clampString(e.meta?.reason || 'unknown', 80);
            feedbackReasons.set(reason, (feedbackReasons.get(reason) || 0) + 1);
        }

        const isWorkbook = e.action === 'workbook_save' || e.action === 'workbook_open' || e.action === 'workbook_view';
        if (isWorkbook) {
            workbookUses += 1;
            if (d) d.workbookUses += 1;
            if (row) row.workbookUses += 1;
        }
        if (e.action === 'workbook_save') {
            workbookSaves += 1;
            if (d) d.workbookSaves += 1;
            if (sessionKey) funnelSets.saved.add(sessionKey);
        }

        const isMultimodal = e.action === 'multimodal_case_open' || e.action === 'multimodal_video_open' || e.action === 'multimodal_audio_play' || (e.action === 'page_view' && e.feature === 'multimodal');
        if (isMultimodal) {
            multimodalUses += 1;
            if (d) d.multimodalUses += 1;
            if (row) row.multimodalUses += 1;
            if (e.action !== 'page_view') {
                const key = e.targetId || e.targetName || 'unknown';
                const item = topMultimodal.get(key) || { id: e.targetId || key, name: e.targetName || key, count: 0 };
                item.count += 1;
                topMultimodal.set(key, item);
            }
        }
    });

    const dailyRows = [...daily.values()].map(d => {
        const { _visitors, ...row } = d;
        row.visitors = _visitors.size;
        return row;
    });

    const userRows = [...users.values()]
        .sort((a, b) => String(b.lastSeen || '').localeCompare(String(a.lastSeen || '')))
        .slice(0, 80);

    const recent = events
        .filter(e => e.uid)
        .slice(0, 40)
        .map(e => ({
            ts: e.ts || '',
            action: e.action || '',
            feature: e.feature || '',
            targetName: e.targetName || '',
            userName: e.userName || '未命名用户',
            account: e.userEmail || e.userPhone || ''
        }));

    const openedSessions = funnelSets.opened.size;
    const withinOpened = set => [...set].filter(id => funnelSets.opened.has(id)).length;
    const funnel = [
        ['opened', '进入任务', funnelSets.opened.size],
        ['generated', '成功生成', withinOpened(funnelSets.generated)],
        ['reviewed', '完成核验', withinOpened(funnelSets.reviewed)],
        ['saved', '保存成果', withinOpened(funnelSets.saved)],
        ['continued', '继续下一步', withinOpened(funnelSets.continued)]
    ].map(([key, label, count]) => ({ key, label, count, rate: openedSessions ? Math.round(count / openedSessions * 100) : 0 }));

    return {
        totals: {
            visitors: visitors.size,
            pageViews,
            loggedUsers: loggedUsers.size,
            agentRuns,
            generationFailures,
            teacherReviews,
            workbookSaves,
            projectSaves,
            workflowContinues,
            averageGenerationMs: generationDurationCount ? Math.round(totalGenerationMs / generationDurationCount) : 0,
            workbookUses,
            multimodalUses,
            eventCount: events.length
        },
        daily: dailyRows,
        users: userRows,
        topAgents: sortedTop(topAgents),
        topMultimodal: sortedTop(topMultimodal),
        funnel,
        feedbackReasons: [...feedbackReasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
        recent
    };
}

function rangeDays(payload = {}) {
    const allowed = [7, 14, 30, 60, 90];
    const n = Number(payload.days || 14);
    return allowed.includes(n) ? n : 14;
}

async function handleSummary(payload, env) {
    await verifyAdmin(payload.adminIdToken);
    const accessToken = await getGoogleAccessToken(env);
    const daysCount = rangeDays(payload);
    const today = chinaDay(new Date());
    const startDay = addDays(today, -(daysCount - 1));
    const endDay = addDays(today, 1);
    const days = Array.from({ length: daysCount }, (_, i) => addDays(startDay, i));

    const events = await runQuery(accessToken, {
        from: [{ collectionId: 'analytics_events' }],
        where: {
            compositeFilter: {
                op: 'AND',
                filters: [
                    {
                        fieldFilter: {
                            field: { fieldPath: 'ts' },
                            op: 'GREATER_THAN_OR_EQUAL',
                            value: { timestampValue: chinaDayToUtcIso(startDay) }
                        }
                    },
                    {
                        fieldFilter: {
                            field: { fieldPath: 'ts' },
                            op: 'LESS_THAN',
                            value: { timestampValue: chinaDayToUtcIso(endDay) }
                        }
                    }
                ]
            }
        },
        orderBy: [{ field: { fieldPath: 'ts' }, direction: 'DESCENDING' }],
        limit: 6000
    });

    return {
        ok: true,
        range: { days: daysCount, startDay, endDay: addDays(endDay, -1) },
        truncated: events.length >= 6000,
        ...summarizeEvents(events, days)
    };
}

async function handleTrack(payload, request, env) {
    const accessToken = await getGoogleAccessToken(env);
    const rawEvent = payload.event || {};
    let verifiedUser = null;
    if (payload.idToken) {
        try { verifiedUser = await lookupIdToken(payload.idToken); } catch {}
    }
    const event = normalizeEvent(rawEvent, verifiedUser, request);
    await addDocument(accessToken, 'analytics_events', event);
    return { ok: true };
}

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost({ request, env }) {
    const len = Number(request.headers.get('content-length') || 0);
    if (len > 20000) return jsonResponse(413, { ok: false, msg: '统计请求过大' });

    let payload;
    try {
        payload = await request.json();
    } catch {
        return jsonResponse(400, { ok: false, msg: '请求格式不正确' });
    }

    try {
        if (payload.action === 'track') {
            const result = await handleTrack(payload, request, env);
            return jsonResponse(200, result);
        }
        if (payload.action === 'summary') {
            const result = await handleSummary(payload, env);
            return jsonResponse(200, result);
        }
        return jsonResponse(400, { ok: false, msg: '未知统计操作' });
    } catch (error) {
        return jsonResponse(error.statusCode || 500, {
            ok: false,
            msg: error.message || '统计服务暂时不可用'
        });
    }
}
