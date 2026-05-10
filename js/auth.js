/* ===== AUTH CONFIG ===== */
const ADMIN_EMAIL = 'admin@xylaoshi.com';
const ADMIN_PWD_HASH = btoa(unescape(encodeURIComponent('Admin@2025')));

/* ===== AUTH CORE ===== */
const Auth = {
    getCurrentUser() {
        return JSON.parse(sessionStorage.getItem('aitc_user') || 'null');
    },
    isAdmin() {
        const u = this.getCurrentUser();
        return u && u.isAdmin === true;
    },
    login(email, password) {
        const hash = btoa(unescape(encodeURIComponent(password)));
        if (email === ADMIN_EMAIL && hash === ADMIN_PWD_HASH) {
            const admin = { name:'管理员', email, isAdmin: true };
            sessionStorage.setItem('aitc_user', JSON.stringify(admin));
            return { ok: true, user: admin };
        }
        const users = DB.users.get();
        const user = users.find(u => u.email === email && u.password === hash);
        if (!user) return { ok: false, msg: '邮箱或密码错误' };
        sessionStorage.setItem('aitc_user', JSON.stringify(user));
        return { ok: true, user };
    },
    register(name, email, school, password) {
        if (!name || !email || !password) return { ok: false, msg: '请填写所有必填项' };
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, msg: '请输入有效邮箱' };
        if (password.length < 6) return { ok: false, msg: '密码至少 6 位' };
        const users = DB.users.get();
        if (users.find(u => u.email === email)) return { ok: false, msg: '该邮箱已被注册' };
        const user = { name, email, school: school || '', password: btoa(unescape(encodeURIComponent(password))), joinedAt: new Date().toISOString(), isAdmin: false };
        users.push(user);
        DB.users.set(users);
        sessionStorage.setItem('aitc_user', JSON.stringify(user));
        return { ok: true, user };
    },
    logout() {
        sessionStorage.removeItem('aitc_user');
    }
};

/* ===== SHARED NAV ===== */
function renderNav(currentPage) {
    const pages = [
        { key: 'index',   href: 'index.html',   label: '首页' },
        { key: 'tools',   href: 'tools.html',   label: 'AI工具' },
        { key: 'news',    href: 'news.html',     label: '全球资讯' },
        { key: 'paths',   href: 'paths.html',    label: '学习路径' },
        { key: 'prompts', href: 'prompts.html',  label: '提示词库' },
        { key: 'resources',href: 'resources.html',label: '设计资源' }
    ];

    const navLinks = pages.map(p =>
        `<a href="${p.href}" class="nav-link${p.key === currentPage ? ' active' : ''}">${p.label}</a>`
    ).join('');

    const user = Auth.getCurrentUser();
    const adminLink = (user?.isAdmin) ? `<a href="admin.html" class="nav-link admin-link">⚙ 管理后台</a>` : '';
    const authHtml = user
        ? `<div style="display:flex;align-items:center;gap:8px">
               <div class="user-avatar">${user.name.charAt(0).toUpperCase()}</div>
               <span style="font-size:14px;color:#374151;font-weight:500" class="hidden-mobile">${user.name}</span>
               ${user.isAdmin ? '<span class="admin-badge">管理员</span>' : ''}
               <button class="btn-login" onclick="Auth.logout();location.reload()">退出</button>
           </div>`
        : `<button class="btn-login" onclick="showAuthModal('login')">登录</button>
           <button class="btn-register" onclick="showAuthModal('register')">注册</button>`;

    const el = document.getElementById('main-nav');
    if (!el) return;
    el.innerHTML = `
    <style>.hidden-mobile{} @media(max-width:640px){.hidden-mobile{display:none}}</style>
    <header class="site-header">
        <div class="site-header-inner">
            <a href="index.html" class="site-logo">
                <div class="site-logo-icon">
                    <i class="ph-fill ph-graduation-cap" style="color:white;font-size:18px"></i>
                </div>
                <div class="site-logo-text hidden-mobile">
                    <strong>AI 教师培训中心</strong>
                    <span>Teacher AI Training Hub</span>
                </div>
            </a>
            <nav class="site-nav" id="desktop-nav" style="display:none">
                ${navLinks}${adminLink}
            </nav>
            <div class="auth-area">${authHtml}</div>
        </div>
        <div style="border-top:1px solid #f1f5f9;overflow-x:auto">
            <div style="display:flex;padding:0 16px;gap:2px;min-width:max-content">
                ${navLinks}${adminLink}
            </div>
        </div>
    </header>`;

    // Show desktop nav on larger screens
    const mq = window.matchMedia('(min-width: 768px)');
    const toggleNav = (e) => {
        document.getElementById('desktop-nav').style.display = e.matches ? 'flex' : 'none';
        el.querySelector('[style*="border-top"]').style.display = e.matches ? 'none' : 'block';
    };
    toggleNav(mq);
    mq.addEventListener('change', toggleNav);
}

/* ===== AUTH MODAL ===== */
function showAuthModal(tab) {
    let modal = document.getElementById('auth-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'auth-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
        <div class="modal-box" onclick="event.stopPropagation()">
            <div class="modal-tabs">
                <button class="modal-tab" id="tab-login" onclick="switchAuthTab('login')">登录</button>
                <button class="modal-tab" id="tab-register" onclick="switchAuthTab('register')">注册账号</button>
                <button onclick="closeAuthModal()" style="padding:0 16px;color:#94a3b8;background:none;border:none;cursor:pointer;font-size:18px">×</button>
            </div>
            <div id="form-login" class="modal-body">
                <div class="form-group"><label class="form-label">邮箱</label><input type="email" id="li-email" class="form-input" placeholder="your@email.com"></div>
                <div class="form-group"><label class="form-label">密码</label><input type="password" id="li-pwd" class="form-input" placeholder="••••••••" onkeydown="if(event.key==='Enter')handleLogin()"></div>
                <div id="li-err" class="form-error" style="display:none"></div>
                <div style="margin-top:20px"><button class="btn-primary" onclick="handleLogin()">登录</button></div>
                <p class="modal-footer-text">还没有账号？<button onclick="switchAuthTab('register')">立即注册</button></p>
            </div>
            <div id="form-register" class="modal-body" style="display:none">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                    <div class="form-group"><label class="form-label">姓名 <span style="color:#ef4444">*</span></label><input type="text" id="rg-name" class="form-input" placeholder="您的姓名"></div>
                    <div class="form-group"><label class="form-label">学校/单位</label><input type="text" id="rg-school" class="form-input" placeholder="所在单位"></div>
                </div>
                <div class="form-group"><label class="form-label">邮箱 <span style="color:#ef4444">*</span></label><input type="email" id="rg-email" class="form-input" placeholder="your@email.com"></div>
                <div class="form-group"><label class="form-label">密码 <span style="color:#ef4444">*</span></label><input type="password" id="rg-pwd" class="form-input" placeholder="至少 6 位"></div>
                <div id="rg-err" class="form-error" style="display:none"></div>
                <div style="margin-top:20px"><button class="btn-primary" onclick="handleRegister()">创建账号</button></div>
                <p class="modal-footer-text">已有账号？<button onclick="switchAuthTab('login')">立即登录</button></p>
            </div>
        </div>`;
        modal.addEventListener('click', (e) => { if (e.target === modal) closeAuthModal(); });
        document.body.appendChild(modal);
    }
    modal.classList.add('active');
    switchAuthTab(tab || 'login');
}

function closeAuthModal() {
    const m = document.getElementById('auth-modal');
    if (m) m.classList.remove('active');
}

function switchAuthTab(tab) {
    const isLogin = tab === 'login';
    const fl = document.getElementById('form-login');
    const fr = document.getElementById('form-register');
    const tl = document.getElementById('tab-login');
    const tr = document.getElementById('tab-register');
    if (!fl) return;
    fl.style.display = isLogin ? '' : 'none';
    fr.style.display = isLogin ? 'none' : '';
    tl.className = 'modal-tab' + (isLogin ? ' active' : '');
    tr.className = 'modal-tab' + (!isLogin ? ' active' : '');
}

function handleLogin() {
    const email = document.getElementById('li-email').value.trim();
    const pwd = document.getElementById('li-pwd').value;
    const err = document.getElementById('li-err');
    const result = Auth.login(email, pwd);
    if (!result.ok) { err.textContent = result.msg; err.style.display = ''; return; }
    err.style.display = 'none';
    closeAuthModal();
    location.reload();
}

function handleRegister() {
    const name = document.getElementById('rg-name').value.trim();
    const email = document.getElementById('rg-email').value.trim();
    const school = document.getElementById('rg-school').value.trim();
    const pwd = document.getElementById('rg-pwd').value;
    const err = document.getElementById('rg-err');
    const result = Auth.register(name, email, school, pwd);
    if (!result.ok) { err.textContent = result.msg; err.style.display = ''; return; }
    err.style.display = 'none';
    closeAuthModal();
    location.reload();
}

/* ===== TOAST ===== */
function showToast(msg) {
    let t = document.getElementById('site-toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'site-toast';
        t.className = 'toast';
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2000);
}

/* ===== SHARED FOOTER ===== */
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
            <div class="footer-col">
                <h4>功能导航</h4>
                <ul>
                    <li><a href="index.html">首页</a></li>
                    <li><a href="tools.html">AI 工具箱</a></li>
                    <li><a href="news.html">全球资讯</a></li>
                    <li><a href="paths.html">学习路径</a></li>
                    <li><a href="prompts.html">提示词库</a></li>
                    <li><a href="resources.html">设计资源库</a></li>
                </ul>
            </div>
            <div class="footer-col">
                <h4>关于平台</h4>
                <p style="font-size:13px;color:#475569;line-height:1.7">本平台专为在职教师 AI 培训设计，持续收录全球优质 AI 教育资源。所有工具均经过实际教学场景筛选验证。</p>
            </div>
        </div>
        <div class="footer-bottom">© 2025 AI 教师培训中心 · 保留所有权利</div>
    </footer>`;
}
