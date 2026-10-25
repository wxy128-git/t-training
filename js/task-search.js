(function (root) {
    // User-facing tasks, independent of persona names and model instructions.
    const tasks = Object.freeze({
        'lesson-design': {title:'备一节课', output:'教案初稿'},
        'courseware-outline': {title:'制作课件大纲', output:'课件大纲'},
        'micro-script': {title:'写微课脚本', output:'微课脚本'},
        'lesson-hook': {title:'设计新课导入', output:'课堂导入方案'},
        'socratic': {title:'练习启发式提问', output:'提问对话'},
        'layered-q': {title:'设计课堂提问', output:'分层问题链'},
        'concept-explainer': {title:'讲清一个概念', output:'概念讲解'},
        'class-activity': {title:'设计课堂活动', output:'课堂活动方案'},
        'quiz-gen': {title:'出一份练习', output:'练习初稿'},
        'homework-grader': {title:'批改作业', output:'批改建议'},
        'essay-review': {title:'评改作文', output:'作文评改建议'},
        'exam-paper': {title:'组一份试卷', output:'试卷初稿'},
        'error-diagnosis': {title:'分析学生错题', output:'错因诊断'},
        'parent-comm': {title:'准备家校沟通', output:'沟通话术'},
        'student-comment': {title:'写学生评语', output:'学生评语'},
        'class-meeting': {title:'设计主题班会', output:'班会方案'},
        'heart-talk': {title:'准备学生谈心', output:'谈心建议'},
        'teaching-reflection': {title:'写教学反思', output:'教学反思初稿'},
        'lesson-observe': {title:'整理听评课记录', output:'听评课记录'}
    });
    const aliases = {
        'lesson-design': ['教案', '备课', '教学设计', '设计一节课'],
        'courseware-outline': ['课件', 'ppt', '演示稿', '幻灯片'],
        'micro-script': ['微课', '讲解脚本', '教学视频'],
        'lesson-hook': ['导入', '开场', '引入新课'],
        'socratic': ['苏格拉底', '追问', '启发思考'],
        'layered-q': ['分层提问', '课堂提问', '问题链'],
        'concept-explainer': ['概念', '解释', '讲清', '通俗'],
        'class-activity': ['小组活动', '课堂活动', '分组讨论', '合作学习', '教学活动'],
        'quiz-gen': ['练习', '出题', '测验', '习题'],
        'homework-grader': ['批改作业', '作业批改', '作业反馈'],
        'essay-review': ['作文', '习作', '评改'],
        'exam-paper': ['试卷', '组卷', '考试'],
        'error-diagnosis': ['错题', '错误分析', '薄弱点'],
        'parent-comm': ['家长', '家校', '通知', '沟通'],
        'student-comment': ['评语', '期末评价', '学生评价'],
        'class-meeting': ['班会', '主题教育'],
        'heart-talk': ['谈心', '倾听', '情绪'],
        'teaching-reflection': ['反思', '教学总结'],
        'lesson-observe': ['听课', '评课', '课堂观察']
    };
    function score(agent, query) {
        const q = String(query || '').trim().toLowerCase();
        if (!q) return 1;
        const text = [agent.name, agent.tagline, agent.desc, agent.keywords].join(' ').toLowerCase();
        if (text.includes(q)) return 100 + q.length;
        const matched = (aliases[agent.id] || []).filter(word => q.includes(word) || (q.length >= 2 && word.includes(q)));
        if (matched.length) return 20 + Math.max(...matched.map(word => word.length));
        const core = q.replace(/请|帮我|帮忙|我想|我要|需要|设计|生成|制作|一场|一份|一个|一些|怎样|怎么|如何|的|吧|一下/g, '').trim();
        return core.length >= 2 && text.includes(core) ? 10 : 0;
    }
    root.TaskSearch = { score, tasks };
})(globalThis);
