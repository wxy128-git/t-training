/* ===================================================================
   课程匹配守卫（浏览器与服务端共用）
   - 只处理能够确定的课程事实；未知内容返回 unknown，绝不默认放行
   - 一个概念可以有多个学科落点，例如小学科学与初中生物的“光合作用”
   - 服务端会对 ambiguous / unknown 再做一次独立语义分类
   =================================================================== */
(function initCurriculumGuard(root) {
    'use strict';

    const GRADE_LEVEL = Object.freeze({
        '小学一年级': 1, '小学二年级': 2, '小学三年级': 3, '小学四年级': 4,
        '小学五年级': 5, '小学六年级': 6, '初中七年级': 7, '初中八年级': 8,
        '初中九年级': 9, '高中一年级': 10, '高中二年级': 11, '高中三年级': 12
    });

    const GRADE_NAMES = Object.freeze(Object.fromEntries(
        Object.entries(GRADE_LEVEL).map(([name, level]) => [level, name])
    ));

    const SUBJECT_ALIASES = Object.freeze({
        语文: '语文', 数学: '数学', 英语: '英语', English: '英语',
        物理: '物理', 化学: '化学', 生物: '生物', 生物学: '生物',
        历史: '历史', 地理: '地理', 科学: '科学', 音乐: '音乐', 美术: '美术',
        体育: '体育', 信息技术: '信息技术', 信息科技: '信息技术',
        道法: '政治（道法）', 道德与法治: '政治（道法）', 政治: '政治（道法）',
        '政治（道法）': '政治（道法）', 综合实践: '综合实践'
    });

    const SUBJECT_GRADE_RULES = Object.freeze([
        { subject: '物理', minLevel: 8, fallback: '科学', scope: '声、光、电、力等可观察现象' },
        { subject: '化学', minLevel: 9, fallback: '科学', scope: '物质变化、溶解、燃烧、空气和水等现象' },
        { subject: '生物', minLevel: 7, fallback: '科学', scope: '植物生长、动物特征和人体健康等主题' },
        { subject: '历史', minLevel: 7, fallback: '语文 / 综合实践', scope: '历史故事、传统文化或主题活动' },
        { subject: '地理', minLevel: 7, fallback: '科学 / 综合实践', scope: '地图方向、家乡环境和天气观察' }
    ]);

    const p = (subject, minLevel, extra = {}) => Object.freeze({ subject, minLevel, ...extra });
    const concept = (id, label, pattern, placements, priority = 100) => Object.freeze({
        id, label, pattern, placements: Object.freeze(placements), priority
    });

    const CONCEPTS = Object.freeze([
        concept('math-linear-equation', '一元一次方程', /一元一次方程|解一元一次方程/, [p('数学', 7)]),
        concept('math-linear-system', '二元一次方程（组）', /二元一次方程|二元一次方程组/, [p('数学', 7)]),
        concept('math-quadratic', '二次函数', /二次函数|抛物线的顶点|二次函数图像/, [p('数学', 9)]),
        concept('math-middle-geometry', '初中几何', /勾股定理|相似三角形|锐角三角函数|全等三角形/, [p('数学', 8)]),
        concept('math-high-school', '高中数学内容', /导数|函数极限|等差数列|等比数列|圆锥曲线|空间向量|复数|立体几何/, [p('数学', 10)]),
        concept('math-function', '函数', /函数|自变量|因变量|函数图像|一次函数|正比例函数|反比例函数/, [p('数学', 8)], 70),
        concept('math-fraction', '分数', /分数的初步认识|分数意义|分数加减|分数乘除/, [p('数学', 3)]),
        concept('math-arithmetic', '小学数与运算', /20以内加减法|百以内加减法|乘法口诀|多位数乘法|小数乘法|小数除法/, [p('数学', 1)]),
        concept('math-negative', '负数', /负数的认识|正数和负数|有理数/, [p('数学', 6)]),

        concept('chinese-pinyin', '汉语拼音与识字', /汉语拼音|拼音复习|声母|韵母|整体认读音节|识字写字|偏旁部首/, [p('语文', 1)]),
        concept('chinese-reading', '语文阅读与表达', /课文理解|句子排序|看图写话|阅读理解|修辞手法|病句|记叙文|说明文/, [p('语文', 1)]),
        concept('chinese-classical', '文言文阅读', /文言文|实词虚词|文言翻译|古文翻译/, [p('语文', 7)]),
        concept('chinese-argument', '议论文写作', /议论文|论点论据|论证方法|驳论文/, [p('语文', 8)]),
        concept('chinese-gaokao', '高中作文要求', /高考作文|任务驱动型作文|思辨性作文/, [p('语文', 10)]),

        concept('english-basic', '英语基础语言运用', /英语字母|自然拼读|phonics|一般现在时|现在进行时|颜色词|购物对话/i, [p('英语', 3)]),
        concept('english-middle', '初中英语语法', /现在完成时|被动语态|宾语从句|定语从句|过去完成时/, [p('英语', 8)]),
        concept('english-high', '高中英语语法', /虚拟语气|非谓语动词|倒装句|强调句|同位语从句/, [p('英语', 10)]),

        concept('science-photosynthesis', '光合作用', /光合作用/, [p('科学', 3, { typicalMaxLevel: 6 }), p('生物', 7)]),
        concept('science-cells', '细胞结构', /细胞结构|细胞膜|细胞质|细胞核|动植物细胞/, [p('科学', 5, { typicalMaxLevel: 6 }), p('生物', 7)]),
        concept('science-genetics', '遗传与变异', /遗传与变异|基因|DNA|孟德尔|伴性遗传/, [p('生物', 8)]),
        concept('science-ecology', '生态系统', /生态系统|食物链|食物网|生物多样性/, [p('科学', 4, { typicalMaxLevel: 6 }), p('生物', 7)]),

        concept('physics-circuit', '电路', /简单电路|串联电路|并联电路|欧姆定律|电功率|电流与电压/, [p('科学', 3, { typicalMaxLevel: 6 }), p('物理', 8)]),
        concept('physics-mechanics', '力与运动', /摩擦力|浮力|牛顿第[一二三]定律|功和机械能|速度计算/, [p('物理', 8)]),
        concept('physics-optics', '声光现象', /光的反射|光的折射|透镜成像|声音的产生|声现象/, [p('科学', 3, { typicalMaxLevel: 6 }), p('物理', 8)]),

        concept('chemistry-equation', '化学方程式', /化学方程式|化学方程式配平|质量守恒定律|相对分子质量/, [p('化学', 9)]),
        concept('chemistry-acid-base', '酸碱盐', /酸碱盐|酸和碱|pH|中和反应|离子反应/, [p('化学', 9)]),
        concept('chemistry-periodic', '元素与物质结构', /元素周期表|原子结构|分子和原子|化学键/, [p('化学', 9)]),

        concept('history-qin', '秦朝统一', /秦朝统一|秦始皇|统一六国/, [p('历史', 7)]),
        concept('history-opium-war', '鸦片战争', /鸦片战争|南京条约|林则徐虎门销烟/, [p('历史', 8)]),
        concept('history-world', '世界近代史', /新航路开辟|工业革命|法国大革命|文艺复兴/, [p('历史', 9)]),

        concept('geography-map', '地图与等高线', /等高线|经纬网|比例尺|地形图|中国行政区划/, [p('地理', 7)]),
        concept('geography-climate', '天气与气候', /气候类型|季风气候|天气和气候|气温曲线|降水量柱状图/, [p('科学', 3, { typicalMaxLevel: 6 }), p('地理', 7)]),

        concept('civics-rule', '规则、权利与义务', /规则意识|权利与义务|依法履行义务|集体生活|法治意识/, [p('政治（道法）', 7)]),
        concept('civics-economy', '高中经济与社会', /通货膨胀|通货紧缩|财政政策|货币政策|宏观经济|供求关系/, [p('政治（道法）', 10)]),
        concept('career-high-school', '高中升学与生涯规划', /高考备考|高考冲刺|新高考|选科|生涯规划|职业规划|升学规划/, [p('综合实践', 10), p('政治（道法）', 10)]),

        concept('it-programming', '程序设计', /Scratch|编程|算法|循环结构|条件判断|Python/i, [p('信息技术', 3)]),
        concept('art-color', '美术造型与色彩', /色彩冷暖|线条表现|构图|素描|水彩/, [p('美术', 1)]),
        concept('music-rhythm', '音乐节奏与旋律', /节奏型|民歌欣赏|旋律进行|五线谱|简谱/, [p('音乐', 1)]),
        concept('pe-sports', '体育运动技能', /立定跳远|篮球运球|足球传球|安全运动|耐久跑/, [p('体育', 1)])
    ]);

    const GUARDED_AGENT_IDS = Object.freeze([
        'lesson-design', 'courseware-outline', 'micro-script', 'lesson-hook',
        'layered-q', 'concept-explainer', 'class-activity', 'quiz-gen',
        'homework-grader', 'exam-paper', 'error-diagnosis'
    ]);

    function normalizeSubject(value) {
        const raw = String(value || '').trim();
        return SUBJECT_ALIASES[raw] || raw;
    }

    function gradeLevel(value) {
        if (Number.isInteger(value) && value >= 1 && value <= 12) return value;
        const raw = String(value || '').replace(/\s+/g, '');
        if (GRADE_LEVEL[raw]) return GRADE_LEVEL[raw];
        const token = raw.match(/(?:小学|初中|高中)?([一二三四五六七八九]|1[0-2]|[1-9])年级/)?.[1];
        const number = Number(token) || ({ 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }[token] || 0);
        if (number) return number;
        return 0;
    }

    function gradeName(level) {
        return GRADE_NAMES[level] || '';
    }

    function result(status, details = {}) {
        return Object.freeze({
            ok: status === 'aligned',
            status,
            title: status === 'aligned' ? '课程匹配通过' : (status === 'conflict' ? '参数需要调整' : '课程归属需要确认'),
            message: '',
            suggestions: [],
            detectedSubjects: [],
            ...details
        });
    }

    function analyze(input = {}) {
        const subject = normalizeSubject(input.subject);
        const grade = String(input.grade || '').trim();
        const level = gradeLevel(grade);
        const text = String(input.text || '').trim().slice(0, 12000);

        if (!text) {
            return result('unknown', {
                message: '没有可用于判断课程归属的课题或知识点。',
                suggestions: ['请补充具体课题、知识点或题目内容后再生成。']
            });
        }

        const independentRule = SUBJECT_GRADE_RULES.find(item => item.subject === subject && level && level < item.minLevel);
        if (independentRule) {
            const minGrade = gradeName(independentRule.minLevel);
            return result('conflict', {
                message: `「${subject}」通常不早于${minGrade}作为独立学科学习，和${grade}不匹配。`,
                suggestions: [
                    `面向${grade}时，可改用「${independentRule.fallback}」并聚焦${independentRule.scope}。`,
                    `若要保留「${subject}」，请把年级改为${minGrade}或更高。`
                ],
                detectedSubjects: [subject],
                minGrade
            });
        }

        const matches = CONCEPTS.filter(item => {
            item.pattern.lastIndex = 0;
            return item.pattern.test(text);
        });
        if (!matches.length) {
            return result('unknown', {
                message: '本地课程知识库尚不能可靠判断这个内容，不能据此直接放行。',
                suggestions: ['系统将提交服务端做独立语义判断；如果仍无法确认，会停止生成并请你补充信息。']
            });
        }

        const highestPriority = Math.max(...matches.map(item => item.priority));
        const decisive = matches.filter(item => item.priority === highestPriority);
        const detectedSubjects = [...new Set(decisive.flatMap(item => item.placements.map(item => item.subject)))];
        const matchedLabels = decisive.map(item => item.label);

        if (decisive.length > 1) {
            const subjectGroups = decisive.map(item => item.placements.map(place => place.subject).sort().join('|'));
            if (new Set(subjectGroups).size > 1) {
                return result('ambiguous', {
                    message: `输入同时涉及${matchedLabels.join('、')}，无法把它当作一个单一课程任务直接生成。`,
                    suggestions: ['请一次只填写一个明确知识点，或说明本次跨学科任务的主学科。'],
                    detectedSubjects,
                    matchedConcepts: matchedLabels
                });
            }
        }

        const placements = decisive.flatMap(item => item.placements.map(place => ({ ...place, concept: item.label })));
        const subjectPlacements = subject ? placements.filter(item => item.subject === subject) : placements;
        if (subject && !subjectPlacements.length) {
            return result('conflict', {
                message: `「${matchedLabels.join('、')}」属于${detectedSubjects.join(' / ')}相关内容，不属于所选的${subject}学科。`,
                suggestions: [
                    `将学科改为「${detectedSubjects.join(' / ')}」，或把知识点改为${subject}课程内容。`,
                    '如果这是跨学科任务，请在输入中明确主学科和跨学科目标。'
                ],
                detectedSubjects,
                matchedConcepts: matchedLabels
            });
        }

        let compatiblePlacements = subjectPlacements;
        if (level) {
            compatiblePlacements = subjectPlacements.filter(item => level >= item.minLevel);
            if (!compatiblePlacements.length) {
                const minLevel = Math.min(...subjectPlacements.map(item => item.minLevel));
                const minGrade = gradeName(minLevel);
                return result('conflict', {
                    message: `「${matchedLabels.join('、')}」通常不早于${minGrade}系统学习，和${grade}不匹配。`,
                    suggestions: [
                        `将年级改为${minGrade}或更高。`,
                        `若面向${grade}，请改为相关前置经验或更基础的知识点。`
                    ],
                    detectedSubjects,
                    matchedConcepts: matchedLabels,
                    minGrade
                });
            }
        }

        const likelyPlacements = !subject && level
            ? compatiblePlacements.filter(item => !item.typicalMaxLevel || level <= item.typicalMaxLevel)
            : compatiblePlacements;
        if (!subject && level && !likelyPlacements.length) {
            return result('unknown', {
                message: `「${matchedLabels.join('、')}」在${grade}没有唯一、稳定的学科落点，不能自动放行。`,
                suggestions: ['请补充本校使用的主学科；系统也会在服务端继续核对课程归属。'],
                detectedSubjects,
                matchedConcepts: matchedLabels
            });
        }
        const likelySubjects = [...new Set((likelyPlacements.length ? likelyPlacements : compatiblePlacements).map(item => item.subject))];
        if (!subject && likelySubjects.length > 1) {
            return result('ambiguous', {
                message: `「${matchedLabels.join('、')}」可能出现在${likelySubjects.join(' / ')}等课程中，当前信息不足以确定主学科。`,
                suggestions: ['请补充主学科；系统也会在服务端结合年级和完整输入继续判断。'],
                detectedSubjects: likelySubjects,
                matchedConcepts: matchedLabels
            });
        }

        const chosen = (likelyPlacements.length ? likelyPlacements : compatiblePlacements)[0];
        return result('aligned', {
            message: `已识别为${(subject || chosen?.subject || detectedSubjects[0])}课程中的「${matchedLabels.join('、')}」，与${grade || '当前学段'}没有发现冲突。`,
            detectedSubjects: subject ? [subject] : likelySubjects,
            matchedConcepts: matchedLabels,
            minGrade: gradeName(chosen?.minLevel)
        });
    }

    root.CurriculumGuard = Object.freeze({
        GRADE_LEVEL,
        GUARDED_AGENT_IDS,
        analyze,
        gradeLevel,
        gradeName,
        normalizeSubject
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);
