'use strict';

(() => {
    const GRADE_LEVEL = Object.freeze({
        '小学一年级': 1, '小学二年级': 2, '小学三年级': 3, '小学四年级': 4, '小学五年级': 5, '小学六年级': 6,
        '初中七年级': 7, '初中八年级': 8, '初中九年级': 9,
        '高中一年级': 10, '高中二年级': 11, '高中三年级': 12
    });

    const SOURCE = Object.freeze({
        title: '2024年义务教育国家课程教学用书目录',
        shortTitle: '教育部2024目录',
        standard: '2022年版义务教育课程标准',
        url: 'https://www.moe.gov.cn/srcsite/A26/s8001/202408/W020250418502592948423.pdf',
        note: '国家目录只能确认版本和适用年级，具体单元顺序仍以学校当学期用书为准。'
    });

    const edition = (id, label, catalog = 'national') => Object.freeze({ id, label, catalog });
    const NATIONAL_UNIFIED = Object.freeze([edition('tongbian-renjiao', '国家统编版（人民教育出版社）')]);
    const SCHOOL_CURRENT = Object.freeze([edition('school-current', '学校现用版本（请按实际教材核对）', 'school')]);
    const OTHER_APPROVED = edition('other-approved', '其他国家审定 / 学校现用版本（请核对封面）', 'school');

    const EDITIONS = Object.freeze({
        primary: Object.freeze({
            '语文': NATIONAL_UNIFIED,
            '政治（道法）': NATIONAL_UNIFIED,
            '数学': Object.freeze([
                edition('renjiao', '人教版'), edition('beishida', '北师大版'), edition('sujiao', '苏教版'),
                edition('beijing', '北京版'), edition('jijiao', '冀教版'), edition('qingdao', '青岛版'), edition('xishida', '西师大版')
            ]),
            '英语': Object.freeze([
                edition('renjiao-pep', '人教PEP版'), edition('renjiao-jingtong', '人教精通版'), edition('waiyan', '外研版'),
                edition('yilin', '译林版'), edition('shangjiao-oxford', '上教牛津版'), edition('jijiao', '冀教版'), edition('beijing', '北京版')
            ]),
            '科学': Object.freeze([
                edition('renjiao-ejiao', '人教·鄂教版'), edition('jiaoke', '教科版'), edition('sujiao', '苏教版'),
                edition('daxiang', '大象版'), edition('yuejiao-yueke', '粤教·粤科版'), edition('jiren', '冀人版'),
                edition('xiangke', '湘科版'), edition('qingdao', '青岛版')
            ]),
            '音乐': SCHOOL_CURRENT, '美术': SCHOOL_CURRENT, '体育': SCHOOL_CURRENT,
            '信息技术': SCHOOL_CURRENT, '综合实践': SCHOOL_CURRENT
        }),
        junior: Object.freeze({
            '语文': NATIONAL_UNIFIED, '政治（道法）': NATIONAL_UNIFIED, '历史': NATIONAL_UNIFIED,
            '数学': Object.freeze([
                edition('renjiao', '人教版'), edition('beishida', '北师大版'), edition('huashida', '华师大版'),
                edition('beijing', '北京版'), edition('jijiao', '冀教版'), edition('xiangjiao', '湘教版'),
                edition('suke', '苏科版'), edition('qingdao', '青岛版'), edition('huke', '沪科版'), edition('zhejiao', '浙教版')
            ]),
            '英语': Object.freeze([
                edition('renjiao', '人教版'), edition('waiyan', '外研版'), edition('yilin', '译林牛津版'),
                edition('shangjiao-oxford', '上教牛津版'), edition('jijiao', '冀教版'), edition('beijing', '北京版'), edition('renai', '仁爱版')
            ]),
            '物理': Object.freeze([
                edition('renjiao', '人教版'), edition('beishida', '北师大版'), edition('beijing', '北京版'),
                edition('suke', '苏科版'), edition('jiaoke', '教科版'), edition('huke', '沪科版'), edition('huyue', '沪粤版')
            ]),
            '化学': Object.freeze([
                edition('renjiao', '人教版'), edition('beijing', '北京版'), edition('keyue', '科粤版'),
                edition('renai-kepu', '仁爱科普版'), edition('lujiao', '鲁教版'), edition('shangjiao', '上教版')
            ]),
            '生物': Object.freeze([
                edition('renjiao', '人教版'), edition('sujiao', '苏教版'), edition('beishida', '北师大版'), edition('jinan', '济南版')
            ]),
            '地理': Object.freeze([
                edition('renjiao', '人教版'), edition('xiangjiao', '湘教版'), edition('zhongtu', '中图版'),
                edition('shangwuxingqiu', '商务星球版'), edition('jinjiao', '晋教版')
            ]),
            '科学': Object.freeze([edition('zhejiao', '浙教版'), edition('huashida', '华师大版'), edition('wuhan', '武汉版')]),
            '音乐': SCHOOL_CURRENT, '美术': SCHOOL_CURRENT, '体育': SCHOOL_CURRENT,
            '信息技术': SCHOOL_CURRENT, '综合实践': SCHOOL_CURRENT
        }),
        high: Object.freeze({
            '语文': NATIONAL_UNIFIED, '政治（道法）': NATIONAL_UNIFIED, '历史': NATIONAL_UNIFIED,
            '数学': Object.freeze([edition('renjiao-a', '人教A版', 'school'), edition('renjiao-b', '人教B版', 'school'), edition('beishida', '北师大版', 'school'), edition('sujiao', '苏教版', 'school'), edition('xiangjiao', '湘教版', 'school')]),
            '英语': Object.freeze([edition('renjiao', '人教版', 'school'), edition('waiyan', '外研版', 'school'), edition('yilin', '译林版', 'school'), edition('beishida', '北师大版', 'school'), edition('shangjiao', '上教版', 'school')]),
            '物理': Object.freeze([edition('renjiao', '人教版', 'school'), edition('jiaoke', '教科版', 'school'), edition('luke', '鲁科版', 'school')]),
            '化学': Object.freeze([edition('renjiao', '人教版', 'school'), edition('luke', '鲁科版', 'school'), edition('sujiao', '苏教版', 'school')]),
            '生物': Object.freeze([edition('renjiao', '人教版', 'school'), edition('sujiao', '苏教版', 'school'), edition('zheke', '浙科版', 'school')]),
            '地理': Object.freeze([edition('renjiao', '人教版', 'school'), edition('xiangjiao', '湘教版', 'school'), edition('zhongtu', '中图版', 'school'), edition('lujiao', '鲁教版', 'school')]),
            '科学': SCHOOL_CURRENT, '音乐': SCHOOL_CURRENT, '美术': SCHOOL_CURRENT,
            '体育': SCHOOL_CURRENT, '信息技术': SCHOOL_CURRENT, '综合实践': SCHOOL_CURRENT
        })
    });

    const SUBJECT_GRADE_RULES = Object.freeze([
        { subject: '物理', min: 8, minGrade: '初中八年级', alternative: '低年级请选“科学”，从声、光、电、力的直观现象入手' },
        { subject: '化学', min: 9, minGrade: '初中九年级', alternative: '低年级请选“科学”，从物质变化、溶解、燃烧、空气和水入手' },
        { subject: '生物', min: 7, minGrade: '初中七年级', alternative: '小学请选“科学”，从植物生长、动物特征或人体健康入手' },
        { subject: '历史', min: 7, minGrade: '初中七年级', alternative: '小学可改为语文阅读、传统文化或综合实践主题' },
        { subject: '地理', min: 7, minGrade: '初中七年级', alternative: '小学可改为科学或综合实践，学习方向、天气和家乡环境' }
    ]);

    const TOPIC_RULES = Object.freeze([
        { pattern: /二次函数|相似三角形|锐角三角函数/, label: '九年级数学内容', subjects: ['数学'], min: 9, minGrade: '初中九年级' },
        { pattern: /一次函数|反比例函数|勾股定理|函数图像|自变量|因变量/, label: '初中函数与几何内容', subjects: ['数学'], min: 8, minGrade: '初中八年级' },
        { pattern: /一元一次方程|二元一次方程|方程组/, label: '初中方程内容', subjects: ['数学'], min: 7, minGrade: '初中七年级' },
        { pattern: /导数|圆锥曲线|空间向量|排列组合|复数|函数极限/, label: '高中数学内容', subjects: ['数学'], min: 10, minGrade: '高中一年级' },
        { pattern: /分数|小数|四则运算|长方形|平行四边形|周长|面积|比例|统计图/, label: '数学内容', subjects: ['数学'] },
        { pattern: /定语从句|状语从句|宾语从句|被动语态/, label: '英语复杂语法', subjects: ['英语'], min: 8, minGrade: '初中八年级' },
        { pattern: /非谓语动词|虚拟语气|倒装句|名词性从句/, label: '高中英语语法', subjects: ['英语'], min: 10, minGrade: '高中一年级' },
        { pattern: /一般现在时|一般过去时|现在进行时|英语阅读|英语写作|自然拼读|音标/, label: '英语内容', subjects: ['英语'] },
        { pattern: /拼音|识字|词语搭配|句子排序|修辞手法|记叙文|说明文|议论文|文言文|古诗词|作文|阅读理解/, label: '语文内容', subjects: ['语文'] },
        { pattern: /欧姆定律|焦耳定律|电阻|串联电路|并联电路|浮力|压强|凸透镜|功率|机械能/, label: '物理内容', subjects: ['物理'], min: 8, minGrade: '初中八年级' },
        { pattern: /简单电路|小灯泡|水的三态|磁铁|声音的产生|光的传播/, label: '科学现象内容', subjects: ['科学', '物理'] },
        { pattern: /离子方程式|物质的量|氧化还原|电化学|有机化学/, label: '高中化学内容', subjects: ['化学'], min: 10, minGrade: '高中一年级' },
        { pattern: /化学方程式|酸碱盐|元素周期表|化学式|溶液|燃烧与灭火/, label: '化学内容', subjects: ['化学'], min: 9, minGrade: '初中九年级' },
        { pattern: /孟德尔|减数分裂|DNA|基因|染色体|遗传规律/, label: '遗传学内容', subjects: ['生物'], min: 8, minGrade: '初中八年级' },
        { pattern: /细胞|光合作用|呼吸作用|生态系统|食物链|人体消化|植物生长/, label: '生命科学内容', subjects: ['生物', '科学'] },
        { pattern: /鸦片战争|辛亥革命|戊戌变法|新航路开辟|秦朝统一|唐朝|宋朝|明清|工业革命|世界大战/, label: '历史内容', subjects: ['历史'], min: 7, minGrade: '初中七年级' },
        { pattern: /经纬网|等高线|气候类型|板块运动|洋流|地形图|中国行政区划|时区|地球公转/, label: '地理内容', subjects: ['地理'], min: 7, minGrade: '初中七年级' },
        { pattern: /依法履行义务|宪法|法治|集体生活|规则意识|社会主义核心价值观/, label: '道德与法治内容', subjects: ['政治（道法）'] },
        { pattern: /通货膨胀|财政政策|货币政策|宏观经济|供求关系/, label: '高中思想政治内容', subjects: ['政治（道法）'], min: 10, minGrade: '高中一年级' },
        { pattern: /Scratch|编程|算法|信息安全|电子表格|人工智能/, label: '信息技术内容', subjects: ['信息技术'] },
        { pattern: /节奏|旋律|民歌|乐器|视唱/, label: '音乐内容', subjects: ['音乐'] },
        { pattern: /色彩|构图|线条|素描|水彩|剪纸/, label: '美术内容', subjects: ['美术'] },
        { pattern: /立定跳远|篮球|足球|短跑|队列队形|体能/, label: '体育内容', subjects: ['体育'] }
    ]);

    function gradeLevel(grade) {
        return GRADE_LEVEL[grade] || 0;
    }

    function stageForGrade(grade) {
        const level = gradeLevel(grade);
        if (!level) return '';
        if (level <= 6) return 'primary';
        if (level <= 9) return 'junior';
        return 'high';
    }

    function getEditions(subject, grade) {
        const stage = stageForGrade(grade);
        const items = EDITIONS[stage]?.[subject] || SCHOOL_CURRENT;
        if (items === SCHOOL_CURRENT || items === NATIONAL_UNIFIED || items.some(item => item.id === OTHER_APPROVED.id)) return items;
        return [...items, OTHER_APPROVED];
    }

    function getVolumes(grade) {
        const stage = stageForGrade(grade);
        if (!stage) return [];
        if (stage === 'high') return ['必修模块', '选择性必修模块', '上册', '下册', '全一册'];
        return ['上册', '下册', '全一册'];
    }

    function getEditionLabel(subject, grade, id) {
        return getEditions(subject, grade).find(item => item.id === id)?.label || id || '';
    }

    function getCoverage(grade) {
        return stageForGrade(grade) === 'high'
            ? { verified: false, label: '高中版本请以学校实际用书为准' }
            : { verified: true, label: '已按教育部2024年义务教育用书目录筛选' };
    }

    function subjectGradeConflict(subject, grade) {
        const level = gradeLevel(grade);
        const rule = SUBJECT_GRADE_RULES.find(item => item.subject === subject && level && level < item.min);
        if (!rule) return null;
        return {
            ok: false,
            status: 'conflict',
            title: '学科与年级冲突',
            message: `「${subject}」通常不早于${rule.minGrade}作为独立学科学习，当前不会继续生成。`,
            toast: '学科和年级不匹配，已停止生成',
            suggestions: [rule.alternative, `如确实要学习「${subject}」，请将年级调整为「${rule.minGrade}」或更高。`]
        };
    }

    function topicConflict(subject, grade, text) {
        const level = gradeLevel(grade);
        const rules = TOPIC_RULES.filter(item => item.pattern.test(text || ''));
        if (!rules.length) return { rule: null, conflict: null };
        const subjectRule = rules.find(item => subject && !item.subjects.includes(subject));
        if (subjectRule) {
            return {
                rule: subjectRule,
                conflict: {
                    ok: false,
                    status: 'conflict',
                    title: '课题与学科冲突',
                    message: `识别到「${subjectRule.label}」，它通常属于${subjectRule.subjects.join(' / ')}，与当前选择的「${subject}」不一致。`,
                    toast: '课题和学科不匹配，已停止生成',
                    suggestions: [`保留当前课题时，请把学科改为「${subjectRule.subjects.join(' / ')}」。`, `保留「${subject}」时，请改用该学科当前教材中的课题。`]
                }
            };
        }
        const gradeRule = rules.find(item => level && item.min && level < item.min);
        if (gradeRule) {
            return {
                rule: gradeRule,
                conflict: {
                    ok: false,
                    status: 'conflict',
                    title: '课题与年级冲突',
                    message: `「${gradeRule.label}」通常不早于${gradeRule.minGrade}系统学习，与当前「${grade}」不匹配。`,
                    toast: '课题和年级不匹配，已停止生成',
                    suggestions: [`保留当前课题时，请将年级调整为「${gradeRule.minGrade}」或更高。`, '保留当前年级时，请改用当册教材中的课题。']
                }
            };
        }
        return { rule: rules[0], conflict: null };
    }

    function analyze(input = {}) {
        const subject = String(input.subject || '').trim();
        const grade = String(input.grade || '').trim();
        const text = String(input.text || '').trim();
        const mode = input.mode === 'custom' ? 'custom' : 'textbook';
        const editionId = String(input.edition || '').trim();
        const volume = String(input.volume || '').trim();
        const confirmed = input.confirmed === true || input.confirmed === 'true';

        if (!subject || !grade || !text) {
            return { ok: true, status: 'waiting', title: '等待完整任务', message: '填写学科、年级和课题后开始校验。', suggestions: [] };
        }
        const gradeConflict = subjectGradeConflict(subject, grade);
        if (gradeConflict) return gradeConflict;
        const topic = topicConflict(subject, grade, text);
        if (topic.conflict) return topic.conflict;

        if (mode === 'custom') {
            return {
                ok: true,
                status: 'custom',
                title: '非教材主题',
                message: '已跳过版本与册次定位，仍会保留学科和年级冲突检查。',
                suggestions: []
            };
        }

        if (!editionId || !volume) {
            return {
                ok: false,
                status: 'needs_details',
                title: '请补全教材身份',
                message: '教材同步模式需要选择版本和册次，防止把其他版本或学期的内容混入结果。',
                toast: '请先选择教材版本和册次',
                suggestions: ['按学校实际使用的教材封面选择版本。', '无法确定时，可改为“非教材主题”，或向备课组确认后再生成。']
            };
        }

        const editionLabel = getEditionLabel(subject, grade, editionId);
        const coverage = getCoverage(grade);
        const selectedEdition = getEditions(subject, grade).find(item => item.id === editionId);
        const needsHumanConfirmation = !topic.rule || !coverage.verified || selectedEdition?.catalog === 'school';
        if (needsHumanConfirmation && !confirmed) {
            return {
                ok: false,
                status: 'needs_confirmation',
                title: '请核对当册目录',
                message: `已定位为「${grade}·${subject}·${editionLabel}·${volume}」，但公开国家目录不含每册课题全文，暂时不能自动确认它就在当册。`,
                toast: '当前课题需要教师核对后再生成',
                suggestions: ['请查看手边教材目录，确认课题属于当前版本和册次后勾选确认。', '如果是跨学科、校本或拓展主题，请切换为“非教材主题”。']
            };
        }

        return {
            ok: true,
            status: topic.rule && coverage.verified && selectedEdition?.catalog !== 'school' ? 'aligned' : 'confirmed',
            title: topic.rule ? '课程范围已对齐' : '已由教师确认',
            message: topic.rule
                ? `学科、年级与「${topic.rule.label}」无明显冲突；生成时将锁定「${editionLabel}·${volume}」。`
                : `已记录教师对「${editionLabel}·${volume}」的核对结果。`,
            suggestions: []
        };
    }

    const api = Object.freeze({
        source: SOURCE,
        gradeLevel,
        stageForGrade,
        getEditions,
        getVolumes,
        getEditionLabel,
        getCoverage,
        analyze
    });

    if (typeof window !== 'undefined') window.TextbookCatalog = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
