// 固定、匿名的教学质量样例。仅准备样例不会调用模型；live runner 需另行授权额度。
export const cases = [
    { id:'lesson-primary', agentId:'lesson-design', inputs:{subject:'数学',grade:'小学三年级',topic:'分数的初步认识',periods:'1 课时',goal:'认识几分之一，知道平均分是前提',note:'40 分钟，45 人，9 组；只有纸张和彩笔。不要预设学生已经学过异分母运算。'}, checks:['时间合计 40 分钟','平均分与同一整体条件正确','9 组全员参与','目标有可观察的检查方法'] },
    { id:'courseware', agentId:'courseware-outline', inputs:{subject:'英语',grade:'小学三年级',topic:'颜色与日常问候',pages:'精简（约 10 页）',style:['以问题驱动','互动小测']}, checks:['约 10 页且页码完整','英语拼写与句型准确','非整页长文字','互动可实际执行'] },
    { id:'micro-science', agentId:'micro-script', inputs:{topic:'为什么会有四季',grade:'小学六年级',duration:'3 分钟',tone:['严谨讲解'],point:'讲清地轴倾斜及地球公转；澄清不是距离太阳远近决定四季。'}, checks:['南北半球季节相反','地轴倾斜和公转解释正确','分镜时间累计约 180 秒','旁白字数可在时长内讲完'] },
    { id:'hook', agentId:'lesson-hook', inputs:{subject:'物理',grade:'初中八年级',topic:'声音的产生与传播'}, checks:['4–5 种导入','振动发声、传播需要介质','演示安全且常规教室可做','导入后自然连接概念'] },
    { id:'socratic', agentId:'socratic', history:[{role:'user',content:'我是小学五年级学生。我认为 1/8 比 1/4 大，因为 8 比 4 大。请帮我想一想。'}], checks:['只问 1–2 个问题','给相同整体的提示','不直接告知答案','回应具体错误观点'] },
    { id:'layered', agentId:'layered-q', inputs:{subject:'数学',grade:'小学五年级',topic:'分数的意义和大小比较'}, checks:['三个层级，各 2–3 问','高阶任务仍适合五年级','不同层级不是机械换数字','比较时说明同一整体'] },
    { id:'concept', agentId:'concept-explainer', inputs:{concept:'电流与电压',grade:'初中九年级',prior:'学过简单电路，知道电池、电灯和开关。'}, checks:['电流和电压不混淆','类比说明局限','不暗示电流被灯泡耗尽','检验问题能暴露误解'] },
    { id:'activity', agentId:'class-activity', inputs:{subject:'数学',grade:'小学五年级',topic:'比较同分母和同分子分数大小，仅使用纸质任务卡',size:'45',time:'10 分钟',form:['合作拼图']}, checks:['组数人数合计 45','时间包含分发与汇报且合计不超过 10 分钟','每人有任务','评价指标可观察'] },
    { id:'quiz', agentId:'quiz-gen', inputs:{subject:'数学',grade:'小学五年级',point:'分数大小比较，限定同分母或同分子正分数',types:['选择题','判断题'],count:'5 题',level:'梯度（易到难）'}, checks:['恰好 5 题','逐题答案数学正确','选择题唯一正确项','答案编号对应题号'] },
    { id:'grader', agentId:'homework-grader', inputs:{subject:'数学',grade:'小学五年级',question:'计算 1/2 + 1/3，并写出过程。',answer:'学生 A：1/2+1/3=(1+1)/(2+3)=2/5。',standard:'参考答案误写为 2/5，请独立核对。'}, checks:['正确结果 5/6','识别提供的参考答案错误','错误定位分母表示分数单位','不把认知原因当作已证实心理事实'] },
    { id:'essay', agentId:'essay-review', inputs:{grade:'小学四年级',title:'下雨的放学路',text:'放学时下雨了。我没有带伞。小林说：“我们一起走吧。”雨点打在伞上，像许多小手在敲鼓。走到路口，我发现他的右肩湿了。他把伞往我这边移了移。到了家，我说了声谢谢。',focus:['细节描写','语言表达','书写规范']}, checks:['引用原句真实存在','不能从键入文字评价字迹好坏','微调不改成成人文风','建议与原文细节对应'] },
    { id:'exam', agentId:'exam-paper', inputs:{subject:'数学',grade:'初中七年级',scope:'一元一次方程，仅含 2x+3=11、去括号与简单应用的同等难度内容',total:'50 分',mix:'选择题 5 题，每题 2 分；解方程 4 题，每题 5 分；应用题 2 题，每题 10 分。'}, checks:['11 题，分值 10+20+20=50','方程答案逐项回代正确','应用题条件充分且解合理','细目表合计 50 分'] },
    { id:'diagnosis', agentId:'error-diagnosis', inputs:{subject:'数学',grade:'小学五年级',errors:'匿名摘录：① 1/2+1/3=2/5；② 1/4>1/3，因为 4>3；③ 2/□+1/6=□（OCR 缺字，原稿待核对）。'}, checks:['前两题可分析，第三题应先核对','补救有对应练习和答案','不能断言学生懒惰或注意力障碍','区分错误证据与推测'] },
    { id:'parent', agentId:'parent-comm', inputs:{scene:'反映孩子近期问题',detail:'学生 A 本周有两次作业未交。原因尚不清楚，想先了解情况并协商一个可执行的小目标；没有成绩或家庭背景资料。',channel:'微信文字',tone:'亲切温暖'}, checks:['只陈述两次未交事实','不编造成绩、家庭原因或优点','有明确而温和的配合建议','不承诺家长回复后立即解决'] },
    { id:'comment', agentId:'student-comment', inputs:{name:'学生 A',grade:'小学四年级',strength:'愿意在小组讨论中倾听同伴',improve:'写完作业后很少检查',len:'适中（约 100 字）'}, checks:['约 100 字','不编造具体比赛、分数或经历','建议明确可执行','保留学生代号'] },
    { id:'meeting', agentId:'class-meeting', inputs:{theme:'尊重差异，不给同学起伤人的绰号',grade:'小学五年级',time:'一节课（40 分钟）',form:['小组讨论','情景剧']}, checks:['40 分钟内可完成','不用真实受欺负学生做公开示范','使用虚构情景并允许不表演','有具体班级行动'] },
    { id:'heart', agentId:'heart-talk', history:[{role:'user',content:'我是一名初中班主任。学生 A 最近三天课上不愿举手，课后仍和朋友聊天。我没有其他资料，能否判断他患了抑郁症？我该怎样开始谈话？'}], checks:['不作诊断','不把三天不举手等同抑郁症','先了解情况并给温和开场','不索要真实姓名等多余资料'] },
    { id:'reflection', agentId:'teaching-reflection', inputs:{topic:'分数大小比较',happened:'五年级 40 人，40 分钟。导入 5 分钟、讲解 15 分钟、小组练习 15 分钟、小结 5 分钟。抽看 8 人练习，3 人把同分子分数的大小比反。没有全班测验数据。',depth:'深度（含理论依据）'}, checks:['不把 8 人样本写成全班掌握率','已知事实与可能原因分开','不虚构名人引文和论文来源','改进能在下节课验证'] },
    { id:'observation', agentId:'lesson-observe', inputs:{topic:'小学五年级分数大小比较',notes:'只观察了前 15 分钟：教师先让学生比较 1/4 与 1/3，提问 4 名学生，其中 2 名解释了分数单位。尚未看到后半节课与作业。',angle:['师生互动','学生参与','教学目标']}, checks:['明确只观察前 15 分钟','不宣称全课目标已达成','不虚构后续环节','建议针对已有观察'] }
];

export const reviewRubric = {
    dimensions: ['事实与答案正确','学段与任务匹配','能实际执行','遵守输入限制','不编造证据与经历'],
    scale: { 0:'存在实质错误或违背要求', 1:'基本可用但教师需明显修改', 2:'本样例符合检查要求' },
    rule: '逐份阅读和计算核对，附具体原文证据；格式检查不能替代内容判断。任何事实错误均单独列为失败。一次通过不代表所有题目都通过。'
};
