/* ===== DEFAULT DATA ===== */
const DEFAULT_TOOLS = [
    { id:1, name:"PrompterHub", desc:"把想法转化成完美提示词的社区平台", url:"https://www.prompterhub.cn/home", icon:"ph-pencil", color:"text-blue-500", bg:"bg-blue-50", category:"teaching" },
    { id:2, name:"Prompt123", desc:"完全免费的中文AI提示词宝库", url:"https://prompt123.cn", icon:"ph-pen", color:"text-pink-500", bg:"bg-pink-50", category:"teaching" },
    { id:3, name:"AI好记", desc:"分析优质公开课，智能总结课程精华", url:"https://aihaoji.com/zh?utm_source=invite&utm_content=MCHihFWN", icon:"ph-notebook", color:"text-blue-600", bg:"bg-blue-50", category:"teaching" },
    { id:4, name:"快出题", desc:"智能生成试题，快速组卷的教学助手", url:"https://kuaichuti.net/", icon:"ph-exam", color:"text-emerald-500", bg:"bg-emerald-50", category:"teaching" },
    { id:5, name:"棒棒糖AI听评课", desc:"辅助教研、听课、评课、议课全流程", url:"https://bbt.etah-tech.com/publish/login?key=5SiCv0QgJ40=", icon:"ph-chats-circle", color:"text-pink-500", bg:"bg-pink-50", category:"teaching" },
    { id:6, name:"飞象老师", desc:"快速生成高质量教学动画", url:"https://www.feixianglaoshi.com/", icon:"ph-film-strip", color:"text-cyan-500", bg:"bg-cyan-50", category:"teaching" },
    { id:7, name:"Gamma", desc:"一键生成PPT，视觉效果出色", url:"https://gamma.app/signup?r=qelbuujfixnt8t6", icon:"ph-presentation-chart", color:"text-orange-500", bg:"bg-orange-50", category:"creation" },
    { id:8, name:"anygen.io", desc:"创作系列图，适配绘本、课件等场景", url:"https://www.anygen.io/home?invitation_code=4UQOT4NA0EBPFWS", icon:"ph-pencil-circle", color:"text-orange-400", bg:"bg-orange-50", category:"creation" },
    { id:9, name:"海绵音乐", desc:"输入灵感，快速生成高质量歌曲", url:"https://www.haimian.com/", icon:"ph-music-notes", color:"text-rose-500", bg:"bg-rose-50", category:"creation" },
    { id:10, name:"即梦AI", desc:"生成式AI，支持生成数字人视频", url:"https://jimeng.jianying.com/ai-tool/home/", icon:"ph-magic-wand", color:"text-violet-500", bg:"bg-violet-50", category:"creation" },
    { id:11, name:"Nano Banana", desc:"功能强大的图片生成工具（Gemini）", url:"https://gemini.google.com/app?hl=zh-cn", icon:"ph-image", color:"text-purple-500", bg:"bg-purple-50", category:"creation" },
    { id:12, name:"飞影数字人", desc:"专业的数字人视频制作平台", url:"https://hifly.cc/i/GXyeDnoyGPc", icon:"ph-user-focus", color:"text-sky-500", bg:"bg-sky-50", category:"creation" },
    { id:13, name:"秘塔搜索", desc:"辅助建立知识库的专题研究工具", url:"https://metaso.cn/", icon:"ph-magnifying-glass", color:"text-teal-500", bg:"bg-teal-50", category:"search" },
    { id:14, name:"Coze", desc:"新一代一站式AI Bot开发平台", url:"https://www.coze.cn/studio?invite_code=260ab871053241e8a2730bb5dff7f662", icon:"ph-robot", color:"text-indigo-500", bg:"bg-indigo-50", category:"dev" }
];

const DEFAULT_PROMPTS = [
    { id:1, label:"备课助手", icon:"ph-book-open-text", color:"text-blue-500", bg:"bg-blue-50", category:"teaching",
      text:"你是一位经验丰富的[学科]教师，请为[年级]学生设计一节关于「[主题]」的完整教案，包括：①教学目标（知识、能力、情感三维）②教学重难点 ③教学流程（40分钟，含导入-新授-练习-小结）④板书设计 ⑤作业布置。要求贴近学生实际，体现新课程理念。" },
    { id:2, label:"智能出题", icon:"ph-exam", color:"text-emerald-500", bg:"bg-emerald-50", category:"teaching",
      text:"请为[年级][学科]「[知识点]」出[数量]道[题型]题，要求：①难度分布：基础题[X]道、提高题[X]道、拓展题[X]道 ②每道题附参考答案和解题思路 ③题目情境联系生活实际，避免纯机械记忆。" },
    { id:3, label:"学生评语", icon:"ph-star", color:"text-yellow-500", bg:"bg-yellow-50", category:"teaching",
      text:"请为以下学生生成一段温暖、个性化的期末评语（100-150字）：姓名：[姓名]，性格特点：[特点]，学习优势：[优点]，待改进之处：[不足]，本学期印象深刻的事：[事件]。要求积极正面，给予期待与鼓励。" },
    { id:4, label:"课堂提问", icon:"ph-question", color:"text-purple-500", bg:"bg-purple-50", category:"teaching",
      text:"请围绕「[课文/主题]」为[年级]学生设计6个由浅入深的课堂提问，要求：①前2题：基础理解层（What）②中2题：分析应用层（Why/How）③后2题：评价创造层（引发思考与讨论）。每题附提问目的和预期学生反应。" },
    { id:5, label:"作业设计", icon:"ph-pencil-line", color:"text-rose-500", bg:"bg-rose-50", category:"teaching",
      text:"请为学完[学科][内容]的[年级]学生设计一项有创意的课后作业，要求：①趣味性强，避免机械练习 ②可操作性强，预计完成时间不超过[X]分钟 ③体现跨学科融合或生活应用 ④附评价标准（优秀/良好/合格三个等级描述）。" },
    { id:6, label:"差异化教学", icon:"ph-users-three", color:"text-indigo-500", bg:"bg-indigo-50", category:"advanced",
      text:"针对[学科][知识点]，请为三类不同水平的学生分别设计学习方案：①学困生：降低难度、提供支架式指导 ②中等生：夯实基础、适当提升 ③优等生：拓展延伸、开放性探究。每类方案包括学习目标、学习活动和评价方式。" },
    { id:7, label:"课文分析", icon:"ph-article", color:"text-teal-500", bg:"bg-teal-50", category:"advanced",
      text:"请对「[课文名称]」进行深度教学分析，包括：①主题思想与情感基调 ②写作特色与艺术手法 ③重点词句赏析（列举3-5处）④教学价值与育人意义 ⑤本文在[年级]教材体系中的地位与作用。请以教师备课视角撰写。" },
    { id:8, label:"家长沟通", icon:"ph-chats", color:"text-cyan-500", bg:"bg-cyan-50", category:"communication",
      text:"请帮我起草一段与家长沟通的消息，主题：[沟通主题]。学生情况：[简要描述]。要求：语气温和专业、以合作解决问题为导向、明确说明期望家长配合的具体事项，约150-200字。" }
];

const DEFAULT_PATHS = [
    {
        id: 1, slug: "starter", title:"AI 入门基础", subtitle:"零基础快速上手AI工具", icon:"ph-seedling",
        gradient:"linear-gradient(135deg,#10B981,#0D9488)", duration:"约 2 周", level:"入门",
        desc:"从零开始了解人工智能，掌握基础提示词技巧，快速上手主流AI工具，为AI教学应用打下基础。",
        steps:[
            { name:"了解人工智能基本概念", detail:"什么是AI、大语言模型的原理、AI的能力边界", icon:"ph-brain" },
            { name:"掌握基础提示词技巧", detail:"清晰表达需求、角色扮演技巧、输出格式控制", icon:"ph-chat-text" },
            { name:"体验主流AI对话工具", detail:"体验ChatGPT、文心一言、讯飞星火等主流AI", icon:"ph-robot" },
            { name:"用AI辅助日常备课", detail:"让AI帮你查资料、整理思路、生成教学建议", icon:"ph-book-open-text" }
        ],
        resources:["PrompterHub - 学习提示词技巧","Prompt123 - 中文提示词宝库"]
    },
    {
        id: 2, slug: "teacher", title:"AI 教学应用", subtitle:"将AI工具融入日常教学", icon:"ph-chalkboard-teacher",
        gradient:"linear-gradient(135deg,#3B82F6,#4F46E5)", duration:"约 4 周", level:"进阶",
        desc:"系统学习如何将AI工具应用于备课、出题、评价和个性化辅导，大幅提升教学效率。",
        steps:[
            { name:"AI辅助出题与自动批改", detail:"用AI生成多类型题目，实现智能批改与错题分析", icon:"ph-exam" },
            { name:"AI生成教学课件", detail:"用Gamma、即梦等工具快速生成高质量PPT和视频", icon:"ph-presentation-chart" },
            { name:"AI听课评课助手", detail:"借助棒棒糖AI分析课堂录像，生成评课报告", icon:"ph-chart-line-up" },
            { name:"AI个性化辅导方案", detail:"根据学生数据生成差异化教学策略", icon:"ph-user-gear" }
        ],
        resources:["快出题 - 智能出题组卷","AI好记 - 公开课分析","棒棒糖AI - 听评课助手"]
    },
    {
        id: 3, slug: "creator", title:"AI 创作进阶", subtitle:"用AI创作丰富的教学内容", icon:"ph-sparkle",
        gradient:"linear-gradient(135deg,#8B5CF6,#EC4899)", duration:"约 6 周", level:"高级",
        desc:"掌握AI生成视频、音乐、数字人等高级创作技能，打造沉浸式教学体验，搭建专属AI教学助手。",
        steps:[
            { name:"AI生成教学动画", detail:"用飞象老师制作高质量教学动画，直观呈现抽象概念", icon:"ph-film-strip" },
            { name:"AI音乐与声音设计", detail:"用海绵音乐为课堂配乐、生成原创教学歌曲", icon:"ph-music-notes" },
            { name:"数字人与虚拟讲师", detail:"用飞影数字人创建个人专属数字分身讲师", icon:"ph-user-circle" },
            { name:"搭建专属AI教学助手", detail:"用Coze平台零代码搭建学科专属AI答疑机器人", icon:"ph-robot" }
        ],
        resources:["飞象老师 - 教学动画","海绵音乐 - AI音乐","飞影数字人 - 数字人","Coze - AI Bot平台"]
    }
];

/* ===== DATA ACCESS (localStorage override for admin) ===== */
const DB = {
    tools: {
        get() { const s = localStorage.getItem('aitc_tools'); return s ? JSON.parse(s) : JSON.parse(JSON.stringify(DEFAULT_TOOLS)); },
        set(d) { localStorage.setItem('aitc_tools', JSON.stringify(d)); },
        reset() { localStorage.removeItem('aitc_tools'); }
    },
    prompts: {
        get() { const s = localStorage.getItem('aitc_prompts'); return s ? JSON.parse(s) : JSON.parse(JSON.stringify(DEFAULT_PROMPTS)); },
        set(d) { localStorage.setItem('aitc_prompts', JSON.stringify(d)); },
        reset() { localStorage.removeItem('aitc_prompts'); }
    },
    paths: {
        get() { const s = localStorage.getItem('aitc_paths'); return s ? JSON.parse(s) : JSON.parse(JSON.stringify(DEFAULT_PATHS)); },
        set(d) { localStorage.setItem('aitc_paths', JSON.stringify(d)); },
        reset() { localStorage.removeItem('aitc_paths'); }
    },
    announcements: {
        get() { return JSON.parse(localStorage.getItem('aitc_announcements') || '[]'); },
        set(d) { localStorage.setItem('aitc_announcements', JSON.stringify(d)); }
    },
    users: {
        get() { return JSON.parse(localStorage.getItem('aitc_users') || '[]'); },
        set(d) { localStorage.setItem('aitc_users', JSON.stringify(d)); }
    }
};

/* ===== RSS FETCHER ===== */
async function fetchRSSFeed(rssUrl, count = 6) {
    const cacheKey = 'rss_' + btoa(encodeURIComponent(rssUrl)).slice(0, 24);
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
        const { items, ts } = JSON.parse(cached);
        if (Date.now() - ts < 30 * 60 * 1000) return items;
    }

    const parseXML = (xmlStr) => {
        const xml = new DOMParser().parseFromString(xmlStr, 'text/xml');
        const getNodeText = (item, tag) => {
            const el = item.querySelector(tag);
            if (!el) return '';
            return el.textContent || el.innerHTML || '';
        };
        return Array.from(xml.querySelectorAll('item')).slice(0, count).map(item => ({
            title: getNodeText(item, 'title').trim(),
            link: (() => {
                const link = item.querySelector('link');
                return link ? (link.textContent || link.nextSibling?.textContent || '').trim() : '';
            })(),
            description: getNodeText(item, 'description').replace(/<[^>]*>/g, '').trim(),
            pubDate: getNodeText(item, 'pubDate').trim()
        })).filter(i => i.title && i.link);
    };

    // Strategy 1: allorigins.win (most reliable CORS proxy)
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 9000);
        const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(rssUrl)}`, { signal: controller.signal });
        clearTimeout(timer);
        const data = await res.json();
        if (data.contents) {
            const items = parseXML(data.contents);
            if (items.length > 0) {
                localStorage.setItem(cacheKey, JSON.stringify({ items, ts: Date.now() }));
                return items;
            }
        }
    } catch (e) { /* try next */ }

    // Strategy 2: rss2json.com
    try {
        const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}&count=${count}`);
        const data = await res.json();
        if (data.status === 'ok' && data.items?.length) {
            const items = data.items.map(i => ({
                title: i.title || '',
                link: i.link || '',
                description: (i.description || '').replace(/<[^>]*>/g, '').trim(),
                pubDate: i.pubDate || ''
            })).filter(i => i.title && i.link);
            localStorage.setItem(cacheKey, JSON.stringify({ items, ts: Date.now() }));
            return items;
        }
    } catch (e) { /* both failed */ }

    return null;
}

const RSS_FEEDS = {
    edsurge:    { url: 'https://edsurge.com/news.rss',                                    label: 'EdSurge · 教育科技' },
    verge:      { url: 'https://www.theverge.com/rss/ai-artificial-intelligence/rss.xml', label: 'The Verge · AI动态' },
    techcrunch: { url: 'https://techcrunch.com/category/artificial-intelligence/feed/',   label: 'TechCrunch · 科技前沿' },
    mit:        { url: 'https://www.technologyreview.com/feed/',                          label: 'MIT科技评论' },
    wired:      { url: 'https://www.wired.com/feed/tag/ai/latest/rss',                   label: 'Wired · 科技趋势' }
};
