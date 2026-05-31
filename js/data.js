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
    { id:'path1', slug:"starter", title:"AI 入门基础", subtitle:"零基础快速上手AI工具", icon:"ph-rocket-launch",
      gradient:"linear-gradient(135deg,#10B981,#0D9488)", duration:"约 2 周", level:"入门",
      desc:"从零开始了解人工智能，掌握基础提示词技巧，快速上手主流AI工具，为AI教学应用打下扎实基础。",
      steps:[
          { name:"理解AI与大语言模型的本质",
            detail:"<strong>核心概念：</strong>AI不是搜索引擎，而是一个「会思考的协作者」。大语言模型（LLM）通过海量文本训练，能理解语境、生成内容、辅助推理。<br><br><strong>入门实验：</strong>打开文心一言或豆包，问它「请用我能向小学生解释的方式，解释什么是人工智能」，感受AI的回答风格与搜索引擎的本质差别。<br><br><strong>关键认知：</strong>AI会犯错，它的回答是「高质量草稿」而非标准答案，你的专业判断始终不可替代。",
            icon:"ph-brain" },
          { name:"掌握提示词的黄金公式",
            detail:"<strong>公式：角色 + 任务 + 背景 + 格式</strong><br><br>❌ 弱提示：「出一道语文题」<br>✅ 强提示：「你是小学三年级语文老师，请出一道关于《荷花》的阅读理解题，难度适中，包含2个选择题和1个简答题，给出参考答案」<br><br><strong>本周练习：</strong>用强提示词完成5个教学小任务（查资料、设计导入、生成练习、写评语、拟通知），体会差距。<br><br><strong>工具推荐：</strong>PrompterHub、Prompt123 有大量现成模板可直接套用。",
            icon:"ph-chat-text" },
          { name:"对比体验主流AI工具",
            detail:"<strong>国内首选（推荐先从这里开始）：</strong><br>• 文心一言 — 中文理解最优，适合教学内容生成<br>• 豆包 — 字节出品，免费额度大，对话自然<br>• Kimi — 长文档处理强，可上传教材PDF直接提问<br>• 讯飞星火 — 语音交互好，支持实时语音转文字<br><br><strong>国际工具（需科学上网）：</strong>ChatGPT、Claude<br><br><strong>本周任务：</strong>注册2-3个工具，对同一个问题分别提问，找到你最顺手的主力工具。",
            icon:"ph-robot" },
          { name:"用AI高效完成备课准备",
            detail:"<strong>备课四步AI工作流：</strong><br>① 知识梳理：「请梳理[知识点]的核心概念、易混点和常见错误，面向[年级]学生」<br>② 导入设计：「请为[课题]设计3个不同风格的课堂导入活动（故事型/问题型/情境型）」<br>③ 教案生成：AI生成框架，你补充细节和个人教学风格<br>④ 质量把关：让AI帮你检查教案中是否有知识性错误<br><br><strong>时间目标：</strong>一节课备课时间从2小时缩短至45分钟。",
            icon:"ph-book-open-text" },
          { name:"批量生成教学配套材料",
            detail:"<strong>高频材料一键生成：</strong><br>• 课堂练习题（指定题型/难度/数量）<br>• 分层作业单（基础/提高/拓展三版本）<br>• 思维导图文字稿（再用Xmind等工具美化）<br>• 知识总结表格、错题分析报告<br>• 课后反思清单、学习评价量表<br><br><strong>效率技巧：</strong>把你最满意的一份教案输入AI，让它「按这个风格和结构，生成下一单元的教案框架」，比从零开始快5倍。",
            icon:"ph-files" },
          { name:"建立可持续的AI工作习惯",
            detail:"<strong>两周打卡计划：</strong><br>第1周：每天用AI完成1件教学日常工作（写通知、改评语、备课查资料）<br>第2周：记录哪些场景AI最省时，整理成个人「AI辅助清单」<br><br><strong>进阶标志：</strong>当你在遇到新任务时，第一反应是「这步骤能让AI帮我吗？」——说明AI已自然融入你的工作流。<br><br><strong>下一步：</strong>完成入门后，进入「AI教学应用」进阶路径，解锁出题、课件、听课评课等专项技能。",
            icon:"ph-check-circle" }
      ],
      resources:["PrompterHub - 学习提示词技巧","Prompt123 - 中文提示词宝库","AI好记 - 分析优质课例"] },

    { id:'path2', slug:"teacher", title:"AI 教学应用", subtitle:"将AI工具融入日常教学全流程", icon:"ph-chalkboard-teacher",
      gradient:"linear-gradient(135deg,#3B82F6,#4F46E5)", duration:"约 4 周", level:"进阶",
      desc:"系统学习如何将AI工具嵌入备课、出题、评价、辅导、沟通各环节，大幅提升教学质量与工作效率。",
      steps:[
          { name:"AI智能出题与自动组卷",
            detail:"<strong>工具：快出题</strong><br><br><strong>操作流程：</strong><br>① 上传教材章节或输入知识点，一键生成覆盖多题型的题库<br>② 按「基础-提高-拓展」三档自动组卷，一次生成三套差异化试卷<br>③ 添加提示词要求：「结合生活实际」「避免纯记忆题」「设置情境题」<br>④ 导出Word/PDF，直接打印<br><br><strong>进阶用法：</strong>上传往年错题，让AI分析错误规律，生成专项突破题组。每次出题节省1-2小时。",
            icon:"ph-exam" },
          { name:"AI一键生成高质量教学课件",
            detail:"<strong>工具：Gamma（PPT） + 即梦AI（视频）</strong><br><br><strong>Gamma使用流程：</strong><br>① 输入「为[年级][学科][主题]生成一份教学PPT，包含学习目标、新知讲解、例题解析、随堂练习、课堂小结」<br>② 选择模板风格，AI自动排版<br>③ 重点页手动调整，替换AI生成图片为真实案例图<br><br><strong>即梦AI：</strong>用文字描述生成教学场景动图或短视频，嵌入PPT让课件更生动。<br><br><strong>注意：</strong>AI生成的数据和案例需人工核实准确性。",
            icon:"ph-presentation-chart" },
          { name:"AI辅助听课评课与教研",
            detail:"<strong>工具：棒棒糖AI听评课</strong><br><br><strong>个人用法：</strong><br>① 录制自己的课堂音频（用手机即可）<br>② 上传后AI自动转录、统计教师讲授/学生活动/互动提问的时间占比<br>③ 生成结构化评课报告，指出「教师话语量过大」「提问集中在前排学生」等具体问题<br><br><strong>教研组用法：</strong>组织全组同时分析3-5节同课异构录像，AI生成横向比较报告，2小时教研效果抵过去半学期。<br><br><strong>成长价值：</strong>量化数据让教学反思从「感觉」变成「证据」。",
            icon:"ph-chart-line-up" },
          { name:"AI设计个性化辅导方案",
            detail:"<strong>差异化教学三步法：</strong><br>① 描述学生特征：「该生数学基础薄弱，特别在分数计算中总忘记约分，上课注意力难以集中超过10分钟」<br>② 让AI生成分层方案：学困生（降难度+支架式提示）、中等生（夯基础+适度提升）、优等生（开放性探究+跨学科联系）<br>③ 布置针对性作业：上传错题截图，让AI分析错误类型并生成专项练习<br><br><strong>实用场景：</strong>家长会前用AI整理每位学生的优势与改进建议，30分钟生成全班个性化报告。",
            icon:"ph-users-three" },
          { name:"AI批量生成个性化评语",
            detail:"<strong>操作模板：</strong><br>「请为以下学生生成期末评语（100字），要求：①突出个人特点而非套话 ②指出1个核心优势 ③提1个具体改进方向 ④结尾给予期待。学生信息：姓名[  ]，性格[  ]，本学期亮点[  ]，待提升之处[  ]」<br><br><strong>效率数据：</strong>全班30份评语，AI辅助从2小时缩短至20分钟。<br><br><strong>作文批改：</strong>让AI先找出语病、逻辑漏洞和优美表达，再由你做最终判断，批改速度提升3倍，反馈质量不降反升。",
            icon:"ph-pencil-line" },
          { name:"AI辅助家校沟通与日常事务",
            detail:"<strong>高频场景批量处理：</strong><br>• 家长通知：「写一则关于[运动会/秋游/家长会]的通知，语气亲切、信息完整、200字以内」<br>• 敏感沟通：「学生A存在[问题]，请帮我起草一段微信沟通开场白，既说清问题又不引发家长防御」<br>• 会议记录：录音上传后AI自动整理成结构化记录<br>• 活动方案：「请设计一个45分钟的班级阅读分享活动流程」<br><br><strong>原则：</strong>AI写初稿，你把关语气和细节——既省时间，又避免措辞不当引发误解。",
            icon:"ph-chats" },
          { name:"整合工具，建立AI教学工作流",
            detail:"<strong>最终目标：</strong>把以上技能整合成个人专属的可持续工作流。<br><br><strong>建议步骤：</strong><br>① 列出你教学中最耗时的10件事，逐一测试AI能否介入<br>② 为每个有效场景写下标准提示词，存入本站「提示词库」<br>③ 每月用30分钟回顾：哪些场景AI越用越顺？哪些还需优化？<br>④ 与备课组分享最有效的提示词和工具组合，共建集体资产<br><br><strong>里程碑：</strong>你的工作时间结构发生变化——更多时间用在了真正需要人的地方：情感支持、创意教学、因材施教。",
            icon:"ph-trophy" }
      ],
      resources:["快出题","AI好记","棒棒糖AI","Gamma - PPT生成","即梦AI - 视频生成"] },

    { id:'path3', slug:"creator", title:"AI 创作进阶", subtitle:"用AI打造沉浸式教学体验", icon:"ph-sparkle",
      gradient:"linear-gradient(135deg,#8B5CF6,#EC4899)", duration:"约 6 周", level:"高级",
      desc:"掌握AI生成动画、音乐、数字人、绘本等高级创作技能，从内容消费者升级为内容创作者，搭建专属AI教学生态。",
      steps:[
          { name:"AI生成教学动画与微课视频",
            detail:"<strong>工具：飞象老师</strong><br><br><strong>制作流程：</strong><br>① 准备知识点讲解文字稿（500-800字，聚焦单一概念）<br>② 在飞象老师中选择动画风格（科普/卡通/实验演示）<br>③ AI自动生成带配音的动画视频，支持中文配音<br>④ 导出MP4，嵌入PPT或发布到班级学习平台<br><br><strong>最适合场景：</strong>抽象难以描述的概念——细胞分裂、化学反应过程、几何变换、历史事件还原。<br><br><strong>建议规格：</strong>每段3-5分钟，专注1个知识点，课前预习效果最佳。",
            icon:"ph-film-strip" },
          { name:"AI创作教学歌曲与配乐",
            detail:"<strong>工具：海绵音乐</strong><br><br><strong>歌曲创作两步法：</strong><br>① 先让AI（文心一言等）把知识点改写成押韵朗朗上口的歌词：「请把乘法口诀1-9表改写成适合小学生传唱的儿歌歌词，每句7字以内」<br>② 把歌词粘贴到海绵音乐，选择「儿歌/流行/古风」风格，AI生成完整歌曲含人声演唱<br><br><strong>应用场景：</strong>古诗词记忆歌、数学口诀歌、英语单词记忆歌、班规班约歌。<br><br><strong>实验数据：</strong>歌曲记忆的知识点遗忘速度比普通背诵慢3-5倍。",
            icon:"ph-music-notes" },
          { name:"AI图文绘本与系列插图创作",
            detail:"<strong>工具：anygen.io（系列图）+ Nano Banana/Gemini（单图）</strong><br><br><strong>核心优势：</strong>anygen.io能保持角色外观的跨图一致性，适合创作连续故事。<br><br><strong>绘本创作流程：</strong><br>① 先用AI写好故事文稿（5-8页，每页1-2句话）<br>② 设定主角外貌（上传参考图或文字描述）<br>③ 每页输入场景描述，AI生成与主角风格统一的插图<br>④ 用Canva排版，导出PDF打印成班级专属绘本<br><br><strong>版权提示：</strong>AI生成内容用于课堂教学无需担忧，商业出版需查阅平台协议。",
            icon:"ph-image-square" },
          { name:"制作专属数字人讲师",
            detail:"<strong>工具：飞影数字人 / 即梦AI</strong><br><br><strong>数字人制作流程：</strong><br>① 上传正面照片，AI生成专属数字分身<br>② 输入讲解文稿，AI自动生成口型同步的数字人讲解视频<br>③ 支持中文配音，可选择声音风格<br>④ 加入PPT背景或课堂场景，导出高清视频<br><br><strong>高效复用策略：</strong>同一个知识点视频可跨班级、跨学年反复使用。一次制作投入，三年持续受益。<br><br><strong>适用场景：</strong>课前预习视频、课后复习资料、家长学校课程、校本课程录制。",
            icon:"ph-user-circle" },
          { name:"搭建专属学科AI问答助手",
            detail:"<strong>工具：Coze（扣子）— 零代码AI开发平台</strong><br><br><strong>搭建流程（约2小时）：</strong><br>① 注册Coze，新建Bot，设定角色：「你是[学科]学习助手，面向[年级]学生，用简单易懂的语言回答问题，先引导思考再给答案」<br>② 上传知识库：教材章节、常见错题、解题方法汇总文档<br>③ 设置规则：禁止直接给题目答案，要求逐步引导<br>④ 发布为网页链接，发给学生直接使用<br><br><strong>进阶：</strong>加入「每日一题」定时推送功能；设置错误追踪，当学生反复问同类问题时通知老师。",
            icon:"ph-robot" },
          { name:"AI教学资源的体系化管理",
            detail:"<strong>从「素材堆积」到「可用资产」：</strong><br><br><strong>分类整理：</strong>按年级/单元/技能类型建立文件夹，每个资源附上「创作提示词」，方便他人复现<br><br><strong>知识库建设：</strong>用「秘塔搜索」知识库功能，把教学资料做成全文可检索的团队共享库。输入关键词即可找到任意资料片段<br><br><strong>提示词沉淀：</strong>把最有效的提示词存入本站「提示词库」，形成备课组集体资产<br><br><strong>共建共享：</strong>组织校内AI教学工具分享会，每人带来1-2个有效案例，集体经验胜过个人摸索。",
            icon:"ph-folder-open" },
          { name:"持续进化：跟上AI教育前沿",
            detail:"<strong>保持学习的最小成本方法：</strong><br><br>• <strong>每周15分钟资讯：</strong>关注「机器之心」「量子位」等，只看标题+摘要，不必深读每篇<br>• <strong>每月1次新工具体验：</strong>选一个新AI工具，做一次真实教学场景测试，记录「能用/不能用/超预期」<br>• <strong>每学期1次分享：</strong>在校内分享你的AI教学实践，倒逼自己系统总结<br><br><strong>最重要的认知：</strong>AI工具会不断升级，但「如何提问」「如何判断质量」「如何结合教育情境」的能力，才是你真正需要建立的核心竞争力。",
            icon:"ph-rocket-launch" }
      ],
      resources:["飞象老师","海绵音乐","飞影数字人","即梦AI","anygen.io","Coze","秘塔搜索"] }
];

const DEFAULT_ARTICLES = [
    {
        id: 'tip-classroom-profile',
        title: '给 AI 一张课堂画像：备课提问的 5 个关键信息',
        summary: '把年级、学科、学生基础、课时长度和课堂目标说清楚，AI 才能给出贴近真实课堂的教案初稿。',
        category: 'tips',
        type: 'original',
        status: 'published',
        author: 'AI教师培训中心',
        coverEmoji: '🧭',
        coverColor: 'linear-gradient(135deg,#0D9488,#10B981)',
        readCount: 128,
        publishedAt: '2026-05-28T08:00:00.000Z',
        createdAt: '2026-05-28T08:00:00.000Z',
        content: `# 给 AI 一张课堂画像：备课提问的 5 个关键信息

很多老师第一次用 AI 备课时，会直接问：“帮我写一份教案。”AI 往往也能写出一份看起来完整的文本，但问题是：它常常不像你的课堂。

真正好用的提问，不是让 AI 猜你的教学情境，而是先把课堂画像交给它。

## 1. 先说清楚学生是谁

至少交代四件事：年级、学科、班级基础、常见困难。

例如：

“我教的是七年级语文，班里学生阅读速度差异较大，部分学生能概括情节，但不太会分析人物心理。”

这类信息会影响 AI 对活动难度、提问层次和课堂节奏的判断。

## 2. 说明这节课真正要达成什么

不要只写“讲《春》”，最好写成可观察的学习结果。

可以这样描述：

“本课希望学生能找出文中描写春景的关键词句，并能用自己的话说出作者表达的情感。”

目标越具体，AI 给出的流程越不容易空泛。

## 3. 告诉 AI 课堂限制

包括课时长度、已有资源、课堂环境、是否需要小组活动。

例如：

“这节课 40 分钟，没有多媒体互动设备，但可以使用投影和学习单。”

AI 会据此减少不现实的活动设计。

## 4. 要求输出可直接使用的结构

建议固定输出格式：

- 教学目标
- 教学重难点
- 课堂流程表
- 教师提问
- 学生可能回答
- 板书设计
- 课后作业

如果你希望它写得更像教案，可以补一句：

“请用一线教师备课时可以直接修改的语言，不要写成论文式表述。”

## 5. 最后让 AI 自查

生成教案后，再追问一句：

“请检查这份教案中是否存在目标与活动不匹配、时间分配不合理、提问过难或过浅的问题，并提出修改建议。”

这一轮自查很有价值。AI 第一次生成的是初稿，第二次反思往往能帮你发现结构问题。

## 可直接复制的提示词

你是一位有经验的中小学[学科]教师。请基于以下课堂画像，为我设计一节[课题]的教案：

- 年级：[年级]
- 学生基础：[学生已有基础]
- 常见困难：[学生容易卡住的地方]
- 课时长度：[例如40分钟]
- 课堂条件：[设备、材料、小组活动条件]
- 学习目标：[希望学生课后能够做到什么]

请输出：教学目标、教学重难点、课堂流程表、关键提问、学生可能回答、板书设计和课后作业。语言要贴近一线教师备课，不要空泛。最后请附上你对这份教案的自查建议。`
    },
    {
        id: 'tip-question-design',
        title: '用 AI 出题前，先把难度和答案标准说清楚',
        summary: 'AI 可以快速出题，但教师要先给出知识点、题型、难度比例和答案要求，再进行人工抽查。',
        category: 'tips',
        type: 'original',
        status: 'published',
        author: 'AI教师培训中心',
        coverEmoji: '📝',
        coverColor: 'linear-gradient(135deg,#3B82F6,#4F46E5)',
        readCount: 96,
        publishedAt: '2026-05-27T08:00:00.000Z',
        createdAt: '2026-05-27T08:00:00.000Z',
        content: `# 用 AI 出题前，先把难度和答案标准说清楚

AI 很适合帮老师生成练习题、单元检测题和分层作业。但它有一个明显问题：如果要求不清楚，它会出得“像题”，却未必真正适合你的学生。

所以，用 AI 出题前，教师要先定规则。

## 1. 先明确知识点边界

不要只说“出几道分数题”，而要说清楚具体范围。

例如：

“围绕小学五年级数学‘异分母分数加减法’出题，不涉及分数乘除法。”

边界越清楚，越能避免超纲或跑题。

## 2. 先定难度比例

推荐使用三层结构：

- 基础题：检查概念和基本方法
- 提高题：加入一步变式或生活情境
- 拓展题：需要综合判断或解释理由

例如：

“请生成 10 道题，其中基础题 6 道、提高题 3 道、拓展题 1 道。”

这样生成的练习更容易用于分层教学。

## 3. 一定要求附答案和解析

只要让 AI 出题，就要同时要求：

- 每题参考答案
- 简要解析
- 对应知识点
- 难度标签

这会让后续审核更快，也方便你筛题。

## 4. 让 AI 做一次质量自检

题目生成后，可以继续追问：

“请检查这些题目是否存在答案错误、表述不清、难度重复、知识点覆盖不均衡的问题，并列出需要修改的题号。”

这一步不能替代教师审核，但能减少明显问题。

## 5. 教师最后要重点查什么

人工检查时建议看四点：

- 是否符合本节课目标
- 是否超纲
- 答案是否唯一或评分标准是否清楚
- 题目语言是否适合学生年龄

AI 出题的价值不是让老师完全不看题，而是把“从零开始写题”的时间省下来，让老师把精力放在选题、改题和诊断学生上。

## 可直接复制的提示词

请为[年级][学科]“[知识点]”设计[数量]道练习题，要求：

1. 题型包括：[选择题/填空题/解答题/应用题]
2. 难度比例：基础题[数量]道、提高题[数量]道、拓展题[数量]道
3. 不涉及：[写出不希望出现的超纲内容]
4. 每道题请附：参考答案、简要解析、对应知识点、难度标签
5. 题目语言要适合[年级]学生，情境尽量贴近日常生活

生成后，请再检查一遍是否有答案错误、表述不清或难度重复的问题。`
    },
    {
        id: 'tip-courseware-workflow',
        title: '课件先搭结构，再补真实素材：AI 做课件的正确顺序',
        summary: '不要让 AI 一步生成最终课件。先用 AI 搭逻辑，再由教师补例题、课堂照片、板书和本校情境。',
        category: 'tips',
        type: 'original',
        status: 'published',
        author: 'AI教师培训中心',
        coverEmoji: '🎞️',
        coverColor: 'linear-gradient(135deg,#F59E0B,#EF4444)',
        readCount: 112,
        publishedAt: '2026-05-26T08:00:00.000Z',
        createdAt: '2026-05-26T08:00:00.000Z',
        content: `# 课件先搭结构，再补真实素材：AI 做课件的正确顺序

AI 生成课件很快，但快并不等于好。很多 AI 课件的问题是：画面漂亮，课堂不真实；页数很多，重点不突出。

更稳妥的做法是：先让 AI 搭结构，再由教师补真实素材。

## 1. 先让 AI 生成“课件骨架”

不要一开始就追求完整 PPT，可以先让 AI 输出页面结构。

例如：

“请为小学四年级科学《声音的传播》设计 10 页课件大纲，每页包括标题、核心内容、教师讲解要点和课堂活动。”

这一步的目标是确定逻辑，而不是美化。

## 2. 把每一页都绑定教学动作

一页课件最好对应一个明确动作：

- 导入问题
- 概念解释
- 实验观察
- 例题讲解
- 小组讨论
- 巩固练习
- 课堂小结

如果一页只有漂亮图片，没有教学动作，课堂上就容易空转。

## 3. 重点页必须补真实素材

AI 适合生成大纲、文案和部分示意图，但这些内容最好由教师再补充：

- 本班学生熟悉的生活情境
- 真实课堂照片或实验照片
- 教材例题和校本材料
- 你自己的板书逻辑
- 学生常见错误样例

这些真实素材会让课件从“通用模板”变成“你的课堂”。

## 4. AI 生成图片要注意核验

AI 图片可以用于情境创设、故事插图和活动海报，但在科学、历史、地理等学科中，要特别注意事实准确性。

建议原则：

- 知识性图片优先使用真实资料图
- 创意性图片可以用 AI 生成
- 涉及人物、地图、实验步骤时必须人工核验

## 5. 最后用 AI 检查节奏

课件初稿完成后，可以把页面结构发给 AI：

“请检查这份课件是否存在页面过多、讲授时间过长、互动不足、练习与目标不匹配的问题。”

它会帮你从课堂节奏角度做一次复盘。

## 可直接复制的提示词

请为[年级][学科]《[课题]》设计一份课件大纲，要求：

1. 共[页数]页，每页包括：页面标题、核心内容、教师讲解要点、学生任务
2. 每页都要对应明确教学动作，避免只有装饰性内容
3. 至少设计 2 个课堂互动环节和 1 个即时练习
4. 标出哪些页面建议补充真实照片、例题、板书或学生错误样例
5. 最后检查课件节奏是否适合[课时长度]分钟课堂

请先输出结构大纲，不要直接写成完整讲稿。`
    }
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
        DEFAULT_ARTICLES.forEach((item, i) => batch.set(db.collection('articles').doc(item.id), { ...item, order: i }));
        await batch.commit();
    },

    /* ===== 社区提示词 ===== */
    async getCommunityPrompts(status = null) {
        try {
            let q = db.collection('community_prompts');
            if (status) q = q.where('status', '==', status);
            else q = q.orderBy('createdAt', 'desc');
            const snap = await q.get();
            return snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        } catch(e) { console.warn('getCommunityPrompts:', e.message); return []; }
    },
    async submitCommunityPrompt(userId, userName, data) {
        const item = { ...data, authorId: userId, authorName: userName, status: 'pending', likes: 0, likedBy: [], createdAt: new Date().toISOString() };
        await db.collection('community_prompts').add(item);
    },
    async likeCommunityPrompt(promptId, userId) {
        const ref = db.collection('community_prompts').doc(promptId);
        const doc = await ref.get();
        if (!doc.exists) return false;
        const d = doc.data();
        const likedBy = d.likedBy || [];
        if (likedBy.includes(userId)) {
            await ref.update({ likes: Math.max(0, (d.likes || 0) - 1), likedBy: likedBy.filter(id => id !== userId) });
            return false;
        } else {
            await ref.update({ likes: (d.likes || 0) + 1, likedBy: [...likedBy, userId] });
            return true;
        }
    },
    async approveCommunityPrompt(id) {
        await db.collection('community_prompts').doc(id).update({ status: 'approved' });
    },
    async deleteCommunityPrompt(id) {
        await db.collection('community_prompts').doc(id).delete();
    },

    /* ===== 工具评分 ===== */
    async getToolRatings() {
        try {
            const snap = await db.collection('tool_ratings').get();
            const result = {};
            snap.docs.forEach(d => { result[d.id] = d.data(); });
            return result;
        } catch(e) { return {}; }
    },
    async rateToolByUser(toolId, userId, rating) {
        const ref = db.collection('tool_ratings').doc(toolId);
        const doc = await ref.get();
        if (doc.exists) {
            const d = doc.data();
            const ratings = { ...(d.ratings || {}), [userId]: rating };
            const vals = Object.values(ratings);
            const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10;
            await ref.update({ ratings, avg, count: vals.length });
        } else {
            await ref.set({ ratings: { [userId]: rating }, avg: rating, count: 1 });
        }
    },
    async getUserToolRating(toolId, userId) {
        try {
            const doc = await db.collection('tool_ratings').doc(toolId).get();
            if (!doc.exists) return null;
            return doc.data().ratings?.[userId] || null;
        } catch { return null; }
    },

    /* ===== 优秀案例 ===== */
    async getShowcases(status = null) {
        try {
            let q = db.collection('showcases');
            if (status) q = q.where('status', '==', status);
            else q = q.orderBy('createdAt', 'desc');
            const snap = await q.get();
            return snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        } catch(e) { console.warn('getShowcases:', e.message); return []; }
    },
    async submitShowcase(userId, userName, data) {
        const item = { ...data, authorId: userId, authorName: userName, status: 'pending', createdAt: new Date().toISOString() };
        await db.collection('showcases').add(item);
    },
    async approveShowcase(id) {
        await db.collection('showcases').doc(id).update({ status: 'approved' });
    },
    async deleteShowcase(id) {
        await db.collection('showcases').doc(id).delete();
    },

    /* ===== 精选文章 ===== */
    async getArticles(status = null) {
        try {
            let q = db.collection('articles');
            if (status) q = q.where('status', '==', status);
            else q = q.orderBy('publishedAt', 'desc');
            const snap = await q.get();
            if (!snap.empty) {
                const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                const existingIds = new Set(items.map(item => item.id));
                const fallbackItems = DEFAULT_ARTICLES.filter(item => !existingIds.has(item.id));
                return [...items, ...fallbackItems]
                    .filter(item => !status || item.status === status)
                    .sort((a, b) => new Date(b.publishedAt || b.createdAt || 0) - new Date(a.publishedAt || a.createdAt || 0));
            }
        } catch(e) { console.warn('getArticles:', e.message); }
        const fallback = JSON.parse(JSON.stringify(DEFAULT_ARTICLES));
        const list = status ? fallback.filter(a => a.status === status) : fallback;
        return list.sort((a, b) => new Date(b.publishedAt || b.createdAt || 0) - new Date(a.publishedAt || a.createdAt || 0));
    },
    async getArticle(id) {
        try {
            const doc = await db.collection('articles').doc(id).get();
            if (!doc.exists) return JSON.parse(JSON.stringify(DEFAULT_ARTICLES.find(a => a.id === id) || null));
            return { id: doc.id, ...doc.data() };
        } catch(e) {
            return JSON.parse(JSON.stringify(DEFAULT_ARTICLES.find(a => a.id === id) || null));
        }
    },
    async addArticle(data) {
        const doc = await db.collection('articles').add({
            ...data,
            readCount: 0,
            publishedAt: new Date().toISOString(),
            createdAt: new Date().toISOString()
        });
        return doc.id;
    },
    async updateArticle(id, data) {
        await db.collection('articles').doc(id).update({ ...data, updatedAt: new Date().toISOString() });
    },
    async deleteArticle(id) {
        await db.collection('articles').doc(id).delete();
    },

    /* ===== 邮件订阅 ===== */
    async addSubscriber(email) {
        const snap = await db.collection('subscribers').where('email', '==', email).get();
        if (!snap.empty) return 'exists';
        await db.collection('subscribers').add({ email, subscribedAt: new Date().toISOString() });
        return 'ok';
    },
    async getSubscribers() {
        try {
            const snap = await db.collection('subscribers').orderBy('subscribedAt', 'desc').get();
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch(e) { return []; }
    },
    async deleteSubscriber(id) {
        await db.collection('subscribers').doc(id).delete();
    },

    /* ===== 联系留言 ===== */
    async getMessages() {
        try {
            const snap = await db.collection('contact_messages').orderBy('createdAt', 'desc').get();
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch(e) { console.warn('getMessages:', e.message); return []; }
    },
    async updateMessage(id, data) {
        await db.collection('contact_messages').doc(id).update(data);
    },
    async deleteMessage(id) {
        await db.collection('contact_messages').doc(id).delete();
    }
};

/* ===== RSS 抓取（三重代理策略） ===== */
async function fetchRSSFeed(rssUrl, count = 6) {
    const cacheKey = 'rss_' + btoa(encodeURIComponent(rssUrl)).slice(0, 24);
    const cached = localStorage.getItem(cacheKey);
    let staleItems = null;
    if (cached) {
        try {
            const { items, ts } = JSON.parse(cached);
            if (Date.now() - ts < 30 * 60 * 1000) return items;
            if (Array.isArray(items) && items.length) staleItems = items;
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

    const get = async (url, ms = 5500) => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), ms);
        try {
            const r = await fetch(url, { signal: ctrl.signal });
            clearTimeout(timer);
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r;
        }
        finally { clearTimeout(timer); }
    };

    const save = (items) => { localStorage.setItem(cacheKey, JSON.stringify({ items, ts: Date.now() })); return items; };
    const requireItems = async (loader) => {
        const items = await loader();
        if (items?.length) return items;
        throw new Error('empty feed');
    };

    const selfProxyLoader = async () => {
        const r = await get(`/api/rss-proxy?url=${encodeURIComponent(rssUrl)}`);
        const d = await r.json();
        return d.contents ? parseXML(d.contents) : [];
    };
    const allOriginsLoader = async () => {
        const r = await get(`https://api.allorigins.win/get?url=${encodeURIComponent(rssUrl)}`);
        const d = await r.json();
        return d.contents ? parseXML(d.contents) : [];
    };
    const corsProxyLoader = async () => {
        const r = await get(`https://corsproxy.io/?${encodeURIComponent(rssUrl)}`);
        const text = await r.text();
        return text ? parseXML(text) : [];
    };
    const rss2jsonLoader = async () => {
        const r = await get(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}&count=${count}`);
        const d = await r.json();
        if (d.status !== 'ok' || !d.items?.length) return [];
        return d.items.map(i => ({
            title: i.title,
            link: i.link,
            description: (i.description || '').replace(/<[^>]*>/g, '').trim(),
            pubDate: i.pubDate
        })).filter(i => i.title && i.link);
    };

    try {
        const primaryLoaders = [allOriginsLoader];
        const host = location.hostname;
        const hasOwnProxy = host !== 'localhost' && host !== '127.0.0.1' && host !== '';
        if (hasOwnProxy) primaryLoaders.unshift(selfProxyLoader);
        const items = await Promise.any(primaryLoaders.map(loader => requireItems(loader)));
        return save(items);
    } catch {}

    try {
        const items = await Promise.any([corsProxyLoader, rss2jsonLoader].map(loader => requireItems(loader)));
        return save(items);
    } catch {
        if (staleItems) return staleItems;
    }

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
