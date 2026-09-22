#!/usr/bin/env node
// 离线行为回归：所有上游请求都被替换，绝不发送真实邮件或调用模型。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import '../js/account-policy.js';

let passed = 0, serial = 0;
const check = (condition, message) => { assert.ok(condition, message); passed++; };
const freshAuth = () => import(`../functions/api/auth-proxy.js?email-test=${serial++}`);
const originalFetch = globalThis.fetch;
let account, calls, profile, sendError, loginUid;
const field = value => typeof value === 'boolean' ? { booleanValue: value } : { stringValue: value };
function reset(overrides = {}) {
    account = { localId: 'original-uid', email: 'tel_13800138000@xylaoshi.tel', emailVerified: false, ...overrides };
    profile = { name: '老教师', email: '', phone: '13800138000', school: '原学校', isAdmin: false, joinedAt: '2025-01-01T00:00:00.000Z' };
    calls = []; sendError = ''; loginUid = '';
    globalThis.fetch = async (url, options = {}) => {
        url = String(url);
        const body = options.body ? JSON.parse(options.body) : {};
        calls.push({ url, body, options });
        if (url.includes('accounts:lookup')) return body.idToken === 'expired'
            ? Response.json({ error: { message: 'TOKEN_EXPIRED' } }, { status: 400 }) : Response.json({ users: [account] });
        if (url.includes('accounts:signUp')) return Response.json({ localId: account.localId, email: body.email, idToken: 'new-token', refreshToken: 'refresh', expiresIn: '3600' });
        if (url.includes('accounts:signInWithPassword')) return Response.json({ localId: loginUid || account.localId, email: account.email, idToken: 'fresh-token', refreshToken: 'refresh', expiresIn: '3600' });
        if (url.includes('accounts:sendOobCode')) return sendError
            ? Response.json({ error: { message: sendError } }, { status: 400 }) : Response.json({ email: body.newEmail || body.email });
        if (url.includes('accounts:update')) return Response.json({});
        if (url.includes('/documents/users/')) {
            if (options.method === 'PATCH') profile = Object.fromEntries(Object.entries(body.fields).map(([k, v]) => [k, v.stringValue ?? v.booleanValue]));
            return Response.json({ fields: Object.fromEntries(Object.entries(profile).map(([k, v]) => [k, field(v)])) });
        }
        throw new Error(`未预期上游：${url}`);
    };
}
async function post(module, body) {
    const response = await module.onRequestPost({ request: new Request('https://local.invalid/api/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': `case-${serial++}` }, body: JSON.stringify(body)
    }), env: {} });
    return { status: response.status, data: await response.json() };
}
const verify = extra => ({ action: 'verify-email', idToken: 'old-token', email: 'teacher@example.invalid', ...extra });
try {
    check(AccountPolicy.realEmail(' Teacher@Example.invalid ') === 'teacher@example.invalid', '邮箱标准化');
    for (const email of ['', '13800138000', 'a b@example.com', 'tel_13800138000@XYLAOSHI.TEL']) check(!AccountPolicy.realEmail(email), '拒绝无效或占位邮箱');
    for (const user of [{ email: 'a@example.com' }, { email: 'a@example.com', emailVerified: 'true' }, { email: 'tel_13800138000@xylaoshi.tel', emailVerified: true }]) check(!AccountPolicy.hasVerifiedEmail(user), '不能用伪造或缺失的验证状态解锁');
    check(AccountPolicy.hasVerifiedEmail({ email: 'a@example.com', emailVerified: true }), '真实邮箱验证成功可放行');
    check(AccountPolicy.isAdmin({ localId: AccountPolicy.ADMIN_UID, email: 'new-admin@example.invalid', emailVerified: true }), '管理员绑定新邮箱后保留原权限');
    check(!AccountPolicy.isAdmin({ localId: 'other', email: 'admin@xylaoshi.com', emailVerified: true }), '其他账号占用旧管理员邮箱也不能获得权限');
    check(!AccountPolicy.isAdmin({ uid: AccountPolicy.ADMIN_UID, email: 'admin@xylaoshi.com', emailVerified: false }), '管理员同样需要邮箱验证');
    check(readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8').includes(`request.auth.uid == '${AccountPolicy.ADMIN_UID}'`), '数据库与应用使用同一个管理员身份');

    reset(); let api = await freshAuth();
    for (const email of ['13800138000', 'tel_13800138000@xylaoshi.tel']) {
        const result = await post(api, { action: 'register', email, password: 'test-password', profile: { name: '教师' } });
        check(result.status === 400 && calls.length === 0, '新注册不能使用手机号或占位邮箱');
    }
    const signup = await post(api, { action: 'register', email: 'teacher@example.invalid', password: 'test-password', emailVerified: true, profile: { name: '新教师', emailVerified: true, isAdmin: true, email: 'admin@xylaoshi.com' } });
    check(signup.status === 200 && signup.data.user.emailVerified === false && signup.data.user.isAdmin === false, '注册后的伪造权限不能生效');
    check(!('emailVerified' in calls.find(c => c.url.includes('accounts:signUp')).body), '注册不把客户端验证字段发送到 Firebase');

    reset(); api = await freshAuth();
    const login = await post(api, { action: 'login', email: account.email, password: 'test-password' });
    check(login.status === 200 && login.data.user.uid === 'original-uid' && login.data.user.email === '' && !login.data.user.emailVerified, '旧手机号保留原 UID 并进入待完善状态');
    const sent = await post(api, verify({ localId: 'forged-uid', emailVerified: true, continueUrl: 'https://evil.invalid' }));
    const oob = calls.find(c => c.url.includes('accounts:sendOobCode')).body;
    check(sent.status === 200 && sent.data.sentTo === 'teacher@example.invalid', '旧手机号可以发送绑定邮件');
    check(oob.requestType === 'VERIFY_AND_CHANGE_EMAIL' && oob.newEmail === 'teacher@example.invalid' && oob.idToken === 'old-token', '先验证新邮箱，再由 Firebase 更新原账号');
    check(Object.keys(oob).length === 3, '不能注入 UID、验证标志或外部回跳地址');
    check(!calls.some(c => c.options.method === 'PATCH' || c.url.includes('accounts:update') || c.url.includes('accounts:signUp')), '发送邮件不提前改邮箱、不新建账号');
    const before = await post(api, { action: 'email-status', idToken: 'old-token', emailVerified: true });
    check(!before.data.user.emailVerified && before.data.user.email === '', '仅发送邮件不能解锁');
    const repeated = await post(api, verify({ email: 'another@example.invalid' }));
    check(repeated.status === 429 && repeated.data.retryAfter > 0, '同一账号更换目标邮箱也不能绕过冷却');

    account = { ...account, email: 'teacher@example.invalid', emailVerified: true };
    const after = await post(api, { action: 'email-status', idToken: 'fresh-token' });
    check(after.data.user.uid === 'original-uid' && after.data.user.emailVerified, '验证成功后仍为原账号');
    check(profile.email === 'teacher@example.invalid' && profile.phone === '13800138000' && profile.school === '原学校' && profile.joinedAt === '2025-01-01T00:00:00.000Z', '同步邮箱时保留手机号、学校和加入日期');
    check(calls.filter(c => c.url.includes('/documents/')).every(c => c.url.endsWith('/users/original-uid')), '绑定只更新当前用户资料，不碰作品集合');
    const count = calls.filter(c => c.url.includes('accounts:sendOobCode')).length;
    const already = await post(api, verify({ email: 'other@example.invalid' }));
    check(already.data.alreadyVerified && calls.filter(c => c.url.includes('accounts:sendOobCode')).length === count, '已验证账号不能利用完善入口任意换邮箱');

    reset({ email: 'teacher@example.invalid' }); api = await freshAuth();
    check((await post(api, verify())).status === 200 && calls.at(-1).body.requestType === 'VERIFY_EMAIL', '新邮箱账号发送普通验证邮件');
    reset(); api = await freshAuth();
    const parallel = await Promise.all([post(api, verify()), post(api, verify())]);
    check(parallel.filter(r => r.status === 200).length === 1 && calls.filter(c => c.url.includes('accounts:sendOobCode')).length === 1, '并发发送只能成功一次');

    reset(); api = await freshAuth(); sendError = 'CREDENTIAL_TOO_OLD_LOGIN_AGAIN';
    const recent = await post(api, verify());
    check(recent.status === 400 && recent.data.reauthRequired, '登录过久时要求重新核验密码');
    sendError = '';
    const retry = await post(api, verify({ password: 'test-password' }));
    check(retry.status === 200 && calls.at(-1).body.idToken === 'fresh-token', '明确拒绝后可立即输入密码重试，并使用新令牌');
    check(calls.find(c => c.url.includes('accounts:signInWithPassword')).body.email === 'tel_13800138000@xylaoshi.tel', '再次认证使用当前真实账号身份');
    reset(); api = await freshAuth(); loginUid = 'different-uid';
    check((await post(api, verify({ password: 'test-password' }))).status === 401 && !calls.some(c => c.url.includes('sendOobCode')), '重新认证不能切换 UID');
    reset(); api = await freshAuth(); sendError = 'EMAIL_EXISTS';
    check((await post(api, verify())).status === 400, '被其他账号占用的邮箱返回可理解的错误');
    check((await post(api, verify({ idToken: 'expired' }))).status === 401, '过期身份不能发送邮件');
    check((await post(api, verify({ idToken: '' }))).status === 401, '访客不能发送绑定邮件');

    // 各条后台通路均检查新鲜的 Firebase 认证状态，而非浏览器提供的状态。
    const endpoints = [
        ['agent', { messages: [{ role: 'user', content: '测试' }] }], ['works', { action: 'list' }],
        ['admin-users', { action: 'listUsers' }], ['analytics', { action: 'summary' }],
        ['auth-proxy', { action: 'subscribe', email: 'teacher@example.invalid' }]
    ];
    for (const [name, body] of endpoints) {
        reset({ email: 'admin@xylaoshi.com', emailVerified: false });
        const module = await import(`../functions/api/${name}.js?email-guard=${serial++}`);
        const result = await post(module, { ...body, idToken: 'token', adminIdToken: 'token', emailVerified: true, isAdmin: true });
        check(result.status === 403, `${name} 拒绝未验证用户（包括管理员）`);
        check(calls.length === 1 && calls[0].url.includes('accounts:lookup'), `${name} 拦截后不能读取业务数据或调用模型`);
    }

    // 重现慢速资料请求与切换账号 / 邮箱验证响应交错，避免旧身份覆盖新状态。
    const storage = () => { const values = new Map(); return { getItem: k => values.get(k) || null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) }; };
    let authChanged;
    const sdk = { currentUser: null, onAuthStateChanged: callback => { authChanged = callback; } };
    const pendingProfiles = new Map();
    const sandbox = vm.createContext({
        firebase: { initializeApp() {}, auth: () => sdk, firestore: () => ({ collection: () => ({ doc: uid => ({ get: () => new Promise(resolve => pendingProfiles.set(uid, resolve)) }) }) }) },
        localStorage: storage(), sessionStorage: storage(), document: { dispatchEvent() {} },
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } }
    });
    vm.runInContext('window = globalThis', sandbox);
    vm.runInContext(readFileSync(new URL('../js/account-policy.js', import.meta.url), 'utf8'), sandbox);
    vm.runInContext(readFileSync(new URL('../js/firebase-config.js', import.meta.url), 'utf8'), sandbox);
    const old = { uid: 'old', email: 'old@example.invalid', emailVerified: true };
    const next = { uid: 'next', email: 'next@example.invalid', emailVerified: false };
    sdk.currentUser = old; const oldRead = authChanged(old);
    sdk.currentUser = next; const nextRead = authChanged(next);
    pendingProfiles.get('next')({ exists: true, data: () => ({ email: 'admin@xylaoshi.com', emailVerified: true, isAdmin: true }) });
    await nextRead;
    check(vm.runInContext('_currentUser.uid === "next" && !_currentUser.emailVerified && !_currentUser.isAdmin', sandbox), '资料文档不能伪造验证和管理员权限');
    pendingProfiles.get('old')({ exists: false }); await oldRead;
    check(vm.runInContext('_currentUser.uid === "next"', sandbox), '旧账号的慢速请求不能覆盖当前账号');
    const sameRead = authChanged(next);
    sandbox.sessionStorage.setItem('xylaoshiProxyAuthSession', JSON.stringify({ idToken: 'fresh', expiresAt: Date.now() + 60000, user: { ...next, emailVerified: true } }));
    pendingProfiles.get('next')({ exists: true, data: () => ({ name: '教师', emailVerified: false }) }); await sameRead;
    check(vm.runInContext('_currentUser.emailVerified === true', sandbox), '慢速 SDK 资料加载不能把已完成验证的账号退回未验证状态');
    console.log(`邮箱验证回归通过：${passed} 项行为断言（离线，无真实邮件或模型调用）。`);
} finally { globalThis.fetch = originalFetch; }
