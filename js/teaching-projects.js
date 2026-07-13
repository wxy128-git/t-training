/* ===================================================================
   教学项目与本地草稿
   - 只保存在当前设备，不上传输入/输出正文
   - 按登录用户隔离；用于跨智能体复用教学背景与意外恢复
   =================================================================== */
(function () {
    const PREFIX = 'xylaoshiTeachingV1';
    const MAX_DRAFTS = 8;
    const MAX_RESULT_LENGTH = 80000;

    function currentUid() {
        try {
            const user = window.Auth?.getCurrentUser?.() || window._currentUser;
            return String(user?.uid || 'guest').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128) || 'guest';
        } catch {
            return 'guest';
        }
    }

    function storageKey(kind) {
        return `${PREFIX}:${kind}:${currentUid()}`;
    }

    function read(kind, fallback) {
        try {
            const raw = localStorage.getItem(storageKey(kind));
            return raw ? JSON.parse(raw) : fallback;
        } catch {
            return fallback;
        }
    }

    function write(kind, value) {
        try {
            localStorage.setItem(storageKey(kind), JSON.stringify(value));
            return true;
        } catch {
            return false;
        }
    }

    function clean(value, max = 240) {
        return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
    }

    function cleanMultiline(value, max = 1200) {
        return String(value || '').replace(/\r/g, '').trim().slice(0, max);
    }

    function makeId() {
        if (window.crypto?.randomUUID) return `project_${crypto.randomUUID()}`;
        return `project_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
    }

    function normalizeProject(raw = {}) {
        const now = new Date().toISOString();
        const project = {
            id: clean(raw.id, 128) || makeId(),
            title: clean(raw.title, 80),
            subject: clean(raw.subject, 30),
            grade: clean(raw.grade, 30),
            textbook: clean(raw.textbook, 80),
            topic: clean(raw.topic, 120),
            classSize: clean(raw.classSize, 8),
            classProfile: cleanMultiline(raw.classProfile, 600),
            goal: cleanMultiline(raw.goal, 600),
            createdAt: raw.createdAt || now,
            updatedAt: now
        };
        if (!project.title) {
            project.title = [project.grade, project.subject, project.topic].filter(Boolean).join(' · ') || '未命名教学项目';
        }
        return project;
    }

    function getActiveProject() {
        const project = read('active-project', null);
        return project?.id ? project : null;
    }

    function setActiveProject(raw) {
        const project = normalizeProject(raw);
        write('active-project', project);
        return project;
    }

    function clearActiveProject() {
        try { localStorage.removeItem(storageKey('active-project')); } catch {}
    }

    function getProfile() {
        return read('profile', {}) || {};
    }

    function saveProfile(raw = {}) {
        const profile = {
            subject: clean(raw.subject, 30),
            grade: clean(raw.grade, 30),
            textbook: clean(raw.textbook, 80),
            classSize: clean(raw.classSize, 8),
            classProfile: cleanMultiline(raw.classProfile, 600),
            updatedAt: new Date().toISOString()
        };
        write('profile', profile);
        return profile;
    }

    function getDraft(agentId) {
        const drafts = read('agent-drafts', {});
        const projectId = getActiveProject()?.id || 'unassigned';
        return drafts?.[`${projectId}::${agentId}`]
            || Object.values(drafts || {}).find(item => item?.agentId === agentId && (item.projectId || 'unassigned') === projectId)
            || null;
    }

    function saveDraft(agentId, raw = {}) {
        if (!agentId) return false;
        const drafts = read('agent-drafts', {}) || {};
        const projectId = raw.projectId || 'unassigned';
        const key = `${projectId}::${agentId}`;
        const previous = drafts[key] || {};
        drafts[key] = {
            ...previous,
            ...raw,
            agentId,
            result: String(raw.result === undefined ? (previous.result || '') : raw.result).slice(0, MAX_RESULT_LENGTH),
            updatedAt: new Date().toISOString()
        };
        const trimmed = Object.fromEntries(Object.entries(drafts)
            .sort((a, b) => String(b[1]?.updatedAt || '').localeCompare(String(a[1]?.updatedAt || '')))
            .slice(0, MAX_DRAFTS));
        return write('agent-drafts', trimmed);
    }

    function clearDraft(agentId) {
        const drafts = read('agent-drafts', {}) || {};
        const projectId = getActiveProject()?.id || 'unassigned';
        const key = `${projectId}::${agentId}`;
        if (drafts[key]) delete drafts[key];
        Object.keys(drafts).forEach(itemKey => {
            if (drafts[itemKey]?.agentId === agentId && (drafts[itemKey]?.projectId || 'unassigned') === projectId) delete drafts[itemKey];
        });
        write('agent-drafts', drafts);
    }

    function listDrafts() {
        return Object.values(read('agent-drafts', {}) || {})
            .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    }

    function contextLines(project = getActiveProject()) {
        if (!project) return [];
        const rows = [
            ['教学项目', project.title],
            ['学科', project.subject],
            ['年级', project.grade],
            ['教材版本', project.textbook],
            ['当前课题或单元', project.topic],
            ['班级人数', project.classSize ? `约 ${project.classSize} 人` : ''],
            ['学情概况', project.classProfile],
            ['本次目标', project.goal]
        ];
        return rows.filter(([, value]) => value).map(([label, value]) => `【${label}】${value}`);
    }

    window.TeachingProjects = {
        currentUid,
        getActiveProject,
        setActiveProject,
        clearActiveProject,
        getProfile,
        saveProfile,
        getDraft,
        saveDraft,
        clearDraft,
        listDrafts,
        contextLines
    };
})();
