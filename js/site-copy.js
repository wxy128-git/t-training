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
        research: Object.freeze({
            id: 'research',
            label: '科研写作',
            path: '/research',
            fields: Object.freeze([
                {"key": "heroKicker", "label": "首页眉题", "maxLength": 40, "defaultValue": "科研写作 · RESEARCH WRITING", "group": "科研首页"},
                {"key": "heroTitle", "label": "首页标题", "maxLength": 50, "defaultValue": "把教学困扰，变成能研究的问题", "group": "科研首页"},
                {"key": "heroIntro", "label": "首页简介", "maxLength": 180, "defaultValue": "面向中小学教师的论文与课题写作支持。AI 负责追问、填卡、整理；选题、判断和结论由你来做。", "rows": 3, "group": "科研首页"},
                {"key": "literatureTitle", "label": "文献来源标题", "maxLength": 30, "defaultValue": "AI 不替你找文献", "group": "科研首页"},
                {"key": "literatureIntro", "label": "文献来源说明", "maxLength": 180, "defaultValue": "文献必须来自知网、国家哲学社会科学文献中心等数据库，模型只负责读和整理。", "rows": 3, "group": "科研首页"},
                {"key": "judgmentTitle", "label": "教师判断标题", "maxLength": 30, "defaultValue": "AI 不替你下判断", "group": "科研首页"},
                {"key": "judgmentIntro", "label": "教师判断说明", "maxLength": 180, "defaultValue": "精读卡的“与我的研究的关系”和最终评价由你亲自写。", "rows": 3, "group": "科研首页"},
                {"key": "privacyTitle", "label": "个人信息标题", "maxLength": 30, "defaultValue": "不上传学生个人信息", "group": "科研首页"},
                {"key": "privacyIntro", "label": "个人信息说明", "maxLength": 180, "defaultValue": "描述困扰时用“某生”“A 同学”，文献材料不含学生姓名。", "rows": 3, "group": "科研首页"},
                {"key": "funnelEyebrow", "label": "问题教练身份说明", "maxLength": 40, "defaultValue": "AI 科研伙伴 · 问题聚焦", "group": "研究问题教练"},
                {"key": "funnelRole", "label": "问题教练角色名", "maxLength": 20, "defaultValue": "研究问题教练", "group": "研究问题教练"},
                {"key": "funnelIntro", "label": "问题教练介绍", "maxLength": 180, "defaultValue": "我会根据你的困扰，一次问一个关键问题，陪你把它聚焦成能研究的问题。", "rows": 3, "group": "研究问题教练"},
                {"key": "funnelAction", "label": "问题教练入口提示", "maxLength": 50, "defaultValue": "聚焦结果 + 五种结构的标题 →", "group": "研究问题教练"},
                {"key": "funnelGreeting", "label": "问题教练开场白（仅展示）", "maxLength": 600, "defaultValue": "我是你的 AI 研究问题教练。你脑子里现在可能只有一团困扰，还不是研究问题，这很正常。\n\n先用一两句话说说：最近教学里最让你头疼的是什么？我会根据你的困扰，一次问一个关键问题；信息足够时，就一起把它聚焦成能研究的问题。在那之前我不会给任何建议。", "rows": 5, "group": "研究问题教练"},
                {"key": "readingEyebrow", "label": "文献伙伴身份说明", "maxLength": 40, "defaultValue": "AI 科研伙伴 · 文献研读", "group": "文献研读伙伴"},
                {"key": "readingRole", "label": "文献伙伴角色名", "maxLength": 20, "defaultValue": "文献研读伙伴", "group": "文献研读伙伴"},
                {"key": "readingIntro", "label": "文献伙伴介绍", "maxLength": 180, "defaultValue": "我陪你按五读法梳理论文的依据和方法；与你研究的关系，由你核对、改写。", "rows": 3, "group": "文献研读伙伴"},
                {"key": "readingAction", "label": "文献伙伴入口提示", "maxLength": 50, "defaultValue": "十栏精读卡 + 卡片夹 CSV →", "group": "文献研读伙伴"},
                {"key": "libraryGuest", "label": "卡片夹入口（未登录）", "maxLength": 80, "defaultValue": "登录后可保存精读卡并导出表格", "group": "文献卡片夹"},
                {"key": "libraryMember", "label": "卡片夹入口（已登录，不含数量）", "maxLength": 30, "defaultValue": "我的文献卡片夹", "group": "文献卡片夹"},
                {"key": "libraryIntro", "label": "卡片夹保存说明", "maxLength": 100, "defaultValue": "精读卡保存在「我的备课本」中", "group": "文献卡片夹"},
                {"key": "moreTools", "label": "后续工具提示", "maxLength": 140, "defaultValue": "更多工具陆续推出：主题综合、评审专家、技术路线图。", "rows": 3, "group": "科研首页"},
                {"key": "funnelPrivacy", "label": "对话个人信息提示", "maxLength": 180, "defaultValue": "描述学生时请用“某生”“A 同学”，不要出现真实姓名。", "rows": 3, "group": "研究问题教练"},
                {"key": "funnelUnsaved", "label": "未保存对话提示", "maxLength": 100, "defaultValue": "刷新页面会丢失未保存的对话", "group": "研究问题教练"},
                {"key": "composeLabel", "label": "对话输入标签", "maxLength": 60, "defaultValue": "说说你的困扰，或回答刚才的问题", "group": "研究问题教练"},
                {"key": "composePlaceholder", "label": "对话输入占位提示", "maxLength": 100, "defaultValue": "Enter 发送，Shift+Enter 换行", "group": "研究问题教练"},
                {"key": "sourceHint", "label": "文献格式说明", "maxLength": 300, "defaultValue": "知网默认下载的 .caj 格式无法读取，请在知网下载页选择 PDF。扫描版 PDF 没有文字层，请先用 WPS 或知网的 OCR 转成文字再粘贴。", "rows": 4, "group": "文献研读伙伴"},
                {"key": "questionLabel", "label": "研究问题输入标签", "maxLength": 60, "defaultValue": "我的研究问题（必填，≤ 300 字）", "group": "文献研读伙伴"},
                {"key": "questionPlaceholder", "label": "研究问题占位提示", "maxLength": 140, "defaultValue": "例如：分层作业如何影响学生的参与？", "group": "文献研读伙伴"},
                {"key": "metaLabel", "label": "文献信息输入标签", "maxLength": 60, "defaultValue": "文献信息（可选）", "group": "文献研读伙伴"},
                {"key": "metaPlaceholder", "label": "文献信息占位提示", "maxLength": 140, "defaultValue": "作者，年份，题目；留空则从文本识别", "group": "文献研读伙伴"},
                {"key": "repeatHint", "label": "重复生成提示", "maxLength": 160, "defaultValue": "一篇文献生成一次即可；需要重做请先修改研究问题或文本", "rows": 3, "group": "文献研读伙伴"},
                {"key": "readingPrivacy", "label": "PDF 与模型处理说明", "maxLength": 500, "defaultValue": "PDF 只在你的浏览器里提取文字，文件本身不会上传。提取出的文字会发送给模型服务商用于生成，本站不保存全文，只保存生成的卡片。请勿上传含学生姓名等个人信息的材料。", "rows": 5, "group": "文献研读伙伴"},
                {"key": "readingEmpty", "label": "精读卡空白提示", "maxLength": 140, "defaultValue": "选择一篇文献，填好研究问题，开始阅读。", "group": "文献研读伙伴"},
                {"key": "libraryTitle", "label": "卡片夹页标题", "maxLength": 40, "defaultValue": "我的文献卡片夹", "group": "文献卡片夹"},
                {"key": "libraryExportHint", "label": "卡片夹导出说明", "maxLength": 180, "defaultValue": "CSV 可用 Excel / WPS 直接打开；导出当前筛选下的卡片。", "rows": 3, "group": "文献卡片夹"},
                {"key": "libraryEmpty", "label": "卡片夹无结果提示", "maxLength": 140, "defaultValue": "还没有符合条件的精读卡。", "group": "文献卡片夹"},
                {"key": "generateAction", "label": "生成按钮", "maxLength": 30, "defaultValue": "生成精读卡", "group": "文献研读伙伴"},
                {"key": "noteLabel", "label": "备注按钮名称", "maxLength": 100, "defaultValue": "查看备注", "group": "备注、预览与通用操作"},
                {"key": "backResearch", "label": "返回科研首页", "maxLength": 100, "defaultValue": "← 科研写作", "group": "备注、预览与通用操作"},
                {"key": "workspaceAction", "label": "备课本按钮", "maxLength": 100, "defaultValue": "我的备课本", "group": "备注、预览与通用操作"},
                {"key": "coachGuide", "label": "教练操作区标题", "maxLength": 100, "defaultValue": "研究进度与操作", "group": "研究问题教练"},
                {"key": "clearAction", "label": "清空按钮", "maxLength": 100, "defaultValue": "清空重来", "group": "研究问题教练"},
                {"key": "sendAction", "label": "发送按钮", "maxLength": 100, "defaultValue": "发送", "group": "研究问题教练"},
                {"key": "stopAction", "label": "停止按钮", "maxLength": 100, "defaultValue": "停止生成", "group": "研究问题教练"},
                {"key": "latestAction", "label": "聊天回到最新", "maxLength": 100, "defaultValue": "回到最新消息 ↓", "group": "研究问题教练"},
                {"key": "greetingPrompt", "label": "教练简短开场", "maxLength": 100, "defaultValue": "最近教学里，最让你困扰的是什么？", "group": "研究问题教练"},
                {"key": "phaseStart", "label": "教练进度：描述", "maxLength": 100, "defaultValue": "描述困扰", "group": "研究问题教练"},
                {"key": "phaseProbing", "label": "教练进度：澄清", "maxLength": 100, "defaultValue": "澄清困扰", "group": "研究问题教练"},
                {"key": "phaseFocused", "label": "教练进度：聚焦", "maxLength": 100, "defaultValue": "聚焦结果", "group": "研究问题教练"},
                {"key": "phaseTitles", "label": "教练进度：标题", "maxLength": 100, "defaultValue": "标题方案", "group": "研究问题教练"},
                {"key": "roundLabel", "label": "追问计数模板", "maxLength": 100, "defaultValue": "已追问 {count} 次", "group": "研究问题教练"},
                {"key": "statusStart", "label": "教练状态：开始", "maxLength": 100, "defaultValue": "从一个真实困扰开始", "group": "研究问题教练"},
                {"key": "statusProbing", "label": "教练状态：澄清", "maxLength": 100, "defaultValue": "按你的困扰逐步澄清", "group": "研究问题教练"},
                {"key": "statusFocused", "label": "教练状态：聚焦", "maxLength": 100, "defaultValue": "已聚焦 · 可以生成标题或继续梳理", "group": "研究问题教练"},
                {"key": "statusTitles", "label": "教练状态：标题", "maxLength": 100, "defaultValue": "标题已生成 · 请核对研究条件", "group": "研究问题教练"},
                {"key": "statusSent", "label": "教练状态：已发送", "maxLength": 100, "defaultValue": "已发送 · 正在梳理", "group": "研究问题教练"},
                {"key": "statusResponding", "label": "教练状态：回应", "maxLength": 100, "defaultValue": "正在回应", "group": "研究问题教练"},
                {"key": "pendingCoach", "label": "教练等待消息", "maxLength": 100, "defaultValue": "正在梳理你的问题", "group": "研究问题教练"},
                {"key": "selfLabel", "label": "教师消息署名", "maxLength": 100, "defaultValue": "我", "group": "备注、预览与通用操作"},
                {"key": "continueAction", "label": "继续澄清按钮", "maxLength": 100, "defaultValue": "继续澄清", "group": "研究问题教练"},
                {"key": "summarizeAction", "label": "直接聚焦按钮", "maxLength": 100, "defaultValue": "用已有信息直接聚焦", "group": "研究问题教练"},
                {"key": "titlesAction", "label": "生成标题按钮", "maxLength": 100, "defaultValue": "生成五种结构的标题", "group": "研究问题教练"},
                {"key": "retitleAction", "label": "更换标题按钮", "maxLength": 100, "defaultValue": "换一组标题", "group": "研究问题教练"},
                {"key": "reopenAction", "label": "继续梳理按钮", "maxLength": 100, "defaultValue": "继续梳理问题", "group": "研究问题教练"},
                {"key": "saveChatAction", "label": "保存完整对话按钮", "maxLength": 100, "defaultValue": "保存完整对话", "group": "研究问题教练"},
                {"key": "saveResultAction", "label": "保存结果按钮", "maxLength": 100, "defaultValue": "保存聚焦结果与标题", "group": "研究问题教练"},
                {"key": "copyResultAction", "label": "复制结果按钮", "maxLength": 100, "defaultValue": "复制结果", "group": "研究问题教练"},
                {"key": "starterOne", "label": "教练示例一", "maxLength": 100, "defaultValue": "学生的课堂参与总是不均衡", "group": "研究问题教练"},
                {"key": "starterTwo", "label": "教练示例二", "maxLength": 100, "defaultValue": "分层作业做了，但效果不清楚", "group": "研究问题教练"},
                {"key": "starterThree", "label": "教练示例三", "maxLength": 100, "defaultValue": "教研讨论很多，却难以改变课堂", "group": "研究问题教练"},
                {"key": "pdfAction", "label": "来源：PDF", "maxLength": 100, "defaultValue": "上传 PDF", "group": "文献研读伙伴"},
                {"key": "textAction", "label": "来源：文本", "maxLength": 100, "defaultValue": "粘贴文本", "group": "文献研读伙伴"},
                {"key": "dropLabel", "label": "PDF 选择提示", "maxLength": 100, "defaultValue": "选择或拖入 PDF", "group": "文献研读伙伴"},
                {"key": "paperTextLabel", "label": "文本输入标签", "maxLength": 100, "defaultValue": "论文文本", "group": "文献研读伙伴"},
                {"key": "sourceTabLabel", "label": "来源切换名称", "maxLength": 100, "defaultValue": "文献来源", "group": "文献研读伙伴"},
                {"key": "repeatLabel", "label": "重做备注名称", "maxLength": 100, "defaultValue": "生成与重做说明", "group": "文献研读伙伴"},
                {"key": "privacyNoteLabel", "label": "隐私备注名称", "maxLength": 100, "defaultValue": "材料与隐私说明", "group": "科研首页"},
                {"key": "sourceNoteLabel", "label": "格式备注名称", "maxLength": 100, "defaultValue": "文献格式说明", "group": "文献研读伙伴"},
                {"key": "unsavedNoteLabel", "label": "未保存备注名称", "maxLength": 100, "defaultValue": "未保存内容说明", "group": "备注、预览与通用操作"},
                {"key": "introNoteLabel", "label": "伙伴备注名称", "maxLength": 100, "defaultValue": "伙伴使用说明", "group": "备注、预览与通用操作"},
                {"key": "previewAction", "label": "预览按钮", "maxLength": 100, "defaultValue": "预览", "group": "备注、预览与通用操作"},
                {"key": "previewTitle", "label": "预览页标题", "maxLength": 100, "defaultValue": "内容预览", "group": "备注、预览与通用操作"},
                {"key": "previewCopy", "label": "预览复制按钮", "maxLength": 100, "defaultValue": "复制 Markdown", "group": "备注、预览与通用操作"},
                {"key": "closeAction", "label": "关闭按钮", "maxLength": 100, "defaultValue": "关闭", "group": "备注、预览与通用操作"},
                {"key": "responseLabel", "label": "文献回复区标题", "maxLength": 100, "defaultValue": "研读结果", "group": "文献研读伙伴"},
                {"key": "readingProgress", "label": "研读进度模板", "maxLength": 100, "defaultValue": "正在阅读并填卡…已接收 {count} 字", "group": "文献研读伙伴"},
                {"key": "rawOutputLabel", "label": "原始输出折叠标题", "maxLength": 100, "defaultValue": "原始输出", "group": "文献研读伙伴"},
                {"key": "readingEditHint", "label": "教师改写备注", "maxLength": 400, "defaultValue": "“与我的研究的关系”和“一句话评价”请用你自己的话改写后再保存。可先预览，再核对观点和依据。", "rows": 3, "group": "文献研读伙伴"},
                {"key": "saveCardAction", "label": "保存精读卡按钮", "maxLength": 100, "defaultValue": "保存到卡片夹", "group": "文献研读伙伴"},
                {"key": "markdownAction", "label": "复制 Markdown 按钮", "maxLength": 100, "defaultValue": "复制 Markdown", "group": "备注、预览与通用操作"},
                {"key": "tsvAction", "label": "复制表格按钮", "maxLength": 100, "defaultValue": "复制为表格行（TSV）", "group": "文献研读伙伴"},
                {"key": "retryAction", "label": "重新生成按钮", "maxLength": 100, "defaultValue": "重新生成", "group": "文献研读伙伴"},
                {"key": "newCardAction", "label": "新建精读卡按钮", "maxLength": 100, "defaultValue": "新建精读卡", "group": "文献研读伙伴"},
                {"key": "copyRawAction", "label": "复制原文按钮", "maxLength": 100, "defaultValue": "复制原文", "group": "文献研读伙伴"},
                {"key": "myQuestion", "label": "精读卡研究问题标签", "maxLength": 100, "defaultValue": "我的研究问题", "group": "精读卡栏目与依据"},
                {"key": "sourceLabel", "label": "精读卡依据备注", "maxLength": 100, "defaultValue": "依据位置", "group": "精读卡栏目与依据"},
                {"key": "editCitation", "label": "修正文献信息按钮", "maxLength": 100, "defaultValue": "修正文献信息", "group": "精读卡栏目与依据"},
                {"key": "citationAuthors", "label": "文献信息：作者", "maxLength": 100, "defaultValue": "作者", "group": "精读卡栏目与依据"},
                {"key": "citationYear", "label": "文献信息：年份", "maxLength": 100, "defaultValue": "年份", "group": "精读卡栏目与依据"},
                {"key": "citationTitle", "label": "文献信息：题目", "maxLength": 100, "defaultValue": "题目", "group": "精读卡栏目与依据"},
                {"key": "citationJournal", "label": "文献信息：期刊", "maxLength": 100, "defaultValue": "期刊", "group": "精读卡栏目与依据"},
                {"key": "citationCore", "label": "文献信息：核心", "maxLength": 100, "defaultValue": "核心期刊", "group": "精读卡栏目与依据"},
                {"key": "relationBorrow", "label": "研究关系：借鉴", "maxLength": 100, "defaultValue": "可借鉴", "group": "精读卡栏目与依据"},
                {"key": "relationChallenge", "label": "研究关系：质疑", "maxLength": 100, "defaultValue": "可质疑", "group": "精读卡栏目与依据"},
                {"key": "relationGap", "label": "研究关系：空白", "maxLength": 100, "defaultValue": "留下的空白", "group": "精读卡栏目与依据"},
                {"key": "saveHeading", "label": "保存确认标题", "maxLength": 100, "defaultValue": "确认保存标题", "group": "备注、预览与通用操作"},
                {"key": "saveTitleLabel", "label": "保存标题输入", "maxLength": 100, "defaultValue": "标题", "group": "备注、预览与通用操作"},
                {"key": "saveAction", "label": "保存确认按钮", "maxLength": 100, "defaultValue": "保存", "group": "备注、预览与通用操作"},
                {"key": "cancelAction", "label": "保存取消按钮", "maxLength": 100, "defaultValue": "取消", "group": "备注、预览与通用操作"},
                {"key": "savedCardHeading", "label": "已保存卡片标题", "maxLength": 100, "defaultValue": "已保存的精读卡", "group": "文献卡片夹"},
                {"key": "cardCitation", "label": "精读卡栏目：文献信息", "maxLength": 100, "defaultValue": "文献信息", "group": "精读卡栏目与依据"},
                {"key": "helpCitation", "label": "精读卡备注：文献信息", "maxLength": 400, "defaultValue": "作者、年份、题目、期刊、是否核心；请核对识别结果。", "rows": 3, "group": "精读卡栏目与依据"},
                {"key": "cardQuestion", "label": "精读卡栏目：研究问题", "maxLength": 100, "defaultValue": "研究问题", "group": "精读卡栏目与依据"},
                {"key": "helpQuestion", "label": "精读卡备注：研究问题", "maxLength": 400, "defaultValue": "读摘要：作者要回答什么，用一句话说明。", "rows": 3, "group": "精读卡栏目与依据"},
                {"key": "cardSample", "label": "精读卡栏目：对象与情境", "maxLength": 100, "defaultValue": "对象与情境", "group": "精读卡栏目与依据"},
                {"key": "helpSample", "label": "精读卡备注：对象与情境", "maxLength": 400, "defaultValue": "读摘要：谁、哪里、多少人、什么学段。", "rows": 3, "group": "精读卡栏目与依据"},
                {"key": "cardMethod", "label": "精读卡栏目：研究方法", "maxLength": 100, "defaultValue": "研究方法", "group": "精读卡栏目与依据"},
                {"key": "helpMethod", "label": "精读卡备注：研究方法", "maxLength": 400, "defaultValue": "读方法：研究方法、工具、数据收集与分析。", "rows": 3, "group": "精读卡栏目与依据"},
                {"key": "cardViewpoints", "label": "精读卡栏目：核心观点", "maxLength": 100, "defaultValue": "核心观点", "group": "精读卡栏目与依据"},
                {"key": "helpViewpoints", "label": "精读卡备注：核心观点", "maxLength": 400, "defaultValue": "读观点：作者的主张或理论立场。", "rows": 3, "group": "精读卡栏目与依据"},
                {"key": "cardFindings", "label": "精读卡栏目：主要结论", "maxLength": 100, "defaultValue": "主要结论", "group": "精读卡栏目与依据"},
                {"key": "helpFindings", "label": "精读卡备注：主要结论", "maxLength": 400, "defaultValue": "读结论：数据支持的发现，与作者观点区分。", "rows": 3, "group": "精读卡栏目与依据"},
                {"key": "cardReferences", "label": "精读卡栏目：关键引用", "maxLength": 100, "defaultValue": "关键引用", "group": "精读卡栏目与依据"},
                {"key": "helpReferences", "label": "精读卡备注：关键引用", "maxLength": 400, "defaultValue": "读引用：文中反复引用的文献及其作用。", "rows": 3, "group": "精读卡栏目与依据"},
                {"key": "cardLimitations", "label": "精读卡栏目：局限", "maxLength": 100, "defaultValue": "局限", "group": "精读卡栏目与依据"},
                {"key": "helpLimitations", "label": "精读卡备注：局限", "maxLength": 400, "defaultValue": "读结论：作者承认的局限，以及需要你核对的局限。", "rows": 3, "group": "精读卡栏目与依据"},
                {"key": "cardRelevance", "label": "精读卡栏目：与我的研究的关系", "maxLength": 100, "defaultValue": "与我的研究的关系", "group": "精读卡栏目与依据"},
                {"key": "helpRelevance", "label": "精读卡备注：与我的研究的关系", "maxLength": 400, "defaultValue": "综合五读：可借鉴、可质疑、留下的空白；这些内容由你核对、改写。", "rows": 3, "group": "精读卡栏目与依据"},
                {"key": "cardVerdict", "label": "精读卡栏目：一句话评价", "maxLength": 100, "defaultValue": "一句话评价", "group": "精读卡栏目与依据"},
                {"key": "helpVerdict", "label": "精读卡备注：一句话评价", "maxLength": 400, "defaultValue": "综合五读：是否值得在综述里引用，为什么；请用自己的话评价。", "rows": 3, "group": "精读卡栏目与依据"},
                {"key": "loginHint", "label": "科研登录提示", "maxLength": 300, "defaultValue": "请先登录后使用科研写作工具", "rows": 3, "group": "备注、预览与通用操作"},
                {"key": "coachLengthError", "label": "聊天字数错误", "maxLength": 300, "defaultValue": "单条输入不能超过 2,000 字，请缩短后发送", "rows": 3, "group": "研究问题教练"},
                {"key": "incompleteHint", "label": "未完成提示模板", "maxLength": 300, "defaultValue": "本次内容未完成：{message}", "rows": 3, "group": "备注、预览与通用操作"},
                {"key": "readingRequiredError", "label": "材料缺失提示", "maxLength": 300, "defaultValue": "请填写研究问题，并提供含文字的 PDF 或论文文本", "rows": 3, "group": "文献研读伙伴"},
                {"key": "readingFormatError", "label": "格式错误提示", "maxLength": 300, "defaultValue": "模型没有按精读卡格式返回，可点重新生成", "rows": 3, "group": "文献研读伙伴"},
                {"key": "missingFieldsHint", "label": "缺失栏目模板", "maxLength": 300, "defaultValue": "以下项模型未给出：{fields}", "rows": 3, "group": "精读卡栏目与依据"},
                {"key": "copySuccess", "label": "复制成功提示", "maxLength": 300, "defaultValue": "已复制", "rows": 3, "group": "备注、预览与通用操作"},
                {"key": "copyFailure", "label": "复制失败提示", "maxLength": 300, "defaultValue": "复制失败，请选择文字后手动复制", "rows": 3, "group": "备注、预览与通用操作"},
                {"key": "clearConfirm", "label": "清空确认", "maxLength": 300, "defaultValue": "清空未保存的对话并重新开始？", "rows": 3, "group": "研究问题教练"},
                {"key": "leaveConfirm", "label": "离开生成确认", "maxLength": 300, "defaultValue": "生成仍在进行，离开会停止生成。确定继续？", "rows": 3, "group": "备注、预览与通用操作"},
                {"key": "saveLengthError", "label": "保存长度错误", "maxLength": 300, "defaultValue": "内容过长，请仅保存聚焦结果与标题，或缩短正文后重试", "rows": 3, "group": "备注、预览与通用操作"},
                {"key": "saveFailure", "label": "保存失败模板", "maxLength": 300, "defaultValue": "保存失败：{message}，可重试", "rows": 3, "group": "备注、预览与通用操作"},
                {"key": "cardSavedHint", "label": "卡片保存反馈", "maxLength": 300, "defaultValue": "已保存到文献卡片夹和「我的备课本」", "rows": 3, "group": "精读卡栏目与依据"},
                {"key": "coachSavedHint", "label": "教练保存反馈", "maxLength": 300, "defaultValue": "已保存到「我的备课本」", "rows": 3, "group": "研究问题教练"},
                {"key": "pdfExtracting", "label": "PDF 提取状态", "maxLength": 300, "defaultValue": "正在浏览器内提取文字…", "rows": 3, "group": "文献研读伙伴"},
                {"key": "pdfProgress", "label": "PDF 页数进度模板", "maxLength": 300, "defaultValue": "正在提取 {read} / {total} 页…", "rows": 3, "group": "文献研读伙伴"},
                {"key": "pdfExtracted", "label": "PDF 完成模板", "maxLength": 300, "defaultValue": "已提取 {read} / {total} 页、约 {count} 字", "rows": 3, "group": "文献研读伙伴"},
                {"key": "pdfScannedError", "label": "扫描版 PDF 提示", "maxLength": 300, "defaultValue": "扫描版 PDF 没有足够文字层，请先用 WPS 或知网 OCR 转成文字再粘贴。", "rows": 3, "group": "文献研读伙伴"},
                {"key": "truncatedHint", "label": "文字截断提示", "maxLength": 300, "defaultValue": "已截断至 60,000 字或前 60 页，建议只保留正文部分重新上传或改为粘贴", "rows": 3, "group": "文献研读伙伴"},
                {"key": "textTruncatedHint", "label": "粘贴截断提示", "maxLength": 300, "defaultValue": "已截断至 60,000 字，建议只保留正文", "rows": 3, "group": "文献研读伙伴"},
                {"key": "countTemplate", "label": "输入字数模板", "maxLength": 300, "defaultValue": "{count} / {limit} 字", "rows": 3, "group": "备注、预览与通用操作"},
                {"key": "titleFormatHint", "label": "题名核对模板", "maxLength": 300, "defaultValue": "标题格式需核对：{issues}。可点“换一组标题”。", "rows": 3, "group": "研究问题教练"}
            ])
        }),
        agents: Object.freeze({
            id: 'agents', label: '智能体空间', path: '/agents',
            fields: Object.freeze([
                { key: 'heroKicker', label: '首屏眉题', maxLength: 40, defaultValue: '你的数字教研团队' },
                { key: 'heroTitle', label: '首屏标题', maxLength: 50, defaultValue: '和一位懂教学的数字成员一起工作' },
                { key: 'heroIntro', label: '首屏简介', maxLength: 120, rows: 3, defaultValue: '他们分工明确，会先了解你的教学任务，再和你一起完成初稿、核验与整理。' },
                { key: 'teamIndexHeading', label: '团队索引标题', maxLength: 20, defaultValue: '团队索引' },
                { key: 'teamIndexSummary', label: '团队索引概况', maxLength: 40, defaultValue: '5 个教研部门 · 19 位成员可协作' },
                { key: 'teamIndexHint', label: '团队索引提示', maxLength: 60, defaultValue: '先描述任务，或从下方部门进入。' },
                { key: 'searchPlaceholder', label: '搜索框提示', maxLength: 60, defaultValue: '描述任务，如「设计一场小组活动」' },
                { key: 'overviewFilter', label: '团队总览筛选', maxLength: 16, defaultValue: '团队总览' },
                { key: 'recommendedHeading', label: '推荐分区标题', maxLength: 24, defaultValue: '推荐成员' },
                { key: 'directoryHeading', label: '部门目录标题', maxLength: 30, defaultValue: '按教研部门找到合适成员' },
                { key: 'directoryIntro', label: '部门目录说明', maxLength: 80, rows: 2, defaultValue: '每个部门只处理一组相近任务，进入后再选择具体成员。' },
                { key: 'departmentAction', label: '部门入口操作文字', maxLength: 16, defaultValue: '查看成员' },
                { key: 'allMembersAction', label: '全部成员操作文字', maxLength: 24, defaultValue: '查看全部 19 位成员' },
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
                { key: 'reviewNote', label: '信息核验说明', maxLength: 160, rows: 3, defaultValue: '费用与语言支持请以官网为准，单项核对日期见卡片。不要上传学生姓名、联系方式或成绩明细。' },
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
            let candidate = typeof raw[field.key] === 'string' ? raw[field.key].trim() : '';
            if (pageId === 'tools' && field.key === 'reviewNote' && candidate === '信息核对于 2026 年 8 月，请以官网为准。不要上传学生姓名、联系方式或成绩明细。') candidate = field.defaultValue;
            // Migrate only untouched legacy defaults; keep the administrator's own wording.
            if (pageId === 'research' && field.key === 'funnelIntro' && candidate === '我会一次追问一个问题，陪你在六轮之内把课堂困扰聚焦成能研究的问题。') candidate = field.defaultValue;
            if (pageId === 'research' && field.key === 'funnelGreeting' && ['我是你的 AI 研究问题教练。','我是研究问题漏斗。'].some(prefix => candidate === prefix+'你脑子里现在可能只有一团困扰，还不是研究问题，这很正常。\n\n先用一两句话说说：最近教学里最让你头疼的是什么？我会一个问题一个问题地问，六轮之内帮你把它聚焦成能研究的问题。在那之前我不会给任何建议。')) candidate = field.defaultValue;
            if (pageId === 'research' && field.key === 'funnelGreeting') candidate = candidate.replace('尽量在六轮对话内帮你把它聚焦成明确的研究问题。','根据你的困扰逐步澄清，信息足够时就一起把它聚焦成明确的研究问题。');
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
