'use strict';

(function () {
    const DEFINITIONS = Object.freeze({
        home: Object.freeze({
            id: 'home',
            label: '首页',
            path: '/',
            fields: Object.freeze([
                { key: 'heroEyebrow', label: '首屏眉题', maxLength: 40, defaultValue: '教师 AI 教学实践平台' },
                { key: 'heroTitle', label: '首屏标题', maxLength: 50, defaultValue: '让 AI 真正走进你的课堂' },
                { key: 'heroAccent', label: '标题强调词', maxLength: 12, defaultValue: 'AI', help: '必须是首屏标题中出现的文字。' },
                { key: 'heroIntro', label: '首屏简介', maxLength: 140, rows: 3, defaultValue: '从真实教学任务出发，填写背景并获得可编辑初稿；重要事实与课堂适配由教师核验。' },
                { key: 'primaryAction', label: '主要按钮', maxLength: 24, defaultValue: '选择教学任务' },
                { key: 'workbookActionGuest', label: '备课本按钮（未登录）', maxLength: 24, defaultValue: '打开我的备课本' },
                { key: 'workbookActionMember', label: '备课本按钮（已登录）', maxLength: 24, defaultValue: '继续我的备课' },
                { key: 'taskHeading', label: '任务区标题', maxLength: 40, defaultValue: '今天要完成什么？' },
                { key: 'checklistHeading', label: '核验区标题', maxLength: 30, defaultValue: '使用前核验' },
                { key: 'checklistAction', label: '核验区展开文字', maxLength: 20, defaultValue: '查看 4 项' },
                { key: 'resourcesHeading', label: '资源区标题', maxLength: 40, defaultValue: '学习与配套资源' }
            ])
        }),
        multimodal: Object.freeze({
            id: 'multimodal',
            label: '多模态工作坊',
            path: '/multimodal',
            fields: Object.freeze([
                { key: 'heroKicker', label: '首屏眉题', maxLength: 40, defaultValue: '教学素材生成案例' },
                { key: 'heroTitle', label: '首屏标题', maxLength: 50, defaultValue: '多模态工作坊' },
                { key: 'heroAccent', label: '标题强调词', maxLength: 12, defaultValue: '工作坊', help: '必须是首屏标题中出现的文字。' },
                { key: 'heroIntro', label: '首屏简介', maxLength: 120, rows: 3, defaultValue: '查看教学素材成品、生成步骤与可复制提示词。' },
                { key: 'heroNote', label: '功能说明', maxLength: 80, defaultValue: '案例解析，不在站内生成' },
                { key: 'primaryAction', label: '主要按钮', maxLength: 24, defaultValue: '查看案例' },
                { key: 'secondaryAction', label: '次要按钮', maxLength: 24, defaultValue: '找生成工具' },
                { key: 'featureKicker', label: '主案例眉题', maxLength: 40, defaultValue: '本期案例 · 语文' },
                { key: 'featureTitle', label: '主案例标题', maxLength: 50, defaultValue: '古诗意境导入图' },
                { key: 'featureAction', label: '主案例操作文字', maxLength: 40, defaultValue: '查看成品、步骤与提示词' }
            ])
        }),
        agents: Object.freeze({
            id: 'agents', label: '智能体空间', path: '/agents',
            fields: Object.freeze([
                { key: 'heroKicker', label: '首屏眉题', maxLength: 40, defaultValue: '你的数字教研团队' },
                { key: 'heroTitle', label: '首屏标题', maxLength: 50, defaultValue: '和一位懂教学的数字成员一起工作' },
                { key: 'heroIntro', label: '首屏简介', maxLength: 120, rows: 3, defaultValue: '他们分工明确，会先了解你的教学任务，再和你一起完成初稿、核验与整理。' },
                { key: 'rosterHeading', label: '成员在席标题', maxLength: 20, defaultValue: '今日在席' },
                { key: 'rosterStatus', label: '成员在席状态', maxLength: 30, defaultValue: '19 / 19 可协作' },
                { key: 'searchPlaceholder', label: '搜索框提示', maxLength: 60, defaultValue: '描述任务，如「设计一场小组活动」' },
                { key: 'allFilter', label: '全部筛选', maxLength: 16, defaultValue: '全部' },
                { key: 'recommendedHeading', label: '推荐分区标题', maxLength: 24, defaultValue: '推荐成员' },
                { key: 'recommendedBadge', label: '推荐成员标识', maxLength: 16, defaultValue: '建议起点' },
                { key: 'popularBadge', label: '常用成员标识', maxLength: 16, defaultValue: '常用' },
                { key: 'memberBadge', label: '成员身份标识', maxLength: 20, defaultValue: 'AI 智能体' },
                { key: 'memberGreetingPrefix', label: '成员开场白前缀', maxLength: 30, defaultValue: '我可以和你一起完成' },
                { key: 'memberAction', label: '成员操作文字', maxLength: 20, defaultValue: '开始协作' },
                { key: 'memberCountUnit', label: '成员数量单位', maxLength: 20, defaultValue: '位数字成员' },
                { key: 'emptyMessage', label: '搜索无结果提示', maxLength: 80, defaultValue: '没有匹配的智能体，换个关键词试试' }
            ])
        }),
        classroom: Object.freeze({
            id: 'classroom', label: '课堂工具', path: '/classroom-tools',
            fields: Object.freeze([
                { key: 'heroKicker', label: '首屏眉题', maxLength: 40, defaultValue: '课堂互动工具' },
                { key: 'heroTitle', label: '首屏标题', maxLength: 50, defaultValue: '课堂工具' },
                { key: 'heroAccent', label: '标题强调词', maxLength: 12, defaultValue: '课堂', help: '必须是首屏标题中出现的文字。' },
                { key: 'heroIntro', label: '首屏简介', maxLength: 120, rows: 3, defaultValue: '无需安装，打开即可使用；数据保存在本机。' },
                { key: 'countdownName', label: '倒计时名称', maxLength: 30, defaultValue: '倒计时' },
                { key: 'countdownDesc', label: '倒计时说明', maxLength: 80, defaultValue: '为活动、小测或思考设置时间。' },
                { key: 'pickerName', label: '随机点名名称', maxLength: 30, defaultValue: '随机点名' },
                { key: 'pickerDesc', label: '随机点名说明', maxLength: 80, defaultValue: '随机抽取学生，可避免重复点名。' },
                { key: 'scoreName', label: '计分板名称', maxLength: 30, defaultValue: '小组计分板' },
                { key: 'scoreDesc', label: '计分板说明', maxLength: 80, defaultValue: '实时加减分并突出领先小组。' },
                { key: 'ballsName', label: '音量监测名称', maxLength: 30, defaultValue: '音量监测' },
                { key: 'ballsDesc', label: '音量监测说明', maxLength: 80, defaultValue: '用动态画面反馈课堂音量。' },
                { key: 'groupsName', label: '随机分组名称', maxLength: 30, defaultValue: '随机分组' },
                { key: 'groupsDesc', label: '随机分组说明', maxLength: 80, defaultValue: '按组数或人数随机分组。' },
                { key: 'seatingName', label: '座位表名称', maxLength: 30, defaultValue: '座位表' },
                { key: 'seatingDesc', label: '座位表说明', maxLength: 80, defaultValue: '生成、调整并打印座位表。' },
                { key: 'whiteboardName', label: '白板名称', maxLength: 30, defaultValue: '简易白板' },
                { key: 'whiteboardDesc', label: '白板说明', maxLength: 80, defaultValue: '课堂批注、板书并保存图片。' },
                { key: 'rubricName', label: '评价量规名称', maxLength: 30, defaultValue: '评价量规' },
                { key: 'rubricDesc', label: '评价量规说明', maxLength: 80, defaultValue: '编辑评价维度与等级，支持打印。' },
                { key: 'routineName', label: '活动模板名称', maxLength: 30, defaultValue: '课堂活动模板' },
                { key: 'routineDesc', label: '活动模板说明', maxLength: 80, defaultValue: '使用 KWL、3-2-1 等课堂活动模板。' },
                { key: 'backAction', label: '返回按钮', maxLength: 24, defaultValue: '返回工具列表' },
                { key: 'presentationAction', label: '演示按钮', maxLength: 24, defaultValue: '演示模式' },
                { key: 'presentationExitAction', label: '退出演示按钮', maxLength: 24, defaultValue: '退出演示' },
                { key: 'presentationNote', label: '演示模式说明', maxLength: 100, rows: 2, defaultValue: '演示模式会隐藏站点导航；再次点击即可退出。' }
            ])
        }),
        tools: Object.freeze({
            id: 'tools', label: 'AI 资源精选', path: '/tools',
            fields: Object.freeze([
                { key: 'heroKicker', label: '首屏眉题', maxLength: 40, defaultValue: '教师 AI 工具' },
                { key: 'heroTitle', label: '首屏标题', maxLength: 50, defaultValue: 'AI 资源精选' },
                { key: 'heroAccent', label: '标题强调词', maxLength: 12, defaultValue: '精选', help: '必须是首屏标题中出现的文字。' },
                { key: 'heroIntro', label: '首屏简介', maxLength: 120, rows: 3, defaultValue: '按教学任务筛选常用第三方 AI 工具。' },
                { key: 'sealText', label: '标题印章', maxLength: 12, defaultValue: '甄选' },
                { key: 'searchHeading', label: '搜索区标题', maxLength: 24, defaultValue: '快速查找' },
                { key: 'searchPlaceholder', label: '搜索框提示', maxLength: 60, defaultValue: '搜索工具名称、用途或标签…' },
                { key: 'taskFilterHeading', label: '任务筛选标题', maxLength: 16, defaultValue: '任务' },
                { key: 'conditionFilterHeading', label: '条件筛选标题', maxLength: 16, defaultValue: '条件' },
                { key: 'allFilter', label: '全部任务筛选', maxLength: 16, defaultValue: '全部' },
                { key: 'allConditions', label: '全部条件筛选', maxLength: 20, defaultValue: '全部条件' },
                { key: 'reviewNote', label: '信息核验说明', maxLength: 160, rows: 3, defaultValue: '信息核对于 2026 年 8 月，请以官网为准。不要上传学生姓名、联系方式或成绩明细。' },
                { key: 'emptyTitle', label: '无结果标题', maxLength: 40, defaultValue: '没有找到匹配的工具' },
                { key: 'emptyHint', label: '无结果提示', maxLength: 50, defaultValue: '换个关键词试试' }
            ])
        }),
        resources: Object.freeze({
            id: 'resources', label: '课件素材', path: '/resources',
            fields: Object.freeze([
                { key: 'heroKicker', label: '首屏眉题', maxLength: 40, defaultValue: '素材入口' },
                { key: 'heroTitle', label: '首屏标题', maxLength: 50, defaultValue: '课件素材' },
                { key: 'heroAccent', label: '标题强调词', maxLength: 12, defaultValue: '素材', help: '必须是首屏标题中出现的文字。' },
                { key: 'heroIntro', label: '首屏简介', maxLength: 120, rows: 3, defaultValue: '搜索图片、图标、免抠素材与生成平台。' },
                { key: 'searchPlaceholder', label: '搜索框提示', maxLength: 60, defaultValue: '搜索资源名称或描述…' },
                { key: 'emptyMessage', label: '无结果提示', maxLength: 80, defaultValue: '没有找到相关资源，换个关键词试试' }
            ])
        }),
        news: Object.freeze({
            id: 'news', label: 'AI 资讯', path: '/news',
            fields: Object.freeze([
                { key: 'heroKicker', label: '首屏眉题', maxLength: 40, defaultValue: '教育与 AI 动态' },
                { key: 'heroTitle', label: '首屏标题', maxLength: 50, defaultValue: 'AI 资讯' },
                { key: 'heroAccent', label: '标题强调词', maxLength: 12, defaultValue: '资讯', help: '必须是首屏标题中出现的文字。' },
                { key: 'heroIntro', label: '首屏简介', maxLength: 100, rows: 2, defaultValue: '点击标题阅读媒体原文。' },
                { key: 'refreshAction', label: '刷新按钮', maxLength: 20, defaultValue: '刷新' },
                { key: 'sourceNote', label: '来源说明', maxLength: 100, defaultValue: '内容来自第三方媒体，以原文语言呈现' }
            ])
        }),
        paths: Object.freeze({
            id: 'paths', label: '学习路径', path: '/paths',
            fields: Object.freeze([
                { key: 'heroKicker', label: '首屏眉题', maxLength: 40, defaultValue: '按步骤学习' },
                { key: 'heroTitle', label: '首屏标题', maxLength: 50, defaultValue: '学习路径' },
                { key: 'heroAccent', label: '标题强调词', maxLength: 12, defaultValue: '学习', help: '必须是首屏标题中出现的文字。' },
                { key: 'heroIntro', label: '首屏简介', maxLength: 120, rows: 3, defaultValue: '选择起点，逐步完成；登录后记录进度。' },
                { key: 'continueKicker', label: '继续学习眉题', maxLength: 30, defaultValue: '继续学习' },
                { key: 'stepsHeading', label: '步骤区标题', maxLength: 24, defaultValue: '学习步骤' },
                { key: 'guestProgress', label: '未登录进度提示', maxLength: 24, defaultValue: '登录后记录' },
                { key: 'completeAction', label: '完成步骤按钮', maxLength: 24, defaultValue: '标记为已完成' }
            ])
        }),
        articles: Object.freeze({
            id: 'articles', label: '精选文章', path: '/articles',
            fields: Object.freeze([
                { key: 'heroKicker', label: '首屏眉题', maxLength: 40, defaultValue: '教学实践阅读' },
                { key: 'heroTitle', label: '首屏标题', maxLength: 50, defaultValue: '精选文章' },
                { key: 'heroAccent', label: '标题强调词', maxLength: 12, defaultValue: '文章', help: '必须是首屏标题中出现的文字。' },
                { key: 'heroIntro', label: '首屏简介', maxLength: 100, rows: 2, defaultValue: '学习方法、工具与教学实践。' },
                { key: 'filterAll', label: '全部筛选', maxLength: 16, defaultValue: '全部' },
                { key: 'filterLearning', label: '学习指南筛选', maxLength: 20, defaultValue: '学习指南' },
                { key: 'filterTools', label: '工具推荐筛选', maxLength: 20, defaultValue: '工具推荐' },
                { key: 'filterCase', label: '教学案例筛选', maxLength: 20, defaultValue: '教学案例' },
                { key: 'filterTips', label: '实战技巧筛选', maxLength: 20, defaultValue: '实战技巧' },
                { key: 'filterNews', label: '行业动态筛选', maxLength: 20, defaultValue: '行业动态' },
                { key: 'emptyTitle', label: '空列表标题', maxLength: 30, defaultValue: '暂无文章' },
                { key: 'emptyHint', label: '空列表提示', maxLength: 40, defaultValue: '敬请期待更多内容' }
            ])
        }),
        article: Object.freeze({
            id: 'article', label: '文章详情', path: '/article?id=tip-classroom-profile',
            fields: Object.freeze([
                { key: 'breadcrumbLabel', label: '面包屑默认标题', maxLength: 24, defaultValue: '文章详情' },
                { key: 'backShortAction', label: '头部返回按钮', maxLength: 24, defaultValue: '返回列表' },
                { key: 'backAction', label: '底部返回按钮', maxLength: 30, defaultValue: '返回文章列表' },
                { key: 'copyAction', label: '复制链接按钮', maxLength: 24, defaultValue: '复制链接' },
                { key: 'externalAction', label: '阅读原文按钮', maxLength: 24, defaultValue: '阅读原文' }
            ])
        }),
        prompts: Object.freeze({
            id: 'prompts', label: '提示词库', path: '/prompts',
            fields: Object.freeze([
                { key: 'heroKicker', label: '首屏眉题', maxLength: 40, defaultValue: '教学提示词' },
                { key: 'heroTitle', label: '首屏标题', maxLength: 50, defaultValue: '即用提示词' },
                { key: 'heroAccent', label: '标题强调词', maxLength: 12, defaultValue: '提示词', help: '必须是首屏标题中出现的文字。' },
                { key: 'heroIntroPrefix', label: '首屏简介前半句', maxLength: 40, defaultValue: '替换' },
                { key: 'heroIntroSuffix', label: '首屏简介后半句', maxLength: 60, defaultValue: '中的内容后复制使用。' },
                { key: 'officialTab', label: '官方模板标签', maxLength: 20, defaultValue: '官方模板' },
                { key: 'communityTab', label: '社区分享标签', maxLength: 20, defaultValue: '社区分享' },
                { key: 'submitAction', label: '投稿按钮', maxLength: 24, defaultValue: '投稿提示词' },
                { key: 'pendingNotice', label: '待审核提示', maxLength: 100, rows: 2, defaultValue: '您有待审核的提示词，管理员审核通过后将公开展示。' },
                { key: 'copyAction', label: '复制按钮', maxLength: 16, defaultValue: '复制' },
                { key: 'emptyTitle', label: '社区空列表标题', maxLength: 40, defaultValue: '社区提示词库还是空的' },
                { key: 'emptyHint', label: '社区空列表提示', maxLength: 50, defaultValue: '成为第一个投稿的教师吧！' }
            ])
        }),
        workspace: Object.freeze({
            id: 'workspace', label: '我的备课本', path: '/workspace',
            fields: Object.freeze([
                { key: 'heroKicker', label: '首屏眉题', maxLength: 40, defaultValue: '教学成果管理' },
                { key: 'heroTitle', label: '首屏标题', maxLength: 50, defaultValue: '我的备课本' },
                { key: 'heroAccent', label: '标题强调词', maxLength: 12, defaultValue: '备课本', help: '必须是首屏标题中出现的文字。' },
                { key: 'heroIntro', label: '首屏简介', maxLength: 100, rows: 2, defaultValue: '查看、筛选和导出智能体成果。' },
                { key: 'metricAll', label: '统计：全部内容', maxLength: 20, defaultValue: '全部内容' },
                { key: 'metricDraft', label: '统计：生成文稿', maxLength: 20, defaultValue: '生成文稿' },
                { key: 'metricChat', label: '统计：对话记录', maxLength: 20, defaultValue: '对话记录' },
                { key: 'metricReviewed', label: '统计：完成核验', maxLength: 20, defaultValue: '完成核验' },
                { key: 'binderLabel', label: '书脊标签', maxLength: 30, defaultValue: '教学成果备课夹' },
                { key: 'directoryKicker', label: '目录英文眉题', maxLength: 30, defaultValue: 'TEACHING WORKBOOK' },
                { key: 'directoryTitle', label: '目录标题', maxLength: 24, defaultValue: '成果目录' },
                { key: 'searchPlaceholder', label: '搜索框提示', maxLength: 60, defaultValue: '查找课题、项目或智能体' },
                { key: 'sortLabel', label: '排序标题', maxLength: 16, defaultValue: '目录排序' },
                { key: 'loginPrompt', label: '登录提示', maxLength: 60, defaultValue: '登录后即可查看你保存的备课内容' },
                { key: 'loginAction', label: '登录按钮', maxLength: 20, defaultValue: '登录 / 注册' },
                { key: 'filterAll', label: '全部筛选', maxLength: 16, defaultValue: '全部' },
                { key: 'filterDraft', label: '文稿筛选', maxLength: 20, defaultValue: '生成文稿' },
                { key: 'filterChat', label: '对话筛选', maxLength: 20, defaultValue: '对话记录' },
                { key: 'filterReviewed', label: '核验筛选', maxLength: 20, defaultValue: '完成核验' },
                { key: 'projectFilterAll', label: '全部项目筛选', maxLength: 24, defaultValue: '全部教学项目' },
                { key: 'agentFilterAll', label: '全部智能体筛选', maxLength: 24, defaultValue: '全部智能体' },
                { key: 'sortUpdated', label: '排序：最近更新', maxLength: 20, defaultValue: '最近更新' },
                { key: 'sortCreated', label: '排序：最近保存', maxLength: 20, defaultValue: '最近保存' },
                { key: 'sortProject', label: '排序：教学项目', maxLength: 20, defaultValue: '按教学项目' },
                { key: 'sortTitle', label: '排序：标题', maxLength: 20, defaultValue: '标题 A-Z' },
                { key: 'sortAgent', label: '排序：智能体', maxLength: 20, defaultValue: '智能体名称' },
                { key: 'columnPage', label: '目录列：页码', maxLength: 12, defaultValue: '页码' },
                { key: 'columnWork', label: '目录列：课题来源', maxLength: 20, defaultValue: '课题 / 来源' },
                { key: 'columnState', label: '目录列：状态', maxLength: 12, defaultValue: '状态' },
                { key: 'columnUpdated', label: '目录列：更新', maxLength: 12, defaultValue: '更新' },
                { key: 'moreActions', label: '更多操作', maxLength: 16, defaultValue: '更多操作' },
                { key: 'clearFilters', label: '清除筛选按钮', maxLength: 20, defaultValue: '清除筛选' },
                { key: 'emptyTitle', label: '空备课本标题', maxLength: 30, defaultValue: '备课本还是空的' },
                { key: 'emptyHint', label: '空备课本提示', maxLength: 80, defaultValue: '在智能体空间保存成果后会显示在这里。' }
            ])
        })
    });

    function getDefinition(pageId) {
        return DEFINITIONS[pageId] || null;
    }

    function defaults(pageId) {
        const definition = getDefinition(pageId);
        if (!definition) return {};
        return Object.fromEntries(definition.fields.map(field => [field.key, field.defaultValue]));
    }

    function normalize(pageId, source) {
        const definition = getDefinition(pageId);
        if (!definition) return {};
        const raw = source && typeof source === 'object' && source.fields && typeof source.fields === 'object'
            ? source.fields
            : (source || {});
        return Object.fromEntries(definition.fields.map(field => {
            const candidate = typeof raw[field.key] === 'string' ? raw[field.key].trim() : '';
            const value = candidate && candidate.length <= field.maxLength ? candidate : field.defaultValue;
            return [field.key, value];
        }));
    }

    function validate(pageId, values) {
        const definition = getDefinition(pageId);
        if (!definition) return { ok: false, message: '不支持的页面' };
        for (const field of definition.fields) {
            const value = typeof values?.[field.key] === 'string' ? values[field.key].trim() : '';
            if (!value) return { ok: false, key: field.key, message: `请填写${field.label}` };
            if (value.length > field.maxLength) return { ok: false, key: field.key, message: `${field.label}不能超过 ${field.maxLength} 个字符` };
        }
        const normalized = normalize(pageId, values);
        if (normalized.heroAccent && normalized.heroTitle && !normalized.heroTitle.includes(normalized.heroAccent)) {
            return { ok: false, key: 'heroAccent', message: '标题强调词必须出现在首屏标题中' };
        }
        return { ok: true, values: normalized };
    }

    async function load(pageId) {
        const fallback = defaults(pageId);
        if (!getDefinition(pageId) || typeof DB === 'undefined' || !DB?.getPageCopy) return fallback;
        try {
            const remote = await DB.getPageCopy(pageId);
            return remote ? normalize(pageId, remote) : fallback;
        } catch (error) {
            console.warn('SiteCopy.load:', error?.message || error);
            return fallback;
        }
    }

    function renderHeadline(element, title, accent) {
        if (!element) return;
        element.replaceChildren();
        if (!accent || !title.includes(accent)) {
            element.textContent = title;
            return;
        }
        const index = title.indexOf(accent);
        element.append(document.createTextNode(title.slice(0, index)));
        const mark = document.createElement('span');
        mark.className = 'site-copy-accent';
        mark.textContent = accent;
        element.append(mark, document.createTextNode(title.slice(index + accent.length)));
    }

    function applyToDocument(pageId, source, root = document) {
        const values = normalize(pageId, source);
        root.querySelectorAll('[data-site-copy]').forEach(element => {
            const key = element.dataset.siteCopy;
            if (Object.prototype.hasOwnProperty.call(values, key)) element.textContent = values[key];
        });
        root.querySelectorAll('[data-site-copy-placeholder]').forEach(element => {
            const key = element.dataset.siteCopyPlaceholder;
            if (Object.prototype.hasOwnProperty.call(values, key)) element.setAttribute('placeholder', values[key]);
        });
        root.querySelectorAll('[data-site-copy-headline]').forEach(element => {
            const title = values[element.dataset.siteCopyHeadline] || '';
            const accent = values[element.dataset.siteCopyAccent] || '';
            renderHeadline(element, title, accent);
        });
        return values;
    }

    window.SiteCopy = Object.freeze({
        definitions: DEFINITIONS,
        getDefinition,
        defaults,
        normalize,
        validate,
        load,
        applyToDocument
    });
})();
