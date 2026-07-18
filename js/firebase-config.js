// ===== Firebase 初始化 =====
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyBx7adowufG1syf9ryrsFhywcVMS-sWxWo",
    authDomain: "xylaoshi-28f6c.firebaseapp.com",
    projectId: "xylaoshi-28f6c",
    storageBucket: "xylaoshi-28f6c.firebasestorage.app",
    messagingSenderId: "1056921855623",
    appId: "1:1056921855623:web:7d15c9abb1b90a33fbfa22"
};

firebase.initializeApp(FIREBASE_CONFIG);
const auth = firebase.auth();
const db   = firebase.firestore();
window.PROXY_AUTH_SESSION_KEY = window.PROXY_AUTH_SESSION_KEY || 'xylaoshiProxyAuthSession';
window.LAST_AUTH_USER_KEY = window.LAST_AUTH_USER_KEY || 'xylaoshiLastAuthUser';

// 同步缓存「上次已确认的登录用户」：Firebase 登录态是异步从 IndexedDB 恢复的，
// 页面首帧拿不到，会先按未登录渲染导致「闪一下登录又变回用户名」。这里在登录确认后
// 把用户快照存进 localStorage，下次加载时同步读出来做乐观渲染，Firebase 就绪后再校正。
function rememberLastAuthUser(user) {
    try {
        if (user) localStorage.setItem(window.LAST_AUTH_USER_KEY, JSON.stringify(user));
        else localStorage.removeItem(window.LAST_AUTH_USER_KEY);
    } catch {
        // localStorage 不可用（隐私模式）时忽略，页面仍可正常工作
    }
}
function getLastAuthUser() {
    try {
        const raw = localStorage.getItem(window.LAST_AUTH_USER_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

// ===== 全局 Auth 状态 =====
// 乐观初值：用上次缓存的用户（或代理会话）先渲染，避免登录态闪烁；Firebase 就绪后会校正
let _currentUser = getLastAuthUser() || getProxyAuthUser();
let _authReady   = false;
const _readyCallbacks = [];
const ADMIN_EMAIL = 'admin@xylaoshi.com';

function getStoredUserProfile(uid) {
    try {
        return JSON.parse(localStorage.getItem(`userProfile_${uid}`) || '{}');
    } catch {
        return {};
    }
}

function getProxyAuthUser() {
    try {
        const raw = localStorage.getItem(window.PROXY_AUTH_SESSION_KEY);
        if (!raw) return null;
        const session = JSON.parse(raw);
        if (!session?.user) return null;
        if (session.expiresAt && Date.now() > session.expiresAt) {
            localStorage.removeItem(window.PROXY_AUTH_SESSION_KEY);
            return null;
        }
        return { ...session.user, isProxyAuth: true };
    } catch {
        return null;
    }
}

function authUserFallbackProfile(fbUser) {
    const rawEmail = fbUser.email || '';
    const phoneMatch = rawEmail.match(/^tel_(1[3-9]\d{9})@xylaoshi\.tel$/);
    const stored = getStoredUserProfile(fbUser.uid);
    const phone = phoneMatch ? phoneMatch[1] : (stored.phone || '');
    const email = phoneMatch ? '' : rawEmail;
    const name = fbUser.displayName || stored.name || (phone ? `手机用户${phone.slice(-4)}` : (email.split('@')[0] || '教师用户'));
    return {
        uid: fbUser.uid,
        name,
        email,
        phone,
        school: stored.school || '',
        isAdmin: rawEmail === ADMIN_EMAIL,
        joinedAt: stored.joinedAt || ''
    };
}

auth.onAuthStateChanged(async (fbUser) => {
    if (fbUser) {
        const fallback = authUserFallbackProfile(fbUser);
        try {
            const snap = await db.collection('users').doc(fbUser.uid).get();
            _currentUser = snap.exists
                // 管理员身份只认 Firebase Auth 的邮箱；users 文档只是个人资料，不能授予权限。
                ? { ...fallback, ...snap.data(), uid: fbUser.uid, isAdmin: fallback.isAdmin }
                : fallback;
        } catch {
            _currentUser = fallback;
        }
    } else {
        _currentUser = getProxyAuthUser();
    }
    rememberLastAuthUser(_currentUser);  // 同步缓存，供下次加载乐观渲染

    // 通知等待初始化的回调
    if (!_authReady) {
        _authReady = true;
        _readyCallbacks.splice(0).forEach(fn => fn(_currentUser));
    }

    // 广播 auth 状态变化（供各页面监听）
    document.dispatchEvent(new CustomEvent('authChanged', { detail: _currentUser }));
});

/** 页面初始化时调用，auth 就绪后执行 callback */
function onAuthReady(callback) {
    if (_authReady) Promise.resolve().then(() => callback(_currentUser));
    else _readyCallbacks.push(callback);
}
