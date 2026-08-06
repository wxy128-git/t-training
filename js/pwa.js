(function () {
    'use strict';

    const APP_NAME = 'AI 教师培训中心';
    const INSTALL_DISMISS_KEY = 'xylaoshi:pwa-install-dismissed-at';
    const UPDATE_LATER_KEY = 'xylaoshi:pwa-update-later';
    const APP_PREVIEW_KEY = 'xylaoshi:pwa-app-preview';
    const INSTALL_COOLDOWN = 30 * 24 * 60 * 60 * 1000;
    const AUTO_PROMPT_PATHS = new Set(['/', '/index.html', '/resources.html', '/paths.html', '/articles.html']);
    const isLocalhost = ['localhost', '127.0.0.1'].includes(location.hostname);
    const isSecure = location.protocol === 'https:' || isLocalhost;
    const displayModeQuery = window.matchMedia('(display-mode: standalone)');
    let isAppInstalled = displayModeQuery.matches || window.navigator.standalone === true;
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|Edg|OPR|Firefox|FxiOS/.test(ua);
    let installPrompt = null;
    let updateWorker = null;
    let reloadAfterUpdate = false;
    let installCardTimer = 0;
    let networkStatusTimer = 0;
    let appShellSyncFrame = 0;
    let appIconObserver = null;

    const APP_TASKS = [
        { id: 'lesson-design', icon: 'lesson', title: '备一节课', meta: '教学设计与分层作业' },
        { id: 'quiz-gen', icon: 'quiz', title: '设计练习', meta: '题目、答案与解析' },
        { id: 'homework-grader', icon: 'review', title: '批改诊断', meta: '反馈与改进建议' },
        { id: 'class-activity', icon: 'activity', title: '课堂活动', meta: '可执行的活动方案' }
    ];

    function safeStorage(storage, method, key, value) {
        try {
            if (method === 'get') return storage.getItem(key);
            if (method === 'set') storage.setItem(key, value);
            if (method === 'remove') storage.removeItem(key);
        } catch (_) {
            return null;
        }
        return null;
    }

    function track(eventName, data) {
        try {
            if (window.Analytics && typeof window.Analytics.track === 'function') {
                window.Analytics.track(eventName, data || {});
            }
        } catch (_) {}
    }

    function appPreviewEnabled() {
        if (!isLocalhost) return false;
        const requested = new URLSearchParams(location.search).get('app-preview');
        if (requested === '1') safeStorage(sessionStorage, 'set', APP_PREVIEW_KEY, '1');
        if (requested === '0') safeStorage(sessionStorage, 'remove', APP_PREVIEW_KEY);
        return safeStorage(sessionStorage, 'get', APP_PREVIEW_KEY) === '1';
    }

    function isStandaloneApp() {
        return displayModeQuery.matches || window.navigator.standalone === true || appPreviewEnabled();
    }

    const APP_ICONS = {
        home: '<path d="M3.5 11.3 12 4l8.5 7.3v8.2a1.5 1.5 0 0 1-1.5 1.5h-4.5v-6h-5v6H5a1.5 1.5 0 0 1-1.5-1.5z"/>',
        sparkle: '<path d="M12 2.8c.6 3.6 2.4 5.4 6 6-3.6.6-5.4 2.4-6 6-.6-3.6-2.4-5.4-6-6 3.6-.6 5.4-2.4 6-6Z"/><path d="M18.3 15.2c.3 1.8 1.2 2.7 3 3-1.8.3-2.7 1.2-3 3-.3-1.8-1.2-2.7-3-3 1.8-.3 2.7-1.2 3-3Z"/>',
        book: '<path d="M5 4.5h9.5A2.5 2.5 0 0 1 17 7v13H6.5A2.5 2.5 0 0 1 4 17.5v-12A1 1 0 0 1 5 4.5Z"/><path d="M7 8h7M7 11h7M6.5 20A2.5 2.5 0 0 1 9 17.5h8"/>',
        classroom: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3.2 2M8.5 3.8 7 2.5M15.5 3.8 17 2.5"/>',
        more: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
        arrow: '<path d="m9 5 7 7-7 7"/>',
        lesson: '<path d="M4 5.5h16v14H4z"/><path d="M8 3v5M16 3v5M7.5 11h9M7.5 15h5"/>',
        quiz: '<path d="M6 3.5h12v17H6z"/><path d="m9 9 1.5 1.5L14 7M9 15h6"/>',
        review: '<path d="M4 4h11v15H4z"/><path d="m8 11 2 2 6-6M17 9h3v11H9"/>',
        activity: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3.5 20c.4-4.1 2.2-6 5.5-6s5.1 1.9 5.5 6M14 14.5c3.7-.8 5.8 1 6.3 4.5"/>',
        image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m5.5 18 4.2-4.5 3.2 3 2.5-2.3L19 18"/>',
        toolbox: '<path d="M3 8h18v11H3zM8 8V5h8v3M3 12h18M10 12v2h4v-2"/>',
        folder: '<path d="M3 6.5h7l2 2h9v11H3z"/>',
        shield: '<path d="M12 3 20 6v5.5c0 4.5-2.7 7.6-8 9.5-5.3-1.9-8-5-8-9.5V6z"/><path d="m8.5 12 2.2 2.2 4.8-5"/>',
        clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
        back: '<path d="m15 5-7 7 7 7"/><path d="M8 12h11"/>',
        close: '<path d="m6 6 12 12M18 6 6 18"/>',
        offline: '<path d="M3 3l18 18M8.5 8.5A6 6 0 0 1 18 12M5 12a9.8 9.8 0 0 1 1.2-2.2M8.5 15.5a5 5 0 0 1 7 0M12 19h.01"/>',
        graduation: '<path d="m3 9 9-5 9 5-9 5z"/><path d="M7 12v4c2.8 2 7.2 2 10 0v-4M21 9v6"/>',
        news: '<path d="M5 5h14v14H5z"/><path d="M8 9h8M8 12h8M8 15h5"/>',
        path: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M7.5 16.5 16.5 7.5M7 7h4v4"/>',
        article: '<path d="M6 3.5h9l3 3V20H6z"/><path d="M15 3.5V7h3M9 11h6M9 14h6M9 17h4"/>',
        quote: '<path d="M5 7h6v6H7c0 2-1 3.5-3 4M14 7h6v6h-4c0 2-1 3.5-3 4"/>',
        download: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
        signin: '<path d="M10 4H5v16h5M14 8l4 4-4 4M8 12h10"/>',
        user: '<circle cx="12" cy="8" r="3"/><path d="M5.5 20c.5-4.2 2.6-6 6.5-6s6 1.8 6.5 6"/>',
        mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
        pencil: '<path d="m4 20 4.2-1 10.6-10.6-3.2-3.2L5 15.8z"/><path d="m13.8 7 3.2 3.2M4 20h6"/>',
        copy: '<rect x="8" y="8" width="11" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3"/>',
        refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 8A7 7 0 0 1 18 6l2 6M17.9 16A7 7 0 0 1 6 18l-2-6"/>',
        trash: '<path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/>'
    };

    function appIcon(name) {
        return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${APP_ICONS[name] || APP_ICONS.sparkle}</svg>`;
    }

    function cleanPathname() {
        const path = location.pathname.replace(/\.html$/, '').replace(/\/$/, '');
        return path === '/index' ? '/' : (path || '/');
    }

    function appSection() {
        const path = cleanPathname();
        if (path === '/') return 'home';
        if (path === '/agents') return 'agents';
        if (path === '/workspace') return 'workspace';
        if (path === '/classroom-tools') return 'classroom';
        return 'more';
    }

    function appPageTitle() {
        const path = cleanPathname();
        return ({
            '/': 'AI 教研',
            '/agents': '智能体工作台',
            '/workspace': '我的备课本',
            '/classroom-tools': '课堂工具',
            '/multimodal': '多模态工作坊',
            '/tools': 'AI 资源精选',
            '/resources': '课件素材',
            '/news': 'AI 资讯',
            '/paths': '学习路径',
            '/articles': '精选文章',
            '/article': '文章阅读',
            '/prompts': '提示词库',
            '/offline': '离线模式'
        })[path] || 'AI 教研';
    }

    function isSecondaryAppPage() {
        return !new Set(['/', '/agents', '/workspace', '/classroom-tools', '/offline']).has(cleanPathname());
    }

    function createAppTabBar() {
        if (!isStandaloneApp() || document.getElementById('pwa-app-tabbar')) return;
        const nav = document.createElement('nav');
        nav.id = 'pwa-app-tabbar';
        nav.className = 'pwa-app-tabbar';
        nav.setAttribute('aria-label', '应用主导航');
        nav.innerHTML = `
            <a class="pwa-app-tab" href="/" data-pwa-tab="home"><span class="pwa-app-tab-icon">${appIcon('home')}</span><span>首页</span></a>
            <a class="pwa-app-tab" href="/workspace" data-pwa-tab="workspace"><span class="pwa-app-tab-icon">${appIcon('book')}</span><span>备课本</span></a>
            <button class="pwa-app-tab pwa-app-tab-primary" type="button" data-pwa-start data-pwa-tab="agents" aria-haspopup="dialog" aria-controls="pwa-task-dialog" aria-expanded="false"><span class="pwa-app-tab-icon">${appIcon('sparkle')}</span><span>开始</span></button>
            <a class="pwa-app-tab" href="/classroom-tools" data-pwa-tab="classroom"><span class="pwa-app-tab-icon">${appIcon('classroom')}</span><span>课堂</span></a>
            <button class="pwa-app-tab" type="button" data-pwa-more data-pwa-tab="more" aria-controls="nav-drawer" aria-expanded="false"><span class="pwa-app-tab-icon">${appIcon('more')}</span><span>更多</span></button>`;
        document.body.appendChild(nav);
    }

    function createTaskLauncher() {
        if (!isStandaloneApp() || document.getElementById('pwa-task-dialog')) return;
        const dialog = document.createElement('dialog');
        dialog.id = 'pwa-task-dialog';
        dialog.className = 'pwa-task-dialog';
        dialog.setAttribute('aria-labelledby', 'pwa-task-dialog-title');
        dialog.innerHTML = `
            <div class="pwa-task-sheet">
                <div class="pwa-sheet-handle" aria-hidden="true"></div>
                <div class="pwa-task-sheet-head">
                    <div><p>新建教学任务</p><h2 id="pwa-task-dialog-title">从哪里开始？</h2></div>
                    <button type="button" class="pwa-sheet-close" data-pwa-sheet-close aria-label="关闭任务菜单">${appIcon('close')}</button>
                </div>
                <a class="pwa-task-resume" data-pwa-task-resume data-pwa-task="resume" href="/agents#lesson-design" hidden>
                    <span class="pwa-task-resume-icon">${appIcon('clock')}</span>
                    <span class="pwa-task-resume-copy"><small>继续进行中</small><b></b><span></span></span>
                    <span class="pwa-task-resume-arrow">${appIcon('arrow')}</span>
                </a>
                <div class="pwa-launch-grid">
                    ${APP_TASKS.map(task => `<a href="/agents#${task.id}" data-pwa-task="${task.id}"><span>${appIcon(task.icon)}</span><b>${task.title}</b><small>${task.meta}</small></a>`).join('')}
                </div>
                <a class="pwa-launch-all" href="/agents" data-pwa-task="all-agents"><span>${appIcon('sparkle')}</span><b>浏览全部智能体</b><small>按备课、课堂、评价与教师发展查找</small><i>${appIcon('arrow')}</i></a>
            </div>`;
        dialog.addEventListener('click', (event) => {
            if (event.target === dialog) closeTaskLauncher();
        });
        dialog.addEventListener('close', () => {
            document.documentElement.classList.remove('pwa-sheet-open');
            document.querySelector('[data-pwa-start]')?.setAttribute('aria-expanded', 'false');
        });
        document.body.appendChild(dialog);
    }

    function closeTaskLauncher() {
        const dialog = document.getElementById('pwa-task-dialog');
        if (!dialog) return;
        if (typeof dialog.close === 'function' && dialog.open) dialog.close();
        else {
            dialog.removeAttribute('open');
            document.documentElement.classList.remove('pwa-sheet-open');
            document.querySelector('[data-pwa-start]')?.setAttribute('aria-expanded', 'false');
        }
    }

    function taskResumeState() {
        let project = null;
        let draft = null;
        try {
            project = window.TeachingProjects?.getActiveProject?.() || null;
            draft = window.TeachingProjects?.listDrafts?.()?.[0] || null;
        } catch (_) {}
        if (!project && !draft) return null;
        const agent = (window.AGENTS || []).find(item => item.id === draft?.agentId);
        const context = project ? [project.grade, project.subject, project.topic].filter(Boolean).join(' · ') : '';
        return {
            href: draft?.agentId ? `/agents#${encodeURIComponent(draft.agentId)}` : '/agents#lesson-design',
            title: project?.title || `${agent?.name || '智能体'}未完成草稿`,
            meta: [context, draft ? '草稿保存在本机' : '继续当前教学项目'].filter(Boolean).join(' · ')
        };
    }

    function updateTaskLauncher() {
        const resume = document.querySelector('[data-pwa-task-resume]');
        if (!resume) return;
        const state = taskResumeState();
        resume.hidden = !state;
        if (!state) return;
        resume.href = state.href;
        resume.querySelector('b').textContent = state.title;
        resume.querySelector('.pwa-task-resume-copy > span').textContent = state.meta;
    }

    function openTaskLauncher() {
        createTaskLauncher();
        updateTaskLauncher();
        const dialog = document.getElementById('pwa-task-dialog');
        if (!dialog) return;
        document.documentElement.classList.add('pwa-sheet-open');
        document.querySelector('[data-pwa-start]')?.setAttribute('aria-expanded', 'true');
        if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
        else dialog.setAttribute('open', '');
        track('pwa_task_launcher_opened');
    }

    function createAppHome() {
        if (!isStandaloneApp() || cleanPathname() !== '/' || document.getElementById('pwa-app-home')) return;
        const main = document.getElementById('main-content');
        if (!main) return;
        const home = document.createElement('section');
        home.id = 'pwa-app-home';
        home.className = 'pwa-app-home';
        home.setAttribute('aria-labelledby', 'pwa-app-home-title');
        home.innerHTML = `
            <div class="pwa-app-home-heading">
                <p class="pwa-app-today" id="pwa-app-today"></p>
                <h1 id="pwa-app-home-title">今天准备哪项教学任务？</h1>
                <p>从真实任务开始，AI 起草初稿，你来核验定稿。</p>
            </div>
            <a class="pwa-app-resume" id="pwa-app-resume" href="/agents#lesson-design" hidden>
                <span class="pwa-app-resume-icon">${appIcon('clock')}</span>
                <span class="pwa-app-resume-copy"><small>继续上次任务</small><b id="pwa-app-resume-title"></b><span id="pwa-app-resume-meta"></span></span>
                <span class="pwa-app-resume-arrow">${appIcon('arrow')}</span>
            </a>
            <section class="pwa-app-section" aria-labelledby="pwa-app-task-title">
                <div class="pwa-app-section-head"><h2 id="pwa-app-task-title">常用任务</h2><a href="/agents">全部智能体 ${appIcon('arrow')}</a></div>
                <div class="pwa-app-task-grid">${APP_TASKS.map(task => `<a class="pwa-app-task" href="/agents#${task.id}"><span class="pwa-app-task-icon">${appIcon(task.icon)}</span><b>${task.title}</b><small>${task.meta}</small></a>`).join('')}</div>
            </section>
            <section class="pwa-app-section" aria-labelledby="pwa-app-quick-title">
                <div class="pwa-app-section-head"><h2 id="pwa-app-quick-title">教学工具</h2></div>
                <div class="pwa-app-quick-grid">
                    <a href="/classroom-tools"><span>${appIcon('classroom')}</span><b>课堂工具</b><small>计时、分组与互动</small></a>
                    <a href="/multimodal"><span>${appIcon('image')}</span><b>多模态工作坊</b><small>图像、音视频案例</small></a>
                    <a href="/tools"><span>${appIcon('toolbox')}</span><b>AI 资源精选</b><small>按任务选择工具</small></a>
                    <a href="/resources"><span>${appIcon('folder')}</span><b>课件素材</b><small>常用素材入口</small></a>
                </div>
            </section>
            <div class="pwa-app-principle"><span>${appIcon('shield')}</span><p><b>教师负责最终判断</b><small>核对事实、难度、学情与课堂条件后再投入使用。</small></p></div>`;
        main.prepend(home);
        updateAppHome();
    }

    function updateAppHome() {
        const home = document.getElementById('pwa-app-home');
        if (!home) return;
        const now = new Date();
        const today = document.getElementById('pwa-app-today');
        if (today) today.textContent = now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
        const heading = document.getElementById('pwa-app-home-title');
        if (heading) {
            const hour = now.getHours();
            const greeting = hour < 6 ? '夜深了' : hour < 11 ? '上午好' : hour < 14 ? '中午好' : hour < 19 ? '下午好' : '晚上好';
            heading.textContent = `${greeting}，先完成哪项教学任务？`;
        }
        const resume = document.getElementById('pwa-app-resume');
        if (!resume) return;
        const state = taskResumeState();
        if (!state) {
            resume.hidden = true;
            return;
        }
        document.getElementById('pwa-app-resume-title').textContent = state.title;
        document.getElementById('pwa-app-resume-meta').textContent = state.meta;
        resume.href = state.href;
        resume.hidden = false;
    }

    function syncAppHeader() {
        const inner = document.querySelector('.site-header .site-header-inner');
        if (!inner) return;
        const logo = inner.querySelector('.site-logo');
        const secondary = isSecondaryAppPage();
        document.documentElement.classList.toggle('pwa-app-secondary', secondary);

        let back = inner.querySelector('.pwa-app-back');
        if (secondary && !back) {
            back = document.createElement('button');
            back.type = 'button';
            back.className = 'pwa-app-back';
            back.setAttribute('aria-label', '返回上一页');
            back.innerHTML = appIcon('back');
            inner.insertBefore(back, logo || inner.firstChild);
        } else if (!secondary && back) {
            back.remove();
        }

        let offline = inner.querySelector('.pwa-app-offline-badge');
        if (!offline) {
            offline = document.createElement('span');
            offline.className = 'pwa-app-offline-badge';
            offline.setAttribute('role', 'status');
            offline.setAttribute('aria-live', 'polite');
            offline.innerHTML = `${appIcon('offline')}<span>离线</span>`;
            inner.querySelector('.auth-area')?.before(offline);
        }
        offline.hidden = navigator.onLine;

        const routeIcons = {
            '/': 'home',
            '/agents': 'sparkle',
            '/workspace': 'book',
            '/multimodal': 'image',
            '/classroom-tools': 'classroom',
            '/tools': 'toolbox',
            '/resources': 'folder',
            '/news': 'news',
            '/paths': 'path',
            '/articles': 'article',
            '/prompts': 'quote'
        };
        document.querySelectorAll('.site-header .site-logo-icon, .nav-drawer-brand .site-logo-icon').forEach((node) => {
            if (node.dataset.pwaSvg === '1') return;
            node.innerHTML = appIcon('graduation');
            node.dataset.pwaSvg = '1';
        });
        const drawerClose = document.querySelector('.nav-drawer-close');
        if (drawerClose && drawerClose.dataset.pwaSvg !== '1') {
            drawerClose.innerHTML = appIcon('close');
            drawerClose.dataset.pwaSvg = '1';
        }
        document.querySelectorAll('.nav-drawer a.nav-link[href]').forEach((link) => {
            if (link.dataset.pwaSvg === '1') return;
            let path = '';
            try { path = new URL(link.getAttribute('href'), location.origin).pathname.replace(/\/$/, '') || '/'; }
            catch (_) {}
            const iconName = routeIcons[path];
            if (!iconName) return;
            link.querySelector('i')?.remove();
            link.insertAdjacentHTML('afterbegin', appIcon(iconName));
            link.dataset.pwaSvg = '1';
        });
        document.querySelectorAll('.nav-drawer button.nav-link').forEach((button) => {
            if (button.dataset.pwaSvg === '1') return;
            const label = button.textContent.trim();
            const iconName = label.includes('安装') ? 'download'
                : label.includes('注册') ? 'user'
                : label.includes('登录') ? 'signin'
                : label.includes('联系') ? 'mail' : '';
            if (!iconName) return;
            button.querySelector('i')?.remove();
            button.insertAdjacentHTML('afterbegin', appIcon(iconName));
            button.dataset.pwaSvg = '1';
        });
    }

    function syncWorkspaceIcons() {
        if (cleanPathname() !== '/agents') return;
        const back = document.querySelector('#view-workspace .ws-back');
        if (back && !back.querySelector('svg')) back.innerHTML = appIcon('back');
        const agentIcon = document.getElementById('ws-ico');
        if (agentIcon && !agentIcon.querySelector('svg')) agentIcon.innerHTML = appIcon('sparkle');

        const classIcons = {
            'ph-arrow-left': 'back',
            'ph-notebook': 'book',
            'ph-cpu': 'toolbox',
            'ph-folder-notch-open': 'folder',
            'ph-pencil-simple': 'pencil',
            'ph-bookmark-simple': 'book',
            'ph-copy': 'copy',
            'ph-arrows-clockwise': 'refresh',
            'ph-trash': 'trash'
        };
        document.querySelectorAll('#view-workspace i[class*="ph-"]').forEach((icon) => {
            const iconName = Object.entries(classIcons).find(([className]) => icon.classList.contains(className))?.[1];
            if (!iconName) return;
            icon.insertAdjacentHTML('afterend', appIcon(iconName));
            icon.remove();
        });
    }

    function watchWorkspaceIcons() {
        if (appIconObserver || cleanPathname() !== '/agents') return;
        const root = document.getElementById('view-workspace');
        if (!root || !('MutationObserver' in window)) return;
        appIconObserver = new MutationObserver((mutations) => {
            const hasNewIcon = mutations.some(mutation => [...mutation.addedNodes].some((node) =>
                node.nodeType === 1 && (node.matches?.('i[class*="ph-"]') || node.querySelector?.('i[class*="ph-"]'))
            ));
            if (hasNewIcon) scheduleAppShellSync();
        });
        appIconObserver.observe(root, { childList: true, subtree: true });
    }

    function syncAppShell() {
        if (!isStandaloneApp()) return;
        const section = appSection();
        document.querySelectorAll('[data-pwa-tab]').forEach((tab) => {
            const active = tab.dataset.pwaTab === section;
            tab.classList.toggle('active', active);
            if (tab.tagName === 'A') {
                if (active) tab.setAttribute('aria-current', 'page');
                else tab.removeAttribute('aria-current');
            } else {
                tab.setAttribute('aria-pressed', String(active));
            }
        });
        const title = appPageTitle();
        const logo = document.querySelector('.site-header .site-logo');
        const titleNode = logo?.querySelector('.site-logo-text strong');
        if (titleNode && titleNode.textContent !== title) titleNode.textContent = title;
        if (logo) logo.setAttribute('aria-label', `${title}，返回首页`);
        const avatar = document.querySelector('.site-header .user-avatar');
        if (avatar) {
            avatar.setAttribute('role', 'button');
            avatar.setAttribute('tabindex', '0');
            avatar.setAttribute('aria-label', '打开账户与更多菜单');
        }
        const more = document.querySelector('[data-pwa-more]');
        if (more) more.setAttribute('aria-expanded', String(document.getElementById('nav-drawer')?.classList.contains('open') || false));
        syncAppHeader();
        syncWorkspaceIcons();
    }

    function scheduleAppShellSync() {
        window.cancelAnimationFrame(appShellSyncFrame);
        appShellSyncFrame = window.requestAnimationFrame(syncAppShell);
    }

    function setupAppShell() {
        if (!isStandaloneApp()) return;
        document.documentElement.classList.add('pwa-app-mode');
        if (cleanPathname() === '/') document.documentElement.classList.add('pwa-app-home-page');
        createAppTabBar();
        createTaskLauncher();
        createAppHome();
        watchWorkspaceIcons();
        if (document.getElementById('pwa-app-home')) document.documentElement.classList.add('pwa-app-home-ready');
        syncAppShell();
    }

    function getCardStack() {
        let stack = document.getElementById('pwa-card-stack');
        if (!stack) {
            stack = document.createElement('div');
            stack.id = 'pwa-card-stack';
            stack.className = 'pwa-card-stack';
            stack.setAttribute('aria-live', 'polite');
            document.body.appendChild(stack);
        }
        return stack;
    }

    function removeCard(id) {
        const card = document.getElementById(id);
        if (!card) return;
        const parent = card.parentElement;
        card.remove();
        if (id === 'pwa-install-card') document.documentElement.classList.remove('pwa-install-visible');
        if (parent?.classList.contains('pwa-inline-install-host') && !parent.children.length) parent.remove();
    }

    function syncInstallButtons() {
        const available = isSecure && !isAppInstalled;
        document.querySelectorAll('[data-pwa-install]').forEach((button) => {
            button.hidden = !available;
            button.setAttribute('aria-label', isIOS ? '查看添加到主屏幕的方法' : `安装${APP_NAME}`);
        });
    }

    function installPromptDismissedRecently() {
        const value = Number(safeStorage(localStorage, 'get', INSTALL_DISMISS_KEY));
        return Number.isFinite(value) && value > 0 && Date.now() - value < INSTALL_COOLDOWN;
    }

    function dismissInstallCard() {
        window.clearTimeout(installCardTimer);
        safeStorage(localStorage, 'set', INSTALL_DISMISS_KEY, String(Date.now()));
        removeCard('pwa-install-card');
        track('pwa_install_dismissed');
    }

    async function requestInstall() {
        if (!installPrompt) {
            openInstallHelp();
            return;
        }

        const promptEvent = installPrompt;
        installPrompt = null;
        removeCard('pwa-install-card');
        try {
            await promptEvent.prompt();
            const choice = await promptEvent.userChoice;
            track('pwa_install_choice', { meta: { outcome: choice && choice.outcome ? choice.outcome : 'unknown' } });
            if (!choice || choice.outcome !== 'accepted') {
                safeStorage(localStorage, 'set', INSTALL_DISMISS_KEY, String(Date.now()));
            }
        } catch (_) {
            openInstallHelp();
        }
        syncInstallButtons();
    }

    function showInstallCard() {
        if (!installPrompt || isAppInstalled || installPromptDismissedRecently() || !AUTO_PROMPT_PATHS.has(location.pathname)) return;
        if (document.getElementById('pwa-install-card')) return;

        const card = document.createElement('section');
        card.id = 'pwa-install-card';
        card.className = 'pwa-card';
        document.documentElement.classList.add('pwa-install-visible');
        card.setAttribute('aria-label', '安装应用');
        card.innerHTML = `
            <img class="pwa-card-icon" src="/assets/pwa/icon-192.png" alt="">
            <div class="pwa-card-copy">
                <h2 class="pwa-card-title">安装到设备，像应用一样打开</h2>
                <p class="pwa-card-text">独立窗口启动，常用入口更直接；不会额外缓存教师私有数据。</p>
                <div class="pwa-card-actions">
                    <button type="button" class="pwa-button pwa-button-primary" data-pwa-confirm-install>安装</button>
                    <button type="button" class="pwa-button" data-pwa-dismiss-install>暂不</button>
                </div>
            </div>
            <button type="button" class="pwa-close" data-pwa-dismiss-install aria-label="关闭安装提示">×</button>`;
        const taskSection = document.getElementById('task-start');
        const useInlineMobileCard = cleanPathname() === '/' && window.matchMedia('(max-width: 600px)').matches && taskSection;
        if (useInlineMobileCard) {
            const host = document.createElement('div');
            host.className = 'th-shell pwa-inline-install-host';
            card.classList.add('pwa-card-inline');
            host.appendChild(card);
            taskSection.before(host);
        } else {
            getCardStack().appendChild(card);
        }
    }

    function installHelpContent() {
        if (isIOS) {
            return {
                title: '添加到主屏幕',
                copy: 'iPhone 和 iPad 通过浏览器的分享菜单完成安装。安装后会以独立窗口启动。',
                steps: [
                    '点击浏览器工具栏中的“分享”按钮。',
                    '在操作列表中选择“添加到主屏幕”。',
                    '确认名称后点击右上角“添加”。'
                ],
                note: '如果没有看到该选项，请在 Safari 中打开当前页面后再试。'
            };
        }
        if (isSafari) {
            return {
                title: '添加到程序坞',
                copy: '新版 macOS Safari 可以把网站作为应用安装到程序坞。',
                steps: [
                    '保持当前页面打开。',
                    '在 Safari 菜单栏选择“文件”。',
                    '点击“添加到程序坞”，然后确认。'
                ],
                note: '若菜单中没有该选项，请更新 macOS，或使用最新版 Chrome / Edge 安装。'
            };
        }
        return {
            title: '安装桌面应用',
            copy: '支持的浏览器会在地址栏或主菜单中提供安装入口。',
            steps: [
                '在地址栏右侧查找“安装”图标；或打开浏览器主菜单。',
                '选择“安装 AI 教师培训中心”或“安装应用”。',
                '确认后，可从桌面、程序坞或开始菜单启动。'
            ],
            note: '建议使用最新版 Chrome 或 Edge。Firefox 桌面版目前不提供标准的网站应用安装入口。'
        };
    }

    function getInstallDialog() {
        let dialog = document.getElementById('pwa-install-dialog');
        if (!dialog) {
            dialog = document.createElement('dialog');
            dialog.id = 'pwa-install-dialog';
            dialog.className = 'pwa-install-dialog';
            dialog.setAttribute('aria-labelledby', 'pwa-dialog-title');
            document.body.appendChild(dialog);
            dialog.addEventListener('click', (event) => {
                if (event.target === dialog) dialog.close();
            });
        }
        return dialog;
    }

    function openInstallHelp() {
        const content = installHelpContent();
        const dialog = getInstallDialog();
        dialog.innerHTML = `
            <div class="pwa-dialog-body">
                <button type="button" class="pwa-dialog-close" data-pwa-close-dialog aria-label="关闭">×</button>
                <p class="pwa-dialog-kicker">PWA 安装</p>
                <h2 class="pwa-dialog-title" id="pwa-dialog-title">${content.title}</h2>
                <p class="pwa-dialog-copy">${content.copy}</p>
                <ol class="pwa-dialog-steps">${content.steps.map((step) => `<li>${step}</li>`).join('')}</ol>
                <p class="pwa-dialog-note">${content.note}</p>
                <div class="pwa-dialog-actions">
                    <button type="button" class="pwa-button pwa-button-primary" data-pwa-close-dialog>知道了</button>
                </div>
            </div>`;
        if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
        else dialog.setAttribute('open', '');
        track('pwa_install_help_opened', { meta: { platform: isIOS ? 'ios' : isSafari ? 'safari' : 'other' } });
    }

    function showUpdateCard(worker) {
        if (!worker || safeStorage(sessionStorage, 'get', UPDATE_LATER_KEY) === '1') return;
        updateWorker = worker;
        if (document.getElementById('pwa-update-card')) return;

        const card = document.createElement('section');
        card.id = 'pwa-update-card';
        card.className = 'pwa-card';
        card.setAttribute('aria-label', '应用更新');
        card.innerHTML = `
            <img class="pwa-card-icon" src="/assets/pwa/icon-192.png" alt="">
            <div class="pwa-card-copy">
                <h2 class="pwa-card-title">新版本已准备好</h2>
                <p class="pwa-card-text">点击更新后页面会刷新。请先保存正在编辑的教学成果。</p>
                <div class="pwa-card-actions">
                    <button type="button" class="pwa-button pwa-button-primary" data-pwa-apply-update>立即更新</button>
                    <button type="button" class="pwa-button" data-pwa-update-later>稍后</button>
                </div>
            </div>`;
        getCardStack().appendChild(card);
    }

    function applyUpdate() {
        if (!updateWorker) return;
        reloadAfterUpdate = true;
        updateWorker.postMessage({ type: 'SKIP_WAITING' });
        track('pwa_update_applied');
    }

    function updateLater() {
        safeStorage(sessionStorage, 'set', UPDATE_LATER_KEY, '1');
        removeCard('pwa-update-card');
        track('pwa_update_deferred');
    }

    function showNetworkStatus(message, state, persistent) {
        let status = document.getElementById('pwa-network-status');
        if (!status) {
            status = document.createElement('div');
            status.id = 'pwa-network-status';
            status.className = 'pwa-network-status';
            status.setAttribute('role', 'status');
            status.setAttribute('aria-live', 'polite');
            document.body.appendChild(status);
        }
        window.clearTimeout(networkStatusTimer);
        status.dataset.state = state;
        status.textContent = message;
        status.hidden = false;
        if (!persistent) {
            networkStatusTimer = window.setTimeout(() => { status.hidden = true; }, 4200);
        }
    }

    function handleNetworkChange() {
        syncAppHeader();
        if (navigator.onLine) {
            showNetworkStatus('网络已恢复，在线功能可以继续使用。', 'online', false);
        } else {
            showNetworkStatus('当前离线：可查看已缓存页面，AI 生成与同步暂不可用。', 'offline', !isStandaloneApp());
        }
    }

    function watchInstallEntrypoints() {
        if (!('MutationObserver' in window)) return;
        const observer = new MutationObserver(() => {
            syncInstallButtons();
            scheduleAppShellSync();
        });
        ['main-nav', 'main-footer'].forEach((id) => {
            const root = document.getElementById(id);
            if (root) observer.observe(root, { childList: true, subtree: true });
        });
    }

    async function registerServiceWorker() {
        if (!isSecure || !('serviceWorker' in navigator)) return;
        try {
            const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
            if (registration.waiting && navigator.serviceWorker.controller) showUpdateCard(registration.waiting);

            registration.addEventListener('updatefound', () => {
                const worker = registration.installing;
                if (!worker) return;
                worker.addEventListener('statechange', () => {
                    if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdateCard(worker);
                });
            });

            const lastCheck = Number(safeStorage(sessionStorage, 'get', 'xylaoshi:pwa-update-check')) || 0;
            if (Date.now() - lastCheck > 60 * 60 * 1000) {
                safeStorage(sessionStorage, 'set', 'xylaoshi:pwa-update-check', String(Date.now()));
                registration.update().catch(() => {});
            }
        } catch (error) {
            console.warn('[PWA] Service Worker 注册失败：', error);
        }
    }

    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        installPrompt = event;
        syncInstallButtons();
        window.clearTimeout(installCardTimer);
        installCardTimer = window.setTimeout(showInstallCard, 8000);
    });

    window.addEventListener('appinstalled', () => {
        installPrompt = null;
        isAppInstalled = true;
        window.clearTimeout(installCardTimer);
        removeCard('pwa-install-card');
        syncInstallButtons();
        safeStorage(localStorage, 'remove', INSTALL_DISMISS_KEY);
        showNetworkStatus('安装完成，可从桌面或主屏幕直接打开。', 'online', false);
        track('pwa_installed');
    });

    navigator.serviceWorker && navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloadAfterUpdate) location.reload();
    });

    document.addEventListener('click', (event) => {
        const eventElement = event.target instanceof Element ? event.target : event.target.parentElement;
        const appTab = eventElement?.closest('[data-pwa-tab]');
        if (appTab?.matches('a') && appTab.classList.contains('active')) {
            const destination = new URL(appTab.href, location.href);
            if (destination.pathname === location.pathname && !destination.hash) {
                event.preventDefault();
                window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
            }
        }
        if (appTab?.matches('[data-pwa-more]')) {
            if (typeof window.openNavDrawer === 'function') window.openNavDrawer();
            else showNetworkStatus('更多功能暂不可用，请先返回已缓存页面或恢复网络。', 'offline', false);
            scheduleAppShellSync();
        }
        if (appTab?.matches('[data-pwa-start]')) {
            event.preventDefault();
            openTaskLauncher();
        }
        const back = eventElement?.closest('.pwa-app-back');
        if (back) {
            const sameOriginReferrer = (() => {
                try { return Boolean(document.referrer) && new URL(document.referrer).origin === location.origin; }
                catch (_) { return false; }
            })();
            if (sameOriginReferrer && history.length > 1) history.back();
            else location.assign('/');
        }
        if (eventElement?.closest('[data-pwa-sheet-close]')) {
            closeTaskLauncher();
        }
        const taskLink = eventElement?.closest('[data-pwa-task]');
        if (taskLink) {
            track('pwa_task_started', { meta: { task: taskLink.getAttribute('data-pwa-task') || 'unknown' } });
            closeTaskLauncher();
        }
        const avatar = eventElement?.closest('.pwa-app-mode .site-header .user-avatar');
        if (avatar && typeof window.openNavDrawer === 'function') {
            window.openNavDrawer();
            scheduleAppShellSync();
        }
        const target = eventElement && eventElement.closest('button, [data-pwa-install]');
        if (!target) return;
        if (target.matches('[data-pwa-install], [data-pwa-confirm-install]')) requestInstall();
        else if (target.matches('[data-pwa-dismiss-install]')) dismissInstallCard();
        else if (target.matches('[data-pwa-close-dialog]')) {
            const dialog = document.getElementById('pwa-install-dialog');
            if (dialog) typeof dialog.close === 'function' ? dialog.close() : dialog.removeAttribute('open');
        } else if (target.matches('[data-pwa-apply-update]')) applyUpdate();
        else if (target.matches('[data-pwa-update-later]')) updateLater();
    });

    document.addEventListener('keydown', (event) => {
        const avatar = event.target instanceof Element ? event.target.closest('.pwa-app-mode .site-header .user-avatar') : null;
        if (!avatar || !['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        if (typeof window.openNavDrawer === 'function') window.openNavDrawer();
        scheduleAppShellSync();
    });

    window.addEventListener('online', handleNetworkChange);
    window.addEventListener('offline', handleNetworkChange);
    window.addEventListener('load', () => {
        registerServiceWorker();
        updateAppHome();
        syncAppShell();
    }, { once: true });
    window.addEventListener('pageshow', updateAppHome);
    window.addEventListener('scroll', () => {
        document.documentElement.classList.toggle('pwa-app-scrolled', window.scrollY > 6);
    }, { passive: true });
    document.addEventListener('authChanged', () => { updateAppHome(); updateTaskLauncher(); });
    document.addEventListener('authRefresh', () => { updateAppHome(); updateTaskLauncher(); });

    setupAppShell();
    syncInstallButtons();
    watchInstallEntrypoints();
    if (!navigator.onLine) handleNetworkChange();
})();
