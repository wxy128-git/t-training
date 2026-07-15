/* ===== Auth 操作（Firebase） ===== */

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

function rememberProxyAuthSession(authData) {
    try {
        const expiresIn = Number(authData.expiresIn || 3600);
        localStorage.setItem(window.PROXY_AUTH_SESSION_KEY, JSON.stringify({
            idToken: authData.idToken || '',
            refreshToken: authData.refreshToken || '',
            expiresAt: Date.now() + Math.max(300, expiresIn - 60) * 1000,
            user: authData.user
        }));
    } catch {
        // Login still counts for the current page even if storage is unavailable.
    }
}

function forgetProxyAuthSession() {
    try {
        localStorage.removeItem(window.PROXY_AUTH_SESSION_KEY);
    } catch {}
}

function getStoredProxyAuthSession(options = {}) {
    try {
        const raw = localStorage.getItem(window.PROXY_AUTH_SESSION_KEY);
        if (!raw) return null;
        const session = JSON.parse(raw);
        const expired = session.expiresAt && Date.now() > session.expiresAt;
        if (!session?.idToken || (expired && !options.allowExpired && !session.refreshToken)) {
            localStorage.removeItem(window.PROXY_AUTH_SESSION_KEY);
            return null;
        }
        if (expired && !options.allowExpired) return null;
        return session;
    } catch {
        return null;
    }
}

function shouldUseAuthProxyFirst(action = 'login') {
    // 登录优先走同源 Cloudflare 代理：国内网络不连 VPN 时，Firebase JS SDK 往往要等很久才超时。
    // 注册仍优先走 Firebase SDK，避免代理注册成功后再本地 createUser 触发 email-already-in-use。
    return action === 'login';
}

function shouldTryFirebaseAfterProxy(error) {
    return error?.isNetworkError || error?.status === 404 || error?.status >= 500;
}

async function callAuthProxy(action, payload) {
    let response;
    try {
        response = await fetch('/api/auth-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, ...payload })
        });
    } catch(error) {
        error.isNetworkError = true;
        throw error;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
        const error = new Error(data.msg || '认证代理请求失败');
        error.code = data.code || 'AUTH_PROXY_ERROR';
        error.status = response.status;
        throw error;
    }
    rememberProxyAuthSession(data);
    if (data.user?.uid) rememberUserProfile(data.user.uid, data.user);
    _currentUser = data.user;
    rememberLastAuthUser(_currentUser);
    document.dispatchEvent(new CustomEvent('authChanged', { detail: _currentUser }));
    return { ok: true, viaProxy: true };
}

async function refreshProxyAuthSession() {
    const session = getStoredProxyAuthSession({ allowExpired: true });
    if (!session?.refreshToken) return null;
    try {
        await callAuthProxy('refresh', { refreshToken: session.refreshToken });
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
            await auth.sendPasswordResetEmail(authEmail);
            return { ok: true, msg: `重置链接已发送至 ${authEmail}，请查收邮箱（如未收到请检查垃圾邮件箱）。` };
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
                const result = await callAuthProxy('login', { email: authEmail, password });
                syncFirebaseAuthAfterProxy(authEmail, password, remember);
                return result;
            } catch(proxyError) {
                if (!shouldTryFirebaseAfterProxy(proxyError)) {
                    return { ok: false, msg: `登录失败：${proxyError.message}` };
                }
                console.warn('authProxyLogin:', proxyError.message);
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
                    return await callAuthProxy('login', { email: authEmail, password });
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
                return await callAuthProxy('register', { email: authEmail, password, profile: userData });
            } catch(proxyError) {
                if (!shouldTryFirebaseAfterProxy(proxyError)) {
                    return { ok: false, msg: `注册失败：${proxyError.message}` };
                }
                console.warn('authProxyRegister:', proxyError.message);
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
                try {
                    return await callAuthProxy('register', { email: authEmail, password, profile: userData });
                } catch(proxyError) {
                    return { ok: false, msg: `注册失败：${proxyError.message}` };
                }
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
    'tools.html',
    'news.html',
    'paths.html',
    'prompts.html',
    'articles.html',
    'article.html',
    'resources.html',
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
    if (url.origin !== location.origin) return true;
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
        { key:'index',     href:'index.html',    label:'首页' },
        { key:'agents',    href:'agents.html',   label:'智能体空间' },
        { key:'multimodal', href:'multimodal.html', label:'多模态工作坊', icon:'ph ph-images-square' },
        { key:'classroom', href:'classroom-tools.html', label:'课堂工具' }
    ];
    const resourcePages = [
        { key:'tools',     href:'tools.html',     label:'AI资源精选', icon:'ph ph-toolbox', desc:'精选工具导航' },
        { key:'resources', href:'resources.html', label:'课件素材', icon:'ph ph-folder-open', desc:'可下载素材' },
        { key:'news',      href:'news.html',      label:'AI 资讯', icon:'ph ph-newspaper', desc:'教育 AI 动态' },
        { key:'paths',     href:'paths.html',     label:'学习路径', icon:'ph ph-path', desc:'系统训练路线' },
        { key:'articles',  href:'articles.html',  label:'精选文章', icon:'ph ph-article', desc:'方法与案例' },
        { key:'prompts',   href:'prompts.html',   label:'提示词库', icon:'ph ph-quotes', desc:'可复用提示词' }
    ];
    const user = _currentUser;
    const navAnchor = (p, extraClass = '') => {
        const feature = p.key === 'agents' ? ' nav-feature' : '';
        const icon = p.icon ? `<i class="${p.icon}"></i>` : (p.key === 'agents' ? '<i class="ph-fill ph-sparkle"></i>' : '');
        return `<a href="${p.href}" class="nav-link${feature}${extraClass ? ` ${extraClass}` : ''}${p.key === currentPage ? ' active' : ''}">${icon}${p.label}</a>`;
    };
    const primaryLinks = primaryPages.map(p => navAnchor(p)).join('');
    const workbookPage = { key:'workspace', href:'workspace.html', label:'备课本', icon:'ph ph-notebook' };
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
    const adminLink = user?.isAdmin ? `<a href="admin.html" class="nav-link admin-link"><i class="ph ph-shield-check"></i> 管理后台</a>` : '';
    const authHtml = user
        ? `<div class="nav-user-area">
               ${workbookQuickLink}
               <div class="user-avatar">${user.name.charAt(0).toUpperCase()}</div>
               <span style="font-size:14px;color:#374151;font-weight:500" class="hm">${user.name}</span>
               ${user.isAdmin ? '<span class="admin-badge">管理员</span>' : ''}
               <button class="btn-login" onclick="Auth.logout()">退出</button>
           </div>`
        : `<button class="btn-login" onclick="showAuthModal('login')">登录</button>
           <button class="btn-register" onclick="showAuthModal('register')">注册</button>`;

    const el = document.getElementById('main-nav');
    if (!el) return;
    el.innerHTML = `
    <a class="skip-link" href="#main-content">跳到主要内容</a>
    <header class="site-header">
        <div class="site-header-inner">
            <a href="index.html" class="site-logo">
                <div class="site-logo-icon"><i class="ph-fill ph-graduation-cap" style="color:white;font-size:18px"></i></div>
                <div class="site-logo-text hm"><strong>AI 教师培训中心</strong><span>Teacher AI Practice Hub</span></div>
            </a>
            <nav class="site-nav">${navLinks}${contactLink}${adminLink}</nav>
            <div class="auth-area">
                ${pwaInstallButton}
                ${authHtml}
                <button class="nav-hamburger" aria-label="打开菜单" onclick="openNavDrawer()"><i class="ph ph-list"></i></button>
            </div>
        </div>
    </header>
    <div class="nav-drawer" id="nav-drawer" onclick="if(event.target===this)closeNavDrawer()">
        <div class="nav-drawer-panel">
            <div class="nav-drawer-head">
                <div class="nav-drawer-brand">
                    <div class="site-logo-icon"><i class="ph-fill ph-graduation-cap" style="color:white;font-size:15px"></i></div>
                    <strong>AI 教师培训中心</strong>
                </div>
                <button class="nav-drawer-close" aria-label="关闭菜单" onclick="closeNavDrawer()"><i class="ph ph-x"></i></button>
            </div>
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

function openNavDrawer() {
    const d = document.getElementById('nav-drawer');
    if (!d) return;
    closeResourceMenu();
    d.classList.add('open');
    document.body.style.overflow = 'hidden';
}
function closeNavDrawer() {
    const d = document.getElementById('nav-drawer');
    if (!d) return;
    d.classList.remove('open');
    document.body.style.overflow = '';
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
    if (ev.key === 'Escape') {
        closeResourceMenu();
        const d = document.getElementById('nav-drawer');
        if (d?.classList.contains('open')) closeNavDrawer();
    }
});

/* ===== Auth 弹窗 ===== */
function showAuthModal(tab) {
    let modal = document.getElementById('auth-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'auth-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
        <div class="modal-box" onclick="event.stopPropagation()">
            <div class="modal-tabs">
                <button class="modal-tab" id="tab-li" onclick="switchAuthTab('login')">登录</button>
                <button class="modal-tab" id="tab-rg" onclick="switchAuthTab('register')">注册账号</button>
                <button onclick="closeAuthModal()" style="padding:0 16px;color:#94a3b8;background:none;border:none;cursor:pointer;font-size:20px">×</button>
            </div>
            <div id="form-li" class="modal-body">
                <div class="form-group"><label class="form-label">邮箱或手机号</label><input type="text" id="li-email" class="form-input" placeholder="your@email.com 或 13800138000"></div>
                <div class="form-group"><label class="form-label">密码</label><input type="password" id="li-pwd" class="form-input" placeholder="••••••••" onkeydown="if(event.key==='Enter')handleLogin()"></div>
                <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:4px">
                    <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-soft);cursor:pointer"><input type="checkbox" id="li-remember" style="cursor:pointer">记住我<span style="color:var(--muted);font-size:11px">（公用电脑勿勾）</span></label>
                    <button type="button" onclick="switchAuthTab('forgot')" style="background:none;border:none;color:var(--text-soft);font-size:13px;cursor:pointer;padding:0;font-family:inherit;white-space:nowrap">忘记密码？</button>
                </div>
                <div id="li-err" class="form-error" style="display:none"></div>
                <div style="margin-top:20px"><button class="btn-primary" id="li-btn" onclick="handleLogin()">登录</button></div>
                <p class="modal-footer-text">还没有账号？<button onclick="switchAuthTab('register')">立即注册</button></p>
            </div>
            <div id="form-fp" class="modal-body" style="display:none">
                <p style="font-size:13px;color:var(--text-soft);line-height:1.7;margin-bottom:16px">输入注册时使用的<strong>邮箱</strong>，我们会把密码重置链接发到你的邮箱，按邮件指引设置新密码即可。</p>
                <div class="form-group"><label class="form-label">注册邮箱</label><input type="email" id="fp-email" class="form-input" placeholder="your@email.com" onkeydown="if(event.key==='Enter')handleForgotPassword()"></div>
                <div id="fp-msg" style="display:none"></div>
                <div style="margin-top:20px"><button class="btn-primary" id="fp-btn" onclick="handleForgotPassword()">发送重置邮件</button></div>
                <p class="modal-footer-text"><button onclick="switchAuthTab('login')">← 返回登录</button></p>
            </div>
            <div id="form-rg" class="modal-body" style="display:none">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                    <div class="form-group"><label class="form-label">姓名 *</label><input type="text" id="rg-name" class="form-input" placeholder="您的姓名"></div>
                    <div class="form-group"><label class="form-label">学校/单位</label><input type="text" id="rg-school" class="form-input" placeholder="所在单位"></div>
                </div>
                <div class="form-group"><label class="form-label">邮箱或手机号 *</label><input type="text" id="rg-email" class="form-input" placeholder="your@email.com 或 13800138000"></div>
                <div class="form-group"><label class="form-label">密码 *</label><input type="password" id="rg-pwd" class="form-input" placeholder="至少 6 位"></div>
                <div id="rg-err" class="form-error" style="display:none"></div>
                <div style="margin-top:20px"><button class="btn-primary" id="rg-btn" onclick="handleRegister()">创建账号</button></div>
                <p class="modal-footer-text">已有账号？<button onclick="switchAuthTab('login')">立即登录</button></p>
            </div>
        </div>`;
        modal.addEventListener('click', e => { if (e.target === modal) closeAuthModal(); });
        document.body.appendChild(modal);
    }
    modal.classList.add('active');
    switchAuthTab(tab || 'login');
}

function closeAuthModal() {
    document.getElementById('auth-modal')?.classList.remove('active');
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
    if (tab === 'forgot') {
        // 把登录框里已输入的邮箱带过来，省去重复输入
        const liEmail = document.getElementById('li-email')?.value.trim();
        const fpEmail = document.getElementById('fp-email');
        if (fpEmail && liEmail && !fpEmail.value) fpEmail.value = liEmail;
        const fpMsg = document.getElementById('fp-msg'); if (fpMsg) fpMsg.style.display = 'none';
    }
}

// 登录/注册成功后，原地更新导航/页脚（不整页 reload）
function refreshAuthUI() {
    try { renderNav(); } catch {}
    try { renderFooter(); } catch {}
}

function showWelcomeOverlay(kind, name) {
    const greeting = kind === 'register' ? '欢迎加入' : '欢迎回来';
    const subtitle = kind === 'register' ? '账号创建成功，正在为您准备…' : '正在为您加载…';
    const overlay = document.createElement('div');
    overlay.className = 'welcome-overlay';
    overlay.innerHTML = `
        <div class="welcome-card">
            <div class="welcome-avatar">${(name || '教师').slice(0, 1).toUpperCase()}</div>
            <div class="welcome-greeting">${greeting}</div>
            <div class="welcome-name">${name || '教师用户'}</div>
            <div class="welcome-subtitle">${subtitle}</div>
            <div class="welcome-spinner" aria-hidden="true"><span></span><span></span><span></span></div>
        </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));

    // 不再整页 reload：等 Firebase 确认登录态（最少 0.7s、最多 1.4s 兜底），再原地更新导航/页脚，
    // 并派发「仅登录/注册时触发」的 authRefresh（普通加载不会触发 → 不会死循环），让备课本/后台据此刷新内容。
    let done = false;
    const start = Date.now();
    const finish = () => {
        if (done) return; done = true;
        document.removeEventListener('authChanged', onChange);
        overlay.classList.add('settling');
        refreshAuthUI();
        document.dispatchEvent(new CustomEvent('authRefresh', { detail: _currentUser }));
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                setTimeout(() => {
                    overlay.classList.remove('settling');
                    overlay.classList.remove('show');
                    setTimeout(() => overlay.remove(), 340);
                }, 120);
            });
        });
    };
    const onChange = () => {
        document.removeEventListener('authChanged', onChange);
        setTimeout(finish, Math.max(0, 700 - (Date.now() - start)));
    };
    document.addEventListener('authChanged', onChange);
    setTimeout(finish, 1400);
}

async function handleLogin() {
    const identifier = document.getElementById('li-email').value.trim();
    const pwd = document.getElementById('li-pwd').value;
    const err = document.getElementById('li-err');
    const btn = document.getElementById('li-btn');
    err.style.display = 'none';
    btn.disabled = true; btn.textContent = '登录中…';
    const remember = !!document.getElementById('li-remember')?.checked;
    const result = await Auth.login(identifier, pwd, remember);
    btn.disabled = false; btn.textContent = '登录';
    if (!result.ok) { err.textContent = result.msg; err.style.display = ''; return; }
    showWelcomeOverlay('login', Auth.getCurrentUser()?.name);
    closeAuthModal();
}

async function handleRegister() {
    const name      = document.getElementById('rg-name').value.trim();
    const identifier = document.getElementById('rg-email').value.trim();
    const school    = document.getElementById('rg-school').value.trim();
    const pwd       = document.getElementById('rg-pwd').value;
    const err       = document.getElementById('rg-err');
    const btn       = document.getElementById('rg-btn');
    err.style.display = 'none';
    btn.disabled = true; btn.textContent = '注册中…';
    const result = await Auth.register(name, identifier, school, pwd);
    btn.disabled = false; btn.textContent = '创建账号';
    if (!result.ok) { err.textContent = result.msg; err.style.display = ''; return; }
    showWelcomeOverlay('register', name);
    closeAuthModal();
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
            showToast('该邮箱已订阅，感谢关注！');
        } else {
            input.value = '';
            showToast('订阅成功，每周精选将发送至您的邮箱');
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
                <li><a href="index.html">首页</a></li>
                <li><a href="agents.html">智能体空间</a></li>
                <li><a href="multimodal.html">多模态工作坊</a></li>
                <li><a href="tools.html">AI资源精选</a></li>
                <li><a href="news.html">AI 资讯</a></li>
                <li><a href="paths.html">学习路径</a></li>
                <li><a href="articles.html">精选文章</a></li>
                <li><button type="button" class="footer-link-button pwa-footer-install" data-pwa-install hidden><i class="ph ph-download-simple" aria-hidden="true"></i>安装到设备</button></li>
                <li><button type="button" class="footer-link-button" data-contact-trigger>联系我们</button></li>
            </ul></div>
            <div class="footer-col"><h4>关于平台</h4>
                <p style="font-size:13px;color:#64748b;line-height:1.8">面向在职教师的 AI 教学实践平台，支持备课、课堂、评价、家校沟通与教学复盘。</p>
                <p style="font-size:13px;color:#475569;margin-top:8px">欢迎教师分享 AI 教学案例，共建社区智识库。</p>
            </div>
            <div class="footer-col"><h4>订阅动态</h4>
                <p style="font-size:13px;color:#475569;line-height:1.7;margin-bottom:14px">订阅每周 AI 教育精选，第一时间获取新工具与案例推荐</p>
                <div class="subscribe-form">
                    <input class="subscribe-input" type="email" id="footer-sub-email" placeholder="输入您的邮箱">
                    <button class="subscribe-btn" onclick="footerSubscribe()">订阅</button>
                </div>
            </div>
        </div>
        <div class="footer-bottom">© 2025 AI 教师培训中心 · 保留所有权利</div>
    </footer>`;
}
