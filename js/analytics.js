/* ===================================================================
   站内数据统计 · 轻量埋点
   - 只记录访问与功能动作，不记录智能体输入/输出正文
   - 写入统一走 /api/analytics，前端不直接开放统计集合写权限
   =================================================================== */
(function () {
    const VISITOR_KEY = 'xylaoshiAnalyticsVisitor';
    const SESSION_KEY = 'xylaoshiAnalyticsSession';
    const ENDPOINT = '/api/analytics';

    function randomId(prefix) {
        if (window.crypto && crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
        return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    }

    function storageGet(key) {
        try { return localStorage.getItem(key); } catch { return null; }
    }

    function storageSet(key, value, session) {
        try { (session ? sessionStorage : localStorage).setItem(key, value); } catch {}
    }

    function visitorId() {
        let id = storageGet(VISITOR_KEY);
        if (!id) {
            id = randomId('v');
            storageSet(VISITOR_KEY, id, false);
        }
        return id;
    }

    function sessionId() {
        let id = null;
        try { id = sessionStorage.getItem(SESSION_KEY); } catch {}
        if (!id) {
            id = randomId('s');
            storageSet(SESSION_KEY, id, true);
        }
        return id;
    }

    function featureFromPath(pathname) {
        const p = pathname.split('/').pop() || 'index.html';
        if (p === 'agents.html') return 'agents';
        if (p === 'workspace.html') return 'workspace';
        if (p === 'multimodal.html' || p === 'media-player.html') return 'multimodal';
        if (p === 'classroom-tools.html') return 'classroom';
        if (p === 'tools.html') return 'tools';
        if (p === 'prompts.html') return 'prompts';
        if (p === 'paths.html') return 'paths';
        if (p === 'articles.html' || p === 'article.html') return 'articles';
        if (p === 'resources.html') return 'resources';
        if (p === 'news.html') return 'news';
        return 'site';
    }

    function currentUserProfile() {
        const user = window.Auth && Auth.getCurrentUser ? Auth.getCurrentUser() : window._currentUser;
        if (!user) return null;
        return {
            uid: user.uid || '',
            name: user.name || '',
            email: user.email || '',
            phone: user.phone || '',
            school: user.school || ''
        };
    }

    async function idToken() {
        try {
            if (window.Auth && Auth.getIdToken) return await Auth.getIdToken();
        } catch {}
        return '';
    }

    function basePayload(action, data) {
        const loc = window.location;
        const path = `${loc.pathname}${loc.search || ''}${loc.hash || ''}`;
        return {
            action,
            visitorId: visitorId(),
            sessionId: sessionId(),
            path,
            pageTitle: document.title || '',
            referrer: document.referrer || '',
            feature: data.feature || featureFromPath(loc.pathname),
            targetId: data.targetId || '',
            targetName: data.targetName || '',
            meta: data.meta || {},
            user: currentUserProfile()
        };
    }

    async function post(payload) {
        const token = await idToken();
        const body = JSON.stringify({ action: 'track', idToken: token, event: payload });
        return fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            keepalive: body.length < 60000
        });
    }

    async function track(action, data = {}) {
        try {
            await post(basePayload(action, data));
        } catch {
            // 统计失败不影响网站功能；本地静态预览没有 /api/analytics 时会走到这里
        }
    }

    window.Analytics = { track };

    function trackPageView() {
        track('page_view');
    }

    if (typeof window.onAuthReady === 'function') {
        onAuthReady(() => trackPageView());
    } else if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', trackPageView, { once: true });
    } else {
        trackPageView();
    }
})();
