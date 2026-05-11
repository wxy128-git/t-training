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

// ===== 全局 Auth 状态 =====
let _currentUser = null;
let _authReady   = false;
const _readyCallbacks = [];
const ADMIN_EMAIL = 'admin@xylaoshi.com';

auth.onAuthStateChanged(async (fbUser) => {
    if (fbUser) {
        try {
            const snap = await db.collection('users').doc(fbUser.uid).get();
            _currentUser = snap.exists
                ? { uid: fbUser.uid, ...snap.data() }
                : { uid: fbUser.uid, email: fbUser.email, name: fbUser.email.split('@')[0], isAdmin: false };
        } catch {
            _currentUser = { uid: fbUser.uid, email: fbUser.email, name: fbUser.email.split('@')[0], isAdmin: false };
        }
    } else {
        _currentUser = null;
    }

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
