/* ===== Auth 操作（Firebase） ===== */

function escapeAuthHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function parseIdentifier(val) {
    const cleaned = String(val || '').replace(/\s/g, '');
    if (/^1[3-9]\d{9}$/.test(cleaned)) {
        return { authEmail: `tel_${cleaned}@xylaoshi.tel`, isPhone: true, phone: cleaned };
    }
    return { authEmail: cleaned.toLowerCase(), isPhone: false, phone: null };
}

function rememberUserProfile(uid, data) {
    try {
        localStorage.setItem(`userProfile_${uid}`, JSON.stringify(data));
    } catch {
        // localStorage may be unavailable in private browsing; registration should still continue.
    }
}

function rememberProxyAuthSession(authData, persistent = true) {
    const expiresIn = Number(authData.expiresIn || 3600);
    const session = JSON.stringify({
        idToken: authData.idToken || '',
        refreshToken: authData.refreshToken || '',
        expiresAt: Date.now() + Math.max(300, expiresIn - 60) * 1000,
        user: authData.user,
        persistent
    });
    try {
        const target = persistent ? localStorage : sessionStorage;
        const other = persistent ? sessionStorage : localStorage;
        target.setItem(window.PROXY_AUTH_SESSION_KEY, session);
        other.removeItem(window.PROXY_AUTH_SESSION_KEY);
    } catch {
        // Login still counts for the current page even if storage is unavailable.
    }
}

function forgetProxyAuthSession() {
    try { localStorage.removeItem(window.PROXY_AUTH_SESSION_KEY); } catch {}
    try { sessionStorage.removeItem(window.PROXY_AUTH_SESSION_KEY); } catch {}
}

function getStoredProxyAuthSession(options = {}) {
    const stores = [
        { storage: globalThis.sessionStorage, persistent: false },
        { storage: globalThis.localStorage, persistent: true }
    ];
    for (const { storage, persistent } of stores) {
        try {
            const raw = storage.getItem(window.PROXY_AUTH_SESSION_KEY);
            if (!raw) continue;
            const session = JSON.parse(raw);
            const expired = session.expiresAt && Date.now() > session.expiresAt;
            if (!session?.idToken || (expired && !session.refreshToken)) {
                storage.removeItem(window.PROXY_AUTH_SESSION_KEY);
                continue;
            }
            if (expired && !options.allowExpired) return null;
            return { ...session, persistent: session.persistent ?? persistent };
        } catch {
            // Try the other storage area.
        }
    }
    return null;
}

const AUTH_PROXY_TIMEOUT_MS = 8000;

function shouldUseAuthProxyFirst(action = 'login') {
    // 国内网络下浏览器直连 Firebase Auth 可能长时间无响应；登录和注册都优先走同源代理。
    // 代理注册成功后会立即 return，后台仅做 Firebase sign-in 同步，绝不再次 createUser。
    return action === 'login' || action === 'register';
}

async function callAuthProxy(action, payload, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AUTH_PROXY_TIMEOUT_MS);
    let response;
    let data;
    try {
        response = await fetch('/api/auth-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, ...payload }),
            signal: controller.signal
        });
        data = await response.json().catch(() => ({}));
    } catch(error) {
        if (error?.name === 'AbortError') {
            const timeoutError = new Error('认证服务连接超时，请稍后重试');
            timeoutError.isNetworkError = true;
            timeoutError.isTimeout = true;
            throw timeoutError;
        }
        error.isNetworkError = true;
        throw error;
    } finally {
        clearTimeout(timeout);
    }
    if (!response.ok || data.ok === false) {
        const error = new Error(data.msg || '认证代理请求失败');
        error.code = data.code || 'AUTH_PROXY_ERROR';
        error.status = response.status;
        throw error;
    }
    if (data.idToken && data.user?.uid) {
        rememberProxyAuthSession(data, options.persistent !== false);
        rememberUserProfile(data.user.uid, data.user);
        _currentUser = data.user;
        rememberLastAuthUser(_currentUser);
        document.dispatchEvent(new CustomEvent('authChanged', { detail: _currentUser }));
    }
    return { ok: true, viaProxy: true, msg: data.msg || '' };
}

async function refreshProxyAuthSession() {
    const session = getStoredProxyAuthSession({ allowExpired: true });
    if (!session?.refreshToken) return null;
    try {
        await callAuthProxy('refresh', { refreshToken: session.refreshToken }, { persistent: session.persistent });
        return getStoredProxyAuthSession();
    } catch(e) {
        forgetProxyAuthSession();
        throw e;
    }
}

function syncFirebaseAuthAfterProxy(authEmail, password, remember) {
    Promise.resolve().then(async () => {
        try {
            await auth.setPersistence(remember ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION);
        } catch {}
        try {
            await auth.signInWithEmailAndPassword(authEmail, password);
        } catch(e) {
            console.warn('firebaseAuthSyncAfterProxy:', e.code || e.message);
        }
    });
}

const Auth = {
    getCurrentUser() { return _currentUser; },
    isAdmin() { return _currentUser?.isAdmin === true; },
    async getIdToken() {
        const proxySession = getStoredProxyAuthSession();
        if (proxySession?.idToken) return proxySession.idToken;
        const refreshedProxySession = await refreshProxyAuthSession().catch(() => null);
        if (refreshedProxySession?.idToken) return refreshedProxySession.idToken;
        if (auth.currentUser) return auth.currentUser.getIdToken(false);
        throw new Error('登录状态已过期，请重新登录');
    },

    async sendPasswordReset(identifier) {
        const { authEmail, isPhone } = parseIdentifier(identifier);
        // 手机号账号用的是占位邮箱（tel_…@xylaoshi.tel），无法收信，只能找管理员重置。
        if (isPhone) {
            return { ok: false, msg: '手机号注册的账号无法通过邮件重置密码，请用「联系我们」联系管理员协助重置。' };
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authEmail)) {
            return { ok: false, msg: '请输入有效的邮箱地址' };
        }
        try {
            const result = await callAuthProxy('reset-password', { email: authEmail });
            return { ok: true, msg: result.msg || '如果该邮箱已注册，密码重置链接将发送到邮箱，请留意收件箱。' };
        } catch(proxyError) {
            // 本地静态预览没有 Pages Function 时才退回浏览器 Firebase SDK。
            if (proxyError?.status !== 404) return { ok: false, msg: proxyError.message || '发送失败，请稍后重试' };
        }
        try {
            await auth.sendPasswordResetEmail(authEmail);
            return { ok: true, msg: '如果该邮箱已注册，密码重置链接将发送到邮箱，请留意收件箱和垃圾邮件箱。' };
        } catch(e) {
            const msgs = {
                'auth/user-not-found': '该邮箱尚未注册，请确认邮箱或先注册账号',
                'auth/invalid-email': '邮箱格式不正确',
                'auth/missing-email': '请输入邮箱地址',
                'auth/too-many-requests': '请求过于频繁，请稍后再试',
                'auth/network-request-failed': '网络连接异常，请检查网络后重试'
            };
            return { ok: false, msg: msgs[e.code] || ('发送失败：' + e.message) };
        }
    },

    async login(identifier, password, remember) {
        const { authEmail } = parseIdentifier(identifier);
        // 「记住我」：勾选=LOCAL（关浏览器仍登录），不勾=SESSION（关浏览器即退出，公用电脑更安全）
        try {
            await auth.setPersistence(remember ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION);
        } catch {}
        if (shouldUseAuthProxyFirst('login')) {
            try {
                const result = await callAuthProxy('login', { email: authEmail, password }, { persistent: remember });
                syncFirebaseAuthAfterProxy(authEmail, password, remember);
                return result;
            } catch(proxyError) {
                // 正式站的代理网络异常时不再回落到国内网络可能不可达的 Firebase SDK，
                // 这样超时后按钮能及时恢复并给出可操作反馈。仅本地静态预览的 404 才走 SDK。
                if (proxyError?.status !== 404) return { ok: false, msg: `登录失败：${proxyError.message}` };
                console.warn('authProxyLoginUnavailable:', proxyError.message);
            }
        }
        try {
            await auth.signInWithEmailAndPassword(authEmail, password);
            return { ok: true };
        } catch(e) {
            const msgs = {
                'auth/user-not-found': '账号不存在，请先注册',
                'auth/wrong-password': '密码错误',
                'auth/invalid-credential': '账号或密码错误',
                'auth/invalid-email': '邮箱格式不正确',
                'auth/too-many-requests': '尝试次数过多，请稍后再试',
                'auth/user-disabled': '该账号已被停用'
            };
            if (e.code === 'auth/network-request-failed') {
                try {
                    return await callAuthProxy('login', { email: authEmail, password }, { persistent: remember });
                } catch(proxyError) {
                    return { ok: false, msg: `登录失败：${proxyError.message}` };
                }
            }
            return { ok: false, msg: msgs[e.code] || ('登录失败：' + e.message) };
        }
    },

    async register(name, identifier, school, password) {
        if (!name || !identifier || !password) return { ok: false, msg: '请填写所有必填项' };
        const { authEmail, isPhone, phone } = parseIdentifier(identifier);
        if (isPhone && !/^1[3-9]\d{9}$/.test(phone)) return { ok: false, msg: '请输入有效手机号' };
        if (!isPhone && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authEmail)) return { ok: false, msg: '请输入有效邮箱或手机号' };
        if (password.length < 6) return { ok: false, msg: '密码至少 6 位' };
        const userData = {
            name,
            email: isPhone ? '' : authEmail,
            phone: phone || '',
            school: school || '',
            isAdmin: authEmail === ADMIN_EMAIL,
            joinedAt: new Date().toISOString()
        };
        if (shouldUseAuthProxyFirst('register')) {
            try {
                const result = await callAuthProxy('register', { email: authEmail, password, profile: userData }, { persistent: true });
                // 代理已经创建账号并写入会话；这里只在后台恢复 Firebase SDK 状态，不会重复注册。
                syncFirebaseAuthAfterProxy(authEmail, password, true);
                return result;
            } catch(proxyError) {
                // 注册不是幂等操作。网络中断、超时或服务端 5xx 时，账号可能已创建但响应丢失，
                // 不能再用浏览器 SDK 盲目 createUser，否则会造成“已注册”误报和重复提交困惑。
                if (proxyError?.isNetworkError || proxyError?.status >= 500) {
                    const prefix = proxyError?.isTimeout ? '注册请求连接超时。' : '注册请求暂未确认。';
                    return { ok: false, msg: `${prefix}为避免重复创建，请稍候用同一账号尝试登录；若仍无法登录，再重新注册。` };
                }
                // 本地静态预览没有 Pages Function 时才安全地退回浏览器 Firebase SDK。
                if (proxyError?.status !== 404) return { ok: false, msg: `注册失败：${proxyError.message}` };
                console.warn('authProxyRegisterUnavailable:', proxyError.message);
            }
        }
        try {
            try { await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL); } catch {}
            const cred = await auth.createUserWithEmailAndPassword(authEmail, password);
            try {
                await cred.user.updateProfile({ displayName: name });
            } catch(e) {
                console.warn('updateProfile:', e.message);
            }
            rememberUserProfile(cred.user.uid, userData);
            try {
                await db.collection('users').doc(cred.user.uid).set(userData, { merge: true });
            } catch(e) {
                console.warn('saveUserProfile:', e.message);
            }
            _currentUser = { uid: cred.user.uid, ...userData };
            rememberLastAuthUser(_currentUser);
            document.dispatchEvent(new CustomEvent('authChanged', { detail: _currentUser }));
            return { ok: true };
        } catch(e) {
            const msgs = {
                'auth/email-already-in-use': '该账号已被注册，请直接登录',
                'auth/weak-password': '密码强度不足，请使用更复杂的密码',
                'auth/invalid-email': '邮箱格式不正确',
                'auth/network-request-failed': '网络连接异常，请检查网络后重试',
                'auth/operation-not-allowed': 'Firebase 未开启邮箱/密码注册，请在 Firebase Authentication 中启用 Email/Password',
                'auth/too-many-requests': '注册请求过于频繁，请稍后再试',
                'auth/unauthorized-domain': '当前访问域名未加入 Firebase 授权域名，请在 Firebase Authentication 中添加该域名'
            };
            if (e.code === 'auth/network-request-failed') {
                return { ok: false, msg: '注册请求未确认。为避免重复创建，请稍候用同一账号尝试登录；若仍无法登录，再重新注册。' };
            }
            return { ok: false, msg: msgs[e.code] || ('注册失败：' + e.message) };
        }
    },

    async logout() {
        try { await auth.signOut(); } catch {}                                // 先真正登出：清掉本机 Firebase 令牌（本地操作、几毫秒完成）
        forgetProxyAuthSession();
        rememberLastAuthUser(null);
        _currentUser = null;
        refreshAuthUI();                                                       // 登出确认后再切到未登录界面（原地更新，不整页 reload）
        document.dispatchEvent(new CustomEvent('authRefresh', { detail: null }));  // 备课本→登录门 / 后台→reload
    }
};

/* ===== 登录门禁 ===== */
const PROTECTED_PAGE_NAMES = new Set([
    'workspace.html',
    'admin.html'
]);

function promptLoginRequired(message = '请先登录后使用该功能') {
    showToast(message);
    if (typeof showAuthModal === 'function') {
        setTimeout(() => showAuthModal('login'), 80);
    }
}

function requireLogin(onReady, message = '请先登录后使用该功能') {
    const user = Auth.getCurrentUser();
    if (user) {
        if (typeof onReady === 'function') onReady(user);
        return user;
    }
    if (typeof onAuthReady === 'function' && !_authReady) {
        showToast('正在确认登录状态...');
        onAuthReady(readyUser => {
            if (readyUser) {
                if (typeof onReady === 'function') onReady(readyUser);
            } else {
                promptLoginRequired(message);
            }
        });
        return null;
    }
    promptLoginRequired(message);
    return null;
}

function pageNameFromUrl(url) {
    const path = url.pathname.replace(/\/+$/, '');
    const last = path.split('/').pop() || 'index.html';
    if (!last || last === '/') return 'index.html';
    return last.includes('.') ? last : `${last}.html`;
}

function isProtectedHref(href) {
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return false;
    let url;
    try {
        url = new URL(href, location.href);
    } catch {
        return false;
    }
    if (['mailto:', 'tel:'].includes(url.protocol)) return false;
    if (url.origin !== location.origin) return false;
    return PROTECTED_PAGE_NAMES.has(pageNameFromUrl(url));
}

function openAfterLogin(anchor) {
    const href = anchor.href;
    const opensNewTab = anchor.target === '_blank';
    requireLogin(() => {
        if (opensNewTab) window.open(href, '_blank', 'noopener');
        else location.href = href;
    });
}

document.addEventListener('click', event => {
    const anchor = event.target.closest?.('a[href]');
    if (!anchor || !isProtectedHref(anchor.getAttribute('href'))) return;
    if (Auth.getCurrentUser()) return;
    event.preventDefault();
    event.stopPropagation();
    openAfterLogin(anchor);
}, true);

onAuthReady(user => {
    if (user) return;
    const currentPage = pageNameFromUrl(new URL(location.href));
    if (PROTECTED_PAGE_NAMES.has(currentPage)) {
        promptLoginRequired('请先登录后使用该页面功能');
    }
});

window.requireLogin = requireLogin;
globalThis.requireLogin = requireLogin;

/* ===== 共享导航渲染 ===== */
let _navPage = '';
function renderNav(currentPage) {
    if (currentPage === undefined) currentPage = _navPage; else _navPage = currentPage;  // 记住当前页，供登录后原地重渲染
    const primaryPages = [
        { key:'index',     href:'/',    label:'首页' },
        { key:'agents',    href:'/agents',   label:'智能体空间' },
        { key:'multimodal', href:'/multimodal', label:'多模态工作坊', icon:'ph ph-images-square' },
        { key:'classroom', href:'/classroom-tools', label:'课堂工具' }
    ];
    const resourcePages = [
        { key:'tools',     href:'/tools',     label:'AI 资源精选', icon:'ph ph-toolbox', desc:'精选工具导航' },
        { key:'resources', href:'/resources', label:'课件素材', icon:'ph ph-folder-open', desc:'可下载素材' },
        { key:'news',      href:'/news',      label:'AI 资讯', icon:'ph ph-newspaper', desc:'教育 AI 动态' },
        { key:'paths',     href:'/paths',     label:'学习路径', icon:'ph ph-path', desc:'系统训练路线' },
        { key:'articles',  href:'/articles',  label:'精选文章', icon:'ph ph-article', desc:'方法与案例' },
        { key:'prompts',   href:'/prompts',   label:'提示词库', icon:'ph ph-quotes', desc:'可复用提示词' }
    ];
    const user = _currentUser;
    const navAnchor = (p, extraClass = '') => {
        const feature = p.key === 'agents' ? ' nav-feature' : '';
        const icon = p.icon ? `<i class="${p.icon}"></i>` : (p.key === 'agents' ? '<i class="ph-fill ph-sparkle"></i>' : '');
        return `<a href="${p.href}" class="nav-link${feature}${extraClass ? ` ${extraClass}` : ''}${p.key === currentPage ? ' active' : ''}">${icon}${p.label}</a>`;
    };
    const primaryLinks = primaryPages.map(p => navAnchor(p)).join('');
    const workbookPage = { key:'workspace', href:'/workspace', label:'备课本', icon:'ph ph-notebook' };
    const workbookQuickLink = user
        ? `<a href="${workbookPage.href}" class="nav-user-tool${currentPage === 'workspace' ? ' active' : ''}" aria-label="我的备课本" title="我的备课本"><i class="${workbookPage.icon}"></i><span>${workbookPage.label}</span></a>`
        : '';
    const workbookDrawerLink = user ? navAnchor({ ...workbookPage, label:'我的备课本' }, 'nav-workbook') : '';
    const resourceActive = resourcePages.some(p => p.key === currentPage);
    const resourceItems = resourcePages.map(p => `
        <a href="${p.href}" class="nav-dropdown-item${p.key === currentPage ? ' active' : ''}">
            <i class="${p.icon}"></i>
            <span>${p.label}</span>
            <small>${p.desc}</small>
        </a>`).join('');
    const resourceMenu = `
        <div class="nav-group" id="resource-nav-group">
            <button type="button" class="nav-link nav-dropdown-trigger${resourceActive ? ' active' : ''}" aria-haspopup="true" aria-expanded="false" onclick="toggleResourceMenu(event)">
                资源 <i class="ph ph-caret-down"></i>
            </button>
            <div class="nav-dropdown-menu" role="menu">${resourceItems}</div>
        </div>`;
    const navLinks = `${primaryLinks}${resourceMenu}`;
    const drawerPrimary = primaryLinks;
    const drawerResources = resourcePages.map(p => navAnchor(p)).join('');
    const contactLink = `<button type="button" class="nav-link nav-button" data-contact-trigger>联系我们</button>`;
    const pwaInstallButton = `<button type="button" class="nav-pwa-install-button" data-pwa-install hidden><i class="ph ph-download-simple" aria-hidden="true"></i><span>安装应用</span></button>`;
    const pwaDrawerInstall = `<button type="button" class="nav-link nav-button nav-pwa-install-link" data-pwa-install hidden><i class="ph ph-download-simple" aria-hidden="true"></i>安装到设备</button>`;
    const adminLink = user?.isAdmin ? `<a href="/admin" class="nav-link admin-link"><i class="ph ph-shield-check"></i> 管理后台</a>` : '';
    const displayName = String(user?.name || user?.email || user?.phone || '教师用户');
    const safeDisplayName = escapeAuthHtml(displayName);
    const safeAvatarLetter = escapeAuthHtml(displayName.slice(0, 1).toUpperCase());
    const authHtml = user
        ? `<div class="nav-user-area">
               ${workbookQuickLink}
               <div class="user-avatar">${safeAvatarLetter}</div>
               <span style="font-size:14px;color:#374151;font-weight:500" class="hm">${safeDisplayName}</span>
               ${user.isAdmin ? '<span class="admin-badge">管理员</span>' : ''}
               <button class="btn-login" onclick="Auth.logout()">退出</button>
           </div>`
        : `<button class="btn-login" onclick="showAuthModal('login')">登录</button>
           <button class="btn-register" onclick="showAuthModal('register')">注册</button>`;
    const drawerAuth = user ? `
        <div class="nav-drawer-kicker">账户</div>
        <div class="nav-drawer-account">
            <div class="user-avatar">${safeAvatarLetter}</div>
            <div class="nav-drawer-account-copy"><b>${safeDisplayName}</b><small>${user.isAdmin ? '管理员账户' : '教师账户'}</small></div>
            <button type="button" onclick="closeNavDrawer();Auth.logout()">退出</button>
        </div>` : `
        <div class="nav-drawer-kicker">账户</div>
        <button type="button" class="nav-link nav-button" onclick="closeNavDrawer();showAuthModal('login')"><i class="ph ph-sign-in"></i> 登录</button>
        <button type="button" class="nav-link nav-button" onclick="closeNavDrawer();showAuthModal('register')"><i class="ph ph-user-plus"></i> 注册账号</button>`;

    const el = document.getElementById('main-nav');
    if (!el) return;
    el.innerHTML = `
    <a class="skip-link" href="#main-content">跳到主要内容</a>
    <header class="site-header">
        <div class="site-header-inner">
            <a href="/" class="site-logo">
                <div class="site-logo-icon"><i class="ph-fill ph-graduation-cap" style="color:white;font-size:18px"></i></div>
                <div class="site-logo-text hm"><strong>AI 教师培训中心</strong><span>Teacher AI Practice Hub</span></div>
            </a>
            <nav class="site-nav">${navLinks}${contactLink}${adminLink}</nav>
            <div class="auth-area">
                ${pwaInstallButton}
                ${authHtml}
                <button class="nav-hamburger" type="button" aria-label="打开菜单" aria-controls="nav-drawer" aria-expanded="false" onclick="openNavDrawer()"><i class="ph ph-list"></i></button>
            </div>
        </div>
    </header>
    <div class="nav-drawer" id="nav-drawer" aria-hidden="true" onclick="if(event.target===this)closeNavDrawer()">
        <div class="nav-drawer-panel" role="dialog" aria-modal="true" aria-label="网站导航">
            <div class="nav-drawer-head">
                <div class="nav-drawer-brand">
                    <div class="site-logo-icon"><i class="ph-fill ph-graduation-cap" style="color:white;font-size:15px"></i></div>
                    <strong>AI 教师培训中心</strong>
                </div>
                <button class="nav-drawer-close" aria-label="关闭菜单" onclick="closeNavDrawer()"><i class="ph ph-x"></i></button>
            </div>
            ${drawerAuth}
            <div class="nav-drawer-kicker">导航</div>
            ${drawerPrimary}
            ${workbookDrawerLink ? `<div class="nav-drawer-kicker">我的</div>${workbookDrawerLink}` : ''}
            <div class="nav-drawer-kicker">资源</div>
            ${drawerResources}
            <div class="nav-drawer-kicker">其他</div>
            ${pwaDrawerInstall}
            ${contactLink}
            ${adminLink}
        </div>
    </div>`;
    const main = document.querySelector('main');
    if (main) {
        if (!main.id) main.id = 'main-content';
        el.querySelector('.skip-link')?.setAttribute('href', `#${main.id}`);
    }
}

function closeResourceMenu() {
    const g = document.getElementById('resource-nav-group');
    if (!g) return;
    g.classList.remove('open');
    g.querySelector('.nav-dropdown-trigger')?.setAttribute('aria-expanded', 'false');
}
function toggleResourceMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    const g = event.currentTarget.closest('.nav-group');
    if (!g) return;
    const open = !g.classList.contains('open');
    closeResourceMenu();
    g.classList.toggle('open', open);
    event.currentTarget.setAttribute('aria-expanded', String(open));
}

let _drawerReturnFocus = null;
let _authReturnFocus = null;

function modalFocusable(container) {
    return Array.from(container?.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])
        .filter(element => element.offsetParent !== null && element.getAttribute('aria-hidden') !== 'true');
}

function trapModalFocus(event, container) {
    if (event.key !== 'Tab' || !container) return;
    const focusable = modalFocusable(container);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

function openNavDrawer() {
    const d = document.getElementById('nav-drawer');
    if (!d) return;
    _drawerReturnFocus = document.activeElement;
    closeResourceMenu();
    d.classList.add('open');
    d.setAttribute('aria-hidden', 'false');
    document.querySelector('.nav-hamburger')?.setAttribute('aria-expanded', 'true');
    document.querySelector('[data-pwa-more]')?.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    setTimeout(() => d.querySelector('.nav-drawer-close')?.focus(), 30);
}
function closeNavDrawer() {
    const d = document.getElementById('nav-drawer');
    if (!d) return;
    d.classList.remove('open');
    d.setAttribute('aria-hidden', 'true');
    document.querySelector('.nav-hamburger')?.setAttribute('aria-expanded', 'false');
    document.querySelector('[data-pwa-more]')?.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    if (_drawerReturnFocus?.focus) _drawerReturnFocus.focus();
    _drawerReturnFocus = null;
}
// Close drawer when a nav link inside it is clicked
document.addEventListener('click', (ev) => {
    if (!ev.target.closest?.('.nav-group')) closeResourceMenu();
    const drawer = document.getElementById('nav-drawer');
    if (!drawer || !drawer.classList.contains('open')) return;
    const link = ev.target.closest('.nav-drawer-panel a.nav-link, .nav-drawer-panel button.nav-link');
    if (link) closeNavDrawer();
});
// ESC closes
document.addEventListener('keydown', (ev) => {
    const authModal = document.getElementById('auth-modal');
    if (authModal?.classList.contains('active')) {
        if (ev.key === 'Escape') {
            ev.preventDefault();
            closeAuthModal();
            return;
        }
        trapModalFocus(ev, authModal.querySelector('.modal-box'));
        return;
    }
    const drawer = document.getElementById('nav-drawer');
    if (drawer?.classList.contains('open')) trapModalFocus(ev, drawer.querySelector('.nav-drawer-panel'));
    if (ev.key === 'Escape') {
        closeResourceMenu();
        if (drawer?.classList.contains('open')) closeNavDrawer();
    }
});

/* ===== Auth 弹窗 ===== */
function showAuthModal(tab) {
    let modal = document.getElementById('auth-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'auth-modal';
        modal.className = 'modal-overlay';
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = `
        <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title" onclick="event.stopPropagation()">
            <h2 class="sr-only" id="auth-modal-title">账户登录</h2>
            <div class="modal-tabs" role="tablist" aria-label="账户操作">
                <button type="button" class="modal-tab" id="tab-li" role="tab" aria-controls="form-li" onclick="switchAuthTab('login')">登录</button>
                <button type="button" class="modal-tab" id="tab-rg" role="tab" aria-controls="form-rg" onclick="switchAuthTab('register')">注册账号</button>
                <button type="button" aria-label="关闭账户弹窗" onclick="closeAuthModal()" style="padding:0 16px;color:#94a3b8;background:none;border:none;cursor:pointer;font-size:20px">×</button>
            </div>
            <div id="form-li" class="modal-body" role="tabpanel" aria-labelledby="tab-li">
                <div class="form-group"><label class="form-label" for="li-email">邮箱或手机号</label><input type="text" id="li-email" class="form-input" autocomplete="username" maxlength="254" required aria-required="true" placeholder="your@email.com 或 13800138000"></div>
                <div class="form-group"><label class="form-label" for="li-pwd">密码</label><input type="password" id="li-pwd" class="form-input" autocomplete="current-password" maxlength="128" required aria-required="true" placeholder="••••••••" onkeydown="if(event.key==='Enter')handleLogin()"></div>
                <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:4px">
                    <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-soft);cursor:pointer"><input type="checkbox" id="li-remember" style="cursor:pointer">记住我<span style="color:var(--muted);font-size:11px">（公用电脑勿勾）</span></label>
                    <button type="button" onclick="switchAuthTab('forgot')" style="background:none;border:none;color:var(--text-soft);font-size:13px;cursor:pointer;padding:0;font-family:inherit;white-space:nowrap">忘记密码？</button>
                </div>
                <div id="li-err" class="form-error" role="alert" aria-live="assertive" style="display:none"></div>
                <div style="margin-top:20px"><button class="btn-primary" id="li-btn" onclick="handleLogin()">登录</button></div>
                <p class="modal-footer-text">还没有账号？<button onclick="switchAuthTab('register')">立即注册</button></p>
            </div>
            <div id="form-fp" class="modal-body" role="tabpanel" aria-labelledby="tab-li" style="display:none">
                <p style="font-size:13px;color:var(--text-soft);line-height:1.7;margin-bottom:16px">输入注册时使用的<strong>邮箱</strong>，我们会把密码重置链接发到你的邮箱，按邮件指引设置新密码即可。</p>
                <div class="form-group"><label class="form-label" for="fp-email">注册邮箱</label><input type="email" id="fp-email" class="form-input" autocomplete="email" maxlength="254" placeholder="your@email.com" onkeydown="if(event.key==='Enter')handleForgotPassword()"></div>
                <div id="fp-msg" role="status" aria-live="polite" style="display:none"></div>
                <div style="margin-top:20px"><button class="btn-primary" id="fp-btn" onclick="handleForgotPassword()">发送重置邮件</button></div>
                <p class="modal-footer-text"><button onclick="switchAuthTab('login')">← 返回登录</button></p>
            </div>
            <div id="form-rg" class="modal-body" role="tabpanel" aria-labelledby="tab-rg" style="display:none">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                    <div class="form-group"><label class="form-label" for="rg-name">姓名 *</label><input type="text" id="rg-name" class="form-input" autocomplete="name" maxlength="80" required aria-required="true" placeholder="您的姓名"></div>
                    <div class="form-group"><label class="form-label" for="rg-school">学校/单位</label><input type="text" id="rg-school" class="form-input" autocomplete="organization" maxlength="120" placeholder="所在单位"></div>
                </div>
                <div class="form-group"><label class="form-label" for="rg-email">邮箱或手机号 *</label><input type="text" id="rg-email" class="form-input" autocomplete="username" maxlength="254" required aria-required="true" placeholder="your@email.com 或 13800138000"></div>
                <div class="form-group"><label class="form-label" for="rg-pwd">密码 *</label><input type="password" id="rg-pwd" class="form-input" autocomplete="new-password" minlength="6" maxlength="128" required aria-required="true" placeholder="至少 6 位"></div>
                <div id="rg-err" class="form-error" role="alert" aria-live="assertive" style="display:none"></div>
                <div style="margin-top:20px"><button class="btn-primary" id="rg-btn" onclick="handleRegister()">创建账号</button></div>
                <p class="modal-footer-text">已有账号？<button onclick="switchAuthTab('login')">立即登录</button></p>
            </div>
        </div>`;
        modal.addEventListener('click', e => { if (e.target === modal) closeAuthModal(); });
        document.body.appendChild(modal);
    }
    _authReturnFocus = document.activeElement;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    switchAuthTab(tab || 'login');
}

function closeAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (!modal?.classList.contains('active')) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (_authReturnFocus?.focus) _authReturnFocus.focus();
    _authReturnFocus = null;
}

function switchAuthTab(tab) {
    const views = { login: 'form-li', register: 'form-rg', forgot: 'form-fp' };
    Object.entries(views).forEach(([key, id]) => {
        const el = document.getElementById(id);
        if (el) el.style.display = (key === tab) ? '' : 'none';
    });
    // 「忘记密码」沿用登录页签的高亮（它是登录流程的分支，不单独占一个页签）
    const activeTab = (tab === 'forgot') ? 'login' : tab;
    const li = document.getElementById('tab-li'); if (li) li.className = 'modal-tab' + (activeTab === 'login' ? ' active' : '');
    const rg = document.getElementById('tab-rg'); if (rg) rg.className = 'modal-tab' + (activeTab === 'register' ? ' active' : '');
    li?.setAttribute('aria-selected', String(activeTab === 'login'));
    rg?.setAttribute('aria-selected', String(activeTab === 'register'));
    const title = document.getElementById('auth-modal-title');
    if (title) title.textContent = tab === 'register' ? '注册账号' : (tab === 'forgot' ? '重置密码' : '账户登录');
    if (tab === 'forgot') {
        // 把登录框里已输入的邮箱带过来，省去重复输入
        const liEmail = document.getElementById('li-email')?.value.trim();
        const fpEmail = document.getElementById('fp-email');
        if (fpEmail && liEmail && !fpEmail.value) fpEmail.value = liEmail;
        const fpMsg = document.getElementById('fp-msg'); if (fpMsg) fpMsg.style.display = 'none';
    }
    const firstField = document.querySelector(`#${views[tab]} input:not([type="checkbox"]), #${views[tab]} select`);
    setTimeout(() => firstField?.focus(), 30);
}

// 登录/注册成功后，原地更新导航/页脚（不整页 reload）
function refreshAuthUI() {
    try { renderNav(); } catch {}
    try { renderFooter(); } catch {}
}

function showWelcomeOverlay(kind, name) {
    const greeting = kind === 'register' ? '欢迎加入' : '欢迎回来';
    const subtitle = kind === 'register' ? '账号创建成功，正在为您准备…' : '正在为您加载…';
    const safeName = escapeAuthHtml(name || '教师用户');
    const safeAvatarLetter = escapeAuthHtml(String(name || '教师').slice(0, 1).toUpperCase());
    const overlay = document.createElement('div');
    overlay.className = 'welcome-overlay';
    overlay.innerHTML = `
        <div class="welcome-card">
            <div class="welcome-avatar">${safeAvatarLetter}</div>
            <div class="welcome-greeting">${greeting}</div>
            <div class="welcome-name">${safeName}</div>
            <div class="welcome-subtitle">${subtitle}</div>
            <div class="welcome-spinner" aria-hidden="true"><span></span><span></span><span></span></div>
        </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));

    // 注册是低频动作，保留一个稳定可读的欢迎反馈；登录成功改用下方的非阻塞 toast，
    // 避免短暂全屏层被用户感知成页面闪烁。
    let done = false;
    const start = Date.now();
    let fallbackTimer;
    const finish = () => {
        if (done) return; done = true;
        clearTimeout(fallbackTimer);
        document.removeEventListener('authChanged', onChange);
        refreshAuthUI();
        document.dispatchEvent(new CustomEvent('authRefresh', { detail: _currentUser }));
        requestAnimationFrame(() => {
            overlay.classList.add('leaving');
            overlay.classList.remove('show');
            setTimeout(() => overlay.remove(), 280);
        });
    };
    const onChange = () => {
        document.removeEventListener('authChanged', onChange);
        setTimeout(finish, Math.max(0, 900 - (Date.now() - start)));
    };
    if (_currentUser) {
        fallbackTimer = setTimeout(finish, 900);
    } else {
        document.addEventListener('authChanged', onChange);
        fallbackTimer = setTimeout(finish, 1200);
    }
}

async function handleLogin() {
    const identifier = document.getElementById('li-email').value.trim();
    const pwd = document.getElementById('li-pwd').value;
    const err = document.getElementById('li-err');
    const btn = document.getElementById('li-btn');
    err.style.display = 'none';
    btn.disabled = true; btn.setAttribute('aria-busy', 'true'); btn.textContent = '登录中…';
    const remember = !!document.getElementById('li-remember')?.checked;
    try {
        const result = await Auth.login(identifier, pwd, remember);
        if (!result.ok) { err.textContent = result.msg; err.style.display = ''; return; }
        const userName = Auth.getCurrentUser()?.name;
        closeAuthModal();
        refreshAuthUI();
        document.dispatchEvent(new CustomEvent('authRefresh', { detail: _currentUser }));
        showToast(userName ? `登录成功，欢迎回来，${userName}` : '登录成功，欢迎回来');
    } catch(error) {
        err.textContent = `登录失败：${error?.message || '请稍后重试'}`;
        err.style.display = '';
    } finally {
        btn.disabled = false; btn.removeAttribute('aria-busy'); btn.textContent = '登录';
    }
}

async function handleRegister() {
    const name      = document.getElementById('rg-name').value.trim();
    const identifier = document.getElementById('rg-email').value.trim();
    const school    = document.getElementById('rg-school').value.trim();
    const pwd       = document.getElementById('rg-pwd').value;
    const err       = document.getElementById('rg-err');
    const btn       = document.getElementById('rg-btn');
    err.style.display = 'none';
    btn.disabled = true; btn.setAttribute('aria-busy', 'true'); btn.textContent = '注册中…';
    try {
        const result = await Auth.register(name, identifier, school, pwd);
        if (!result.ok) { err.textContent = result.msg; err.style.display = ''; return; }
        showWelcomeOverlay('register', name);
        closeAuthModal();
    } catch(error) {
        err.textContent = `注册失败：${error?.message || '请稍后重试'}`;
        err.style.display = '';
    } finally {
        btn.disabled = false; btn.removeAttribute('aria-busy'); btn.textContent = '创建账号';
    }
}

async function handleForgotPassword() {
    const email = document.getElementById('fp-email').value.trim();
    const msg = document.getElementById('fp-msg');
    const btn = document.getElementById('fp-btn');
    msg.style.display = 'none';
    if (!email) { msg.className = 'form-error'; msg.textContent = '请输入邮箱地址'; msg.style.display = ''; return; }
    btn.disabled = true; btn.textContent = '发送中…';
    const result = await Auth.sendPasswordReset(email);
    btn.disabled = false; btn.textContent = '发送重置邮件';
    msg.className = result.ok ? 'form-success' : 'form-error';
    msg.textContent = result.msg;
    msg.style.display = '';
}

/* ===== Toast ===== */
function showToast(msg) {
    let t = document.getElementById('site-toast');
    if (!t) { t = document.createElement('div'); t.id = 'site-toast'; t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2200);
}

/* ===== Footer 订阅 ===== */
async function footerSubscribe() {
    if (!requireLogin(null, '请先登录后订阅动态')) return;
    const input = document.getElementById('footer-sub-email');
    if (!input) return;
    const email = input.value.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showToast('请输入有效邮箱地址');
        return;
    }
    try {
        const result = await DB.addSubscriber(email);
        if (result === 'exists') {
            showToast('该邮箱已登记，无需重复提交');
        } else {
            input.value = '';
            showToast('登记成功，邮件通知功能上线后会向该邮箱发送更新');
        }
    } catch(e) {
        showToast('订阅失败，请稍后重试');
    }
}

/* ===== Footer ===== */
function renderFooter() {
    const el = document.getElementById('main-footer');
    if (!el) return;
    el.innerHTML = `
    <footer class="site-footer">
        <div class="footer-grid">
            <div class="footer-brand">
                <div class="site-logo" style="margin-bottom:10px">
                    <div class="site-logo-icon"><i class="ph-fill ph-graduation-cap" style="color:white;font-size:16px"></i></div>
                    <strong style="color:#f1f5f9;font-size:15px">AI 教师培训中心</strong>
                </div>
                <p>为在职教师提供 AI 工具导航、前沿资讯与系统学习路径的综合平台</p>
            </div>
            <div class="footer-col"><h4>功能导航</h4><ul>
                <li><a href="/">首页</a></li>
                <li><a href="/agents">智能体空间</a></li>
                <li><a href="/multimodal">多模态工作坊</a></li>
                <li><a href="/tools">AI 资源精选</a></li>
                <li><a href="/news">AI 资讯</a></li>
                <li><a href="/paths">学习路径</a></li>
                <li><a href="/articles">精选文章</a></li>
                <li><button type="button" class="footer-link-button pwa-footer-install" data-pwa-install hidden><i class="ph ph-download-simple" aria-hidden="true"></i>安装到设备</button></li>
                <li><button type="button" class="footer-link-button" data-contact-trigger>联系我们</button></li>
            </ul></div>
            <div class="footer-col"><h4>关于平台</h4>
                <p style="font-size:13px;color:#64748b;line-height:1.8">面向在职教师的 AI 教学实践平台，支持备课、课堂、评价、家校沟通与教学复盘。</p>
                <p style="font-size:13px;color:#475569;margin-top:8px">欢迎教师分享 AI 教学案例，共建社区智识库。</p>
            </div>
            <div class="footer-col"><h4>内容更新登记</h4>
                <p style="font-size:13px;color:#475569;line-height:1.7;margin-bottom:14px">留下邮箱，用于后续内容更新通知；目前不承诺固定发送频率</p>
                <div class="subscribe-form">
                    <label class="sr-only" for="footer-sub-email">邮箱地址</label>
                    <input class="subscribe-input" type="email" inputmode="email" autocomplete="email" id="footer-sub-email" placeholder="输入您的邮箱">
                    <button class="subscribe-btn" type="button" onclick="footerSubscribe()">登记</button>
                </div>
            </div>
        </div>
        <div class="footer-bottom">© ${new Date().getFullYear()} AI 教师培训中心 · 保留所有权利</div>
    </footer>`;
}
