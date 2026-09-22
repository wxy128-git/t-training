(function (root) {
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
    root.TaskSearch = { score };
})(globalThis);
