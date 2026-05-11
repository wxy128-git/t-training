/* ===== 默认数据（Firestore 为空时的兜底） ===== */
const DEFAULT_TOOLS = [
    { id:'t1', name:"PrompterHub", desc:"把想法转化成完美提示词的社区平台", url:"https://www.prompterhub.cn/home", icon:"ph-pencil", color:"text-blue-500", bg:"bg-blue-50", category:"teaching" },
    { id:'t2', name:"Prompt123", desc:"完全免费的中文AI提示词宝库", url:"https://prompt123.cn", icon:"ph-pen", color:"text-pink-500", bg:"bg-pink-50", category:"teaching" },
    { id:'t3', name:"AI好记", desc:"分析优质公开课，智能总结课程精华", url:"https://aihaoji.com/zh?utm_source=invite&utm_content=MCHihFWN", icon:"ph-notebook", color:"text-blue-600", bg:"bg-blue-50", category:"teaching" },
    { id:'t4', name:"快出题", desc:"智能生成试题，快速组卷的教学助手", url:"https://kuaichuti.net/", icon:"ph-exam", color:"text-emerald-500", bg:"bg-emerald-50", category:"teaching" },
    { id:'t5', name:"棒棒糖AI听评课", desc:"辅助教研、听课、评课、议课全流程", url:"https://bbt.etah-tech.com/publish/login?key=5SiCv0QgJ40=", icon:"ph-chats-circle", color:"text-pink-500", bg:"bg-pink-50", category:"teaching" },
    { id:'t6', name:"飞象老师", desc:"快速生成高质量教学动画", url:"https://www.feixianglaoshi.com/", icon:"ph-film-strip", color:"text-cyan-500", bg:"bg-cyan-50", category:"teaching" },
    { id:'t7', name:"Gamma", desc:"一键生成PPT，视觉效果出色", url:"https://gamma.app/signup?r=qelbuujfixnt8t6", icon:"ph-presentation-chart", color:"text-orange-500", bg:"bg-orange-50", category:"creation" },
    { id:'t8', name:"anygen.io", desc:"创作系列图，适配绘本、课件等场景", url:"https://www.anygen.io/home?invitation_code=4UQOT4NA0EBPFWS", icon:"ph-pencil-circle", color:"text-orange-400", bg:"bg-orange-50", category:"creation" },
    { id:'t9', name:"海绵音乐", desc:"输入灵感，快速生成高质量歌曲", url:"https://www.haimian.com/", icon:"ph-music-notes", color:"text-rose-500", bg:"bg-rose-50", category:"creation" },
    { id:'t10', name:"即梦AI", desc:"生成式AI，支持生成数字人视频", url:"https://jimeng.jianying.com/ai-tool/home/", icon:"ph-magic-wand", color:"text-violet-500", bg:"bg-violet-50", category:"creation" },
    { id:'t11', name:"Nano Banana", desc:"功能强大的图片生成工具（Gemini）", url:"https://gemini.google.com/app?hl=zh-cn", icon:"ph-image", color:"text-purple-500", bg:"bg-purple-50", category:"creation" },
    { id:'t12', name:"飞影数字人", desc:"专业的数字人视频制作平台", url:"https://hifly.cc/i/GXyeDnoyGPc", icon:"ph-user-focus", color:"text-sky-500", bg:"bg-sky-50", category:"creation" },
    { id:'t13', name:"秘塔搜索", desc:"辅助建立知识库的专题研究工具", url:"https://metaso.cn/", icon:"ph-magnifying-glass", color:"text-teal-500", bg:"bg-teal-50", category:"search" },
    { id:'t14', name:"Coze", desc:"新一代一站式AI Bot开发平台", url:"https://www.coze.cn/studio?invite_code=260ab871053241e8a2730bb5dff7f662", icon:"ph-robot", color:"text-indigo-500", bg:"bg-indigo-50", category:"dev" }
];

const DEFAULT_PROMPTS = [
    { id:'p1', label:"备课助手", icon:"ph-book-open-text", color:"text-blue-500", bg:"bg-blue-50", category:"teaching", text:"你是一位经验丰富的[学科]教师，请为[年级]学生设计一节关于「[主题]」的完整教案，包括：①教学目标（知识、能力、情感三维）②教学重难点 ③教学流程（40分钟，含导入-新授-练习-小结）④板书设计 ⑤作业布置。要求贴近学生实际，体现新课程理念。" },
    { id:'p2', label:"智能出题", icon:"ph-exam", color:"text-emerald-500", bg:"bg-emerald-50", category:"teaching", text:"请为[年级][学科]「[知识点]」出[数量]道[题型]题，要求：①难度分布：基础题[X]道、提高题[X]道、拓展题[X]道 ②每道题附参考答案和解题思路 ③题目情境联系生活实际，避免纯机械记忆。" },
    { id:'p3', label:"学生评语", icon:"ph-star", color:"text-yellow-500", bg:"bg-yellow-50", category:"teaching", text:"请为以下学生生成一段温暖、个性化的期末评语（100-150字）：姓名：[姓名]，性格特点：[特点]，学习优势：[优点]，待改进之处：[不足]，本学期印象深刻的事：[事件]。要求积极正面，给予期待与鼓励。" },
    { id:'p4', label:"课堂提问", icon:"ph-question", color:"text-purple-500", bg:"bg-purple-50", category:"teaching", text:"请围绕「[课文/主题]」为[年级]学生设计6个由浅入深的课堂提问，要求：①前2题：基础理解层（What）②中2题：分析应用层（Why/How）③后2题：评价创造层（引发思考与讨论）。每题附提问目的和预期学生反应。" },
    { id:'p5', label:"作业设计", icon:"ph-pencil-line", color:"text-rose-500", bg:"bg-rose-50", category:"teaching", text:"请为学完[学科][内容]的[年级]学生设计一项有创意的课后作业，要求：①趣味性强，避免机械练习 ②可操作性强，预计完成时间不超过[X]分钟 ③体现跨学科融合或生活应用 ④附评价标准（优秀/良好/合格三个等级描述）。" },
    { id:'p6', label:"差异化教学", icon:"ph-users-three", color:"text-indigo-500", bg:"bg-indigo-50", category:"advanced", text:"针对[学科][知识点]，请为三类不同水平的学生分别设计学习方案：①学困生：降低难度、提供支架式指导 ②中等生：夯实基础、适当提升 ③优等生：拓展延伸、开放性探究。每类方案包括学习目标、学习活动和评价方式。" },
    { id:'p7', label:"课文分析", icon:"ph-article", color:"text-teal-500", bg:"bg-teal-50", category:"advanced", text:"请对「[课文名称]」进行深度教学分析，包括：①主题思想与情感基调 ②写作特色与艺术手法 ③重点词句赏析（列举3-5处）④教学价值与育人意义 ⑤本文在[年级]教材体系中的地位与作用。" },
    { id:'p8', label:"家长沟通", icon:"ph-chats", color:"text-cyan-500", bg:"bg-cyan-50", category:"communication", text:"请帮我起草一段与家长沟通的消息，主题：[沟通主题]。学生情况：[简要描述]。要求：语气温和专业、以合作解决问题为导向、明确说明期望家长配合的具体事项，约150-200字。" }
];

const DEFAULT_PATHS = [
    { id:'path1', slug:"starter", title:"AI 入门基础", subtitle:"零基础快速上手AI工具", icon:"ph-seedling",
      gradient:"linear-gradient(135deg,#10B981,#0D9488)", duration:"约 2 周", level:"入门",
      desc:"从零开始了解人工智能，掌握基础提示词技巧，快速上手主流AI工具，为AI教学应用打下基础。",
      steps:[
          { name:"了解人工智能基本概念", detail:"什么是AI、大语言模型的原理、AI的能力边界", icon:"ph-brain" },
          { name:"掌握基础提示词技巧", detail:"清晰表达需求、角色扮演技巧、输出格式控制", icon:"ph-chat-text" },
          { name:"体验主流AI对话工具", detail:"体验ChatGPT、文心一言、讯飞星火等主流AI", icon:"ph-robot" },
          { name:"用AI辅助日常备课", detail:"让AI帮你查资料、整理思路、生成教学建议", icon:"ph-book-open-text" }
      ],
      resources:["PrompterHub - 学习提示词技巧","Prompt123 - 中文提示词宝库"] },
    { id:'path2', slug:"teacher", title:"AI 教学应用", subtitle:"将AI工具融入日常教学", icon:"ph-chalkboard-teacher",
      gradient:"linear-gradient(135deg,#3B82F6,#4F46E5)", duration:"约 4 周", level:"进阶",
      desc:"系统学习如何将AI工具应用于备课、出题、评价和个性化辅导，大幅提升教学效率。",
      steps:[
          { name:"AI辅助出题与自动批改", detail:"用AI生成多类型题目，实现智能批改与错题分析", icon:"ph-exam" },
          { name:"AI生成教学课件", detail:"用Gamma、即梦等工具快速生成高质量PPT和视频", icon:"ph-presentation-chart" },
          { name:"AI听课评课助手", detail:"借助棒棒糖AI分析课堂录像，生成评课报告", icon:"ph-chart-line-up" },
          { name:"AI个性化辅导方案", detail:"根据学生数据生成差异化教学策略", icon:"ph-user-gear" }
      ],
      resources:["快出题","AI好记","棒棒糖AI"] },
    { id:'path3', slug:"creator", title:"AI 创作进阶", subtitle:"用AI创作丰富的教学内容", icon:"ph-sparkle",
      gradient:"linear-gradient(135deg,#8B5CF6,#EC4899)", duration:"约 6 周", level:"高级",
      desc:"掌握AI生成视频、音乐、数字人等高级创作技能，打造沉浸式教学体验，搭建专属AI教学助手。",
      steps:[
          { name:"AI生成教学动画", detail:"用飞象老师制作高质量教学动画，直观呈现抽象概念", icon:"ph-film-strip" },
          { name:"AI音乐与声音设计", detail:"用海绵音乐为课堂配乐、生成原创教学歌曲", icon:"ph-music-notes" },
          { name:"数字人与虚拟讲师", detail:"用飞影数字人创建个人专属数字分身讲师", icon:"ph-user-circle" },
          { name:"搭建专属AI教学助手", detail:"用Coze平台零代码搭建学科专属AI答疑机器人", icon:"ph-robot" }
      ],
      resources:["飞象老师","海绵音乐","飞影数字人","Coze"] }
];

/* ===== Firestore 数据访问（异步） ===== */
const DB = {
    async getTools() {
        try {
            const snap = await db.collection('tools').orderBy('order').get();
            if (!snap.empty) return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch(e) { console.warn('getTools:', e.message); }
        return JSON.parse(JSON.stringify(DEFAULT_TOOLS));
    },
    async setTools(items) {
        const batch = db.batch();
        const ex = await db.collection('tools').get();
        ex.docs.forEach(d => batch.delete(d.ref));
        items.forEach((item, i) => batch.set(db.collection('tools').doc(String(item.id)), { ...item, order: i }));
        await batch.commit();
    },

    async getPrompts() {
        try {
            const snap = await db.collection('prompts').orderBy('order').get();
            if (!snap.empty) return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch(e) { console.warn('getPrompts:', e.message); }
        return JSON.parse(JSON.stringify(DEFAULT_PROMPTS));
    },
    async setPrompts(items) {
        const batch = db.batch();
        const ex = await db.collection('prompts').get();
        ex.docs.forEach(d => batch.delete(d.ref));
        items.forEach((item, i) => batch.set(db.collection('prompts').doc(String(item.id)), { ...item, order: i }));
        await batch.commit();
    },

    async getPaths() {
        try {
            const snap = await db.collection('paths').orderBy('order').get();
            if (!snap.empty) return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch(e) { console.warn('getPaths:', e.message); }
        return JSON.parse(JSON.stringify(DEFAULT_PATHS));
    },
    async setPaths(items) {
        const batch = db.batch();
        const ex = await db.collection('paths').get();
        ex.docs.forEach(d => batch.delete(d.ref));
        items.forEach((item, i) => batch.set(db.collection('paths').doc(String(item.id)), { ...item, order: i }));
        await batch.commit();
    },

    async getAnnouncements() {
        try {
            const snap = await db.collection('announcements').orderBy('createdAt', 'desc').get();
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch(e) { console.warn('getAnnouncements:', e.message); return []; }
    },
    async addAnnouncement(title, content) {
        await db.collection('announcements').add({ title, content, createdAt: new Date().toISOString() });
    },
    async updateAnnouncement(id, title, content) {
        await db.collection('announcements').doc(id).update({ title, content });
    },
    async deleteAnnouncement(id) {
        await db.collection('announcements').doc(id).delete();
    },

    async getUsers() {
        try {
            const snap = await db.collection('users').orderBy('joinedAt', 'desc').get();
            return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
        } catch(e) { console.warn('getUsers:', e.message); return []; }
    },
    async deleteUser(uid) {
        await db.collection('users').doc(uid).delete();
    },

    async seedDatabase() {
        const batch = db.batch();
        DEFAULT_TOOLS.forEach((item, i) => batch.set(db.collection('tools').doc(item.id), { ...item, order: i }));
        DEFAULT_PROMPTS.forEach((item, i) => batch.set(db.collection('prompts').doc(item.id), { ...item, order: i }));
        DEFAULT_PATHS.forEach((item, i) => batch.set(db.collection('paths').doc(item.id), { ...item, order: i }));
        await batch.commit();
    }
};

/* ===== RSS 抓取（三重代理策略） ===== */
async function fetchRSSFeed(rssUrl, count = 6) {
    const cacheKey = 'rss_' + btoa(encodeURIComponent(rssUrl)).slice(0, 24);
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
        try {
            const { items, ts } = JSON.parse(cached);
            if (Date.now() - ts < 30 * 60 * 1000) return items;
        } catch {}
    }

    const parseXML = (xmlStr) => {
        try {
            const xml = new DOMParser().parseFromString(xmlStr, 'text/xml');
            return Array.from(xml.querySelectorAll('item')).slice(0, count).map(item => ({
                title: item.querySelector('title')?.textContent?.trim() || '',
                link: (() => { const l = item.querySelector('link'); return l ? (l.textContent || l.nextSibling?.textContent || '').trim() : ''; })(),
                description: (item.querySelector('description')?.textContent || '').replace(/<[^>]*>/g, '').trim(),
                pubDate: item.querySelector('pubDate')?.textContent?.trim() || ''
            })).filter(i => i.title && i.link);
        } catch { return []; }
    };

    const get = async (url, ms = 7000) => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), ms);
        try { const r = await fetch(url, { signal: ctrl.signal }); clearTimeout(timer); return r; }
        finally { clearTimeout(timer); }
    };

    const save = (items) => { localStorage.setItem(cacheKey, JSON.stringify({ items, ts: Date.now() })); return items; };

    // 策略0：Netlify 服务端代理（同域，无跨域问题，优先）
    try {
        const r = await get(`/.netlify/functions/rss-proxy?url=${encodeURIComponent(rssUrl)}`);
        const d = await r.json();
        if (d.contents) { const items = parseXML(d.contents); if (items.length) return save(items); }
    } catch {}

    // 策略1：allorigins.win
    try {
        const r = await get(`https://api.allorigins.win/get?url=${encodeURIComponent(rssUrl)}`);
        const d = await r.json();
        if (d.contents) { const items = parseXML(d.contents); if (items.length) return save(items); }
    } catch {}

    // 策略2：corsproxy.io
    try {
        const r = await get(`https://corsproxy.io/?${encodeURIComponent(rssUrl)}`);
        const text = await r.text();
        if (text) { const items = parseXML(text); if (items.length) return save(items); }
    } catch {}

    // 策略3：rss2json API
    try {
        const r = await get(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}&count=${count}`);
        const d = await r.json();
        if (d.status === 'ok' && d.items?.length) {
            const items = d.items.map(i => ({ title: i.title, link: i.link, description: (i.description || '').replace(/<[^>]*>/g, '').trim(), pubDate: i.pubDate })).filter(i => i.title && i.link);
            return save(items);
        }
    } catch {}

    return null;
}

const RSS_FEEDS = {
    jiqizhixin: { url: 'https://www.jiqizhixin.com/rss',                                  label: '机器之心 · 国内AI' },
    qbitai:     { url: 'https://www.qbitai.com/rss',                                      label: '量子位 · 前沿速递' },
    verge:      { url: 'https://www.theverge.com/rss/ai-artificial-intelligence/rss.xml', label: 'The Verge · AI动态' },
    techcrunch: { url: 'https://techcrunch.com/category/artificial-intelligence/feed/',   label: 'TechCrunch · 科技前沿' },
    edsurge:    { url: 'https://edsurge.com/news.rss',                                    label: 'EdSurge · 教育科技' },
    mit:        { url: 'https://www.technologyreview.com/feed/',                          label: 'MIT科技评论' },
    wired:      { url: 'https://www.wired.com/feed/tag/ai/latest/rss',                   label: 'Wired · 科技趋势' }
};
