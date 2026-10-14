/* Operational counters only. No identifiers, free text, or research events. */
(function (root) {
    const agents = Object.freeze({ ...root.AnalyticsPolicy.agents,
        'research-funnel':'研究问题教练', 'research-reading-card':'文献研读伙伴',
        'research-design':'研究设计顾问', 'research-instrument':'研究工具工坊' });
    const cases = root.AnalyticsPolicy.cases;
    const pages = Object.freeze({index:'site',agents:'agents',research:'research',workspace:'workspace',
        multimodal:'multimodal','media-player':'multimodal','classroom-tools':'classroom',tools:'tools',
        prompts:'prompts',paths:'paths',articles:'articles',article:'articles',resources:'resources',news:'news'});
    const browserActions = ['page_view','agent_open','workbook_view','workbook_open','multimodal_case_open','multimodal_video_open','multimodal_audio_play'];
    function normalize(raw = {}, trusted = false) {
        if (!raw || typeof raw !== 'object') throw new Error('统计格式无效');
        const allowed = trusted ? [...browserActions,'agent_run','generation_failed','workbook_save'] : browserActions;
        if (!allowed.includes(raw.action)) throw new Error('不支持的运营计数');
        const action = raw.action;
        let feature, targetId = '';
        if (action === 'page_view') {
            const page = String(raw.path || raw.targetId || '').split(/[?#]/)[0].replace(/^\/+|\/+$/g,'').replace(/\.html$/,'') || 'index';
            if (!Object.hasOwn(pages,page)) throw new Error('不统计此页面');
            feature = pages[page]; targetId = page;
        } else if (action.startsWith('multimodal_')) {
            if (!Object.hasOwn(cases,raw.targetId)) throw new Error('案例不存在');
            feature = 'multimodal'; targetId = raw.targetId;
        } else if (['agent_open','agent_run','generation_failed'].includes(action)) {
            if (!Object.hasOwn(agents,raw.targetId)) throw new Error('智能体不存在');
            targetId = raw.targetId; feature = targetId.startsWith('research-') ? 'research' : 'agents';
        } else {
            feature = 'workspace';
            if (action === 'workbook_save' && Object.hasOwn(agents,raw.targetId)) targetId = raw.targetId;
        }
        const ms = raw.meta?.durationMs;
        const durationMs = action === 'agent_run' && Number.isInteger(ms) && ms >= 0 && ms <= 600000 ? ms : 0;
        return {action,feature,targetId,durationMs};
    }
    root.OperationsPolicy = Object.freeze({normalize,agents,cases,pages});
})(globalThis);
