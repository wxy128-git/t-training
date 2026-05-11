/* ===== Auth 操作（Firebase） ===== */
const Auth = {
    getCurrentUser() { return _currentUser; },
    isAdmin() { return _currentUser?.isAdmin === true; },

    async login(email, password) {
        try {
            await auth.signInWithEmailAndPassword(email, password);
            return { ok: true };
        } catch(e) {
            const msgs = {
                'auth/user-not-found': '账号不存在，请先注册',
                'auth/wrong-password': '密码错误',
                'auth/invalid-credential': '邮箱或密码错误',
                'auth/invalid-email': '邮箱格式不正确',
                'auth/too-many-requests': '尝试次数过多，请稍后再试',
                'auth/user-disabled': '该账号已被停用'
            };
            return { ok: false, msg: msgs[e.code] || ('登录失败：' + e.message) };
        }
    },

    async register(name, email, school, password) {
        if (!name || !email || !password) return { ok: false, msg: '请填写所有必填项' };
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, msg: '请输入有效邮箱' };
        if (password.length < 6) return { ok: false, msg: '密码至少 6 位' };
        try {
            const cred = await auth.createUserWithEmailAndPassword(email, password);
            const userData = { name, email, school: school || '', isAdmin: email === ADMIN_EMAIL, joinedAt: new Date().toISOString() };
            await db.collection('users').doc(cred.user.uid).set(userData);
            _currentUser = { uid: cred.user.uid, ...userData };
            return { ok: true };
        } catch(e) {
            const msgs = {
                'auth/email-already-in-use': '该邮箱已被注册，请直接登录',
                'auth/weak-password': '密码强度不足，请使用更复杂的密码',
                'auth/invalid-email': '邮箱格式不正确'
            };
            return { ok: false, msg: msgs[e.code] || ('注册失败：' + e.message) };
        }
    },

    async logout() {
        await auth.signOut();
        _currentUser = null;
        location.reload();
    }
};

/* ===== 共享导航渲染 ===== */
function renderNav(currentPage) {
    const pages = [
        { key:'index',     href:'index.html',     label:'首页' },
        { key:'tools',     href:'tools.html',     label:'AI工具' },
        { key:'news',      href:'news.html',      label:'全球资讯' },
        { key:'paths',     href:'paths.html',     label:'学习路径' },
        { key:'prompts',   href:'prompts.html',   label:'提示词库' },
        { key:'resources', href:'resources.html', label:'设计资源' }
    ];
    const user = _currentUser;
    const navLinks = pages.map(p =>
        `<a href="${p.href}" class="nav-link${p.key === currentPage ? ' active' : ''}">${p.label}</a>`
    ).join('');
    const adminLink = user?.isAdmin ? `<a href="admin.html" class="nav-link admin-link"><i class="ph ph-shield-check"></i> 管理后台</a>` : '';
    const authHtml = user
        ? `<div style="display:flex;align-items:center;gap:8px">
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
    <style>.hm{} @media(max-width:640px){.hm{display:none}}</style>
    <header class="site-header">
        <div class="site-header-inner">
            <a href="index.html" class="site-logo">
                <div class="site-logo-icon"><i class="ph-fill ph-graduation-cap" style="color:white;font-size:18px"></i></div>
                <div class="site-logo-text hm"><strong>AI 教师培训中心</strong><span>Teacher AI Training Hub</span></div>
            </a>
            <nav class="site-nav" id="dn" style="display:none">${navLinks}${adminLink}</nav>
            <div class="auth-area">${authHtml}</div>
        </div>
        <div id="mn" style="border-top:1px solid #f1f5f9;overflow-x:auto">
            <div style="display:flex;padding:0 16px;gap:2px;min-width:max-content">${navLinks}${adminLink}</div>
        </div>
    </header>`;

    const mq = window.matchMedia('(min-width:768px)');
    const tog = e => {
        document.getElementById('dn').style.display = e.matches ? 'flex' : 'none';
        document.getElementById('mn').style.display = e.matches ? 'none' : 'block';
    };
    tog(mq); mq.addEventListener('change', tog);
}

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
                <div class="form-group"><label class="form-label">邮箱</label><input type="email" id="li-email" class="form-input" placeholder="your@email.com"></div>
                <div class="form-group"><label class="form-label">密码</label><input type="password" id="li-pwd" class="form-input" placeholder="••••••••" onkeydown="if(event.key==='Enter')handleLogin()"></div>
                <div id="li-err" class="form-error" style="display:none"></div>
                <div style="margin-top:20px"><button class="btn-primary" id="li-btn" onclick="handleLogin()">登录</button></div>
                <p class="modal-footer-text">还没有账号？<button onclick="switchAuthTab('register')">立即注册</button></p>
            </div>
            <div id="form-rg" class="modal-body" style="display:none">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                    <div class="form-group"><label class="form-label">姓名 *</label><input type="text" id="rg-name" class="form-input" placeholder="您的姓名"></div>
                    <div class="form-group"><label class="form-label">学校/单位</label><input type="text" id="rg-school" class="form-input" placeholder="所在单位"></div>
                </div>
                <div class="form-group"><label class="form-label">邮箱 *</label><input type="email" id="rg-email" class="form-input" placeholder="your@email.com"></div>
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
    const isLogin = tab === 'login';
    ['form-li','form-rg'].forEach((id,i) => { const el=document.getElementById(id); if(el) el.style.display = (i===0)===isLogin ? '' : 'none'; });
    ['tab-li','tab-rg'].forEach((id,i) => { const el=document.getElementById(id); if(el) el.className='modal-tab'+((i===0)===isLogin?' active':''); });
}

async function handleLogin() {
    const email = document.getElementById('li-email').value.trim();
    const pwd = document.getElementById('li-pwd').value;
    const err = document.getElementById('li-err');
    const btn = document.getElementById('li-btn');
    err.style.display = 'none';
    btn.disabled = true; btn.textContent = '登录中…';
    const result = await Auth.login(email, pwd);
    btn.disabled = false; btn.textContent = '登录';
    if (!result.ok) { err.textContent = result.msg; err.style.display = ''; return; }
    closeAuthModal();
    location.reload();
}

async function handleRegister() {
    const name   = document.getElementById('rg-name').value.trim();
    const email  = document.getElementById('rg-email').value.trim();
    const school = document.getElementById('rg-school').value.trim();
    const pwd    = document.getElementById('rg-pwd').value;
    const err    = document.getElementById('rg-err');
    const btn    = document.getElementById('rg-btn');
    err.style.display = 'none';
    btn.disabled = true; btn.textContent = '注册中…';
    const result = await Auth.register(name, email, school, pwd);
    btn.disabled = false; btn.textContent = '创建账号';
    if (!result.ok) { err.textContent = result.msg; err.style.display = ''; return; }
    closeAuthModal();
    location.reload();
}

/* ===== Toast ===== */
function showToast(msg) {
    let t = document.getElementById('site-toast');
    if (!t) { t = document.createElement('div'); t.id = 'site-toast'; t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2200);
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
                <li><a href="index.html">首页</a></li><li><a href="tools.html">AI 工具箱</a></li>
                <li><a href="news.html">全球资讯</a></li><li><a href="paths.html">学习路径</a></li>
                <li><a href="prompts.html">提示词库</a></li><li><a href="resources.html">设计资源库</a></li>
            </ul></div>
            <div class="footer-col"><h4>关于平台</h4>
                <p style="font-size:13px;color:#475569;line-height:1.7">本平台专为在职教师 AI 培训设计，持续收录全球优质 AI 教育资源，所有工具均经过实际教学场景验证。</p>
            </div>
        </div>
        <div class="footer-bottom">© 2025 AI 教师培训中心 · 保留所有权利</div>
    </footer>`;
}
