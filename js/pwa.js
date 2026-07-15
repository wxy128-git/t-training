(function () {
    'use strict';

    const APP_NAME = 'AI 教师培训中心';
    const INSTALL_DISMISS_KEY = 'xylaoshi:pwa-install-dismissed-at';
    const UPDATE_LATER_KEY = 'xylaoshi:pwa-update-later';
    const INSTALL_COOLDOWN = 30 * 24 * 60 * 60 * 1000;
    const AUTO_PROMPT_PATHS = new Set(['/', '/index.html', '/resources.html', '/paths.html', '/articles.html']);
    const isLocalhost = ['localhost', '127.0.0.1'].includes(location.hostname);
    const isSecure = location.protocol === 'https:' || isLocalhost;
    let isAppInstalled = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|Edg|OPR|Firefox|FxiOS/.test(ua);
    let installPrompt = null;
    let updateWorker = null;
    let reloadAfterUpdate = false;
    let installCardTimer = 0;
    let networkStatusTimer = 0;

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
        if (card) card.remove();
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
        getCardStack().appendChild(card);
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
        if (navigator.onLine) {
            showNetworkStatus('网络已恢复，在线功能可以继续使用。', 'online', false);
        } else {
            showNetworkStatus('当前离线：可查看已缓存页面，AI 生成与同步暂不可用。', 'offline', true);
        }
    }

    function watchInstallEntrypoints() {
        if (!('MutationObserver' in window)) return;
        const observer = new MutationObserver(syncInstallButtons);
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

    window.addEventListener('online', handleNetworkChange);
    window.addEventListener('offline', handleNetworkChange);
    window.addEventListener('load', registerServiceWorker, { once: true });

    syncInstallButtons();
    watchInstallEntrypoints();
    if (!navigator.onLine) handleNetworkChange();
})();
