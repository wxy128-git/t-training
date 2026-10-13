/* 可在浏览器与 Node 中运行的科研工具纯函数。 */
(function (root) {
    const FOCUS = '## 研究问题聚焦结果', TITLES = '## 五种结构的标题';
    const KEYS = ['citation','question','sample','method','viewpoints','findings','keyReferences','limitations','relevance','verdict','sources','unclear'];
    const SOURCE_KEYS = ['question','sample','method','viewpoints','findings','keyReferences','limitations'];
    const LABELS = ['文献信息','研究问题','对象与情境','研究方法','核心观点','主要结论','关键引用','局限','与我的研究的关系','一句话评价'];
    const MISSING = '原文未明确';
    function truncateText(text, max = 60000) {
        text = String(text || '');
        let end = Math.max(0, max);
        if (text.length > end && /[\uD800-\uDBFF]/.test(text[end - 1] || '')) end--;
        return { text: text.slice(0, end), truncated: text.length > max };
    }
    const clean = v => truncateText(typeof v === 'string' ? v.replace(/[\r\n]+/g, ' ').trim() : '', 600).text;
    const list = v => Array.isArray(v) ? v.map(clean).filter(Boolean).slice(0, 12) : [];
    const object = v => v && typeof v === 'object' && !Array.isArray(v);
    function detectFunnelPhase(history = []) {
        const assistants = history.filter(h => h.role === 'assistant');
        const { round } = funnelProgress(history);
        const latest = assistants.at(-1)?.content || '';
        const phase = latest.includes(TITLES) ? 'titles'
            : latest.includes(FOCUS) ? 'focused'
            : history.some(h => h.role === 'user') ? 'probing' : 'start';
        return { phase, round };
    }
    function extractFunnelResult(history = []) {
        let focus = '', titles = '';
        for (const h of history.filter(h => h.role === 'assistant')) {
            const f = h.content.indexOf(FOCUS), t = h.content.indexOf(TITLES);
            if (f >= 0) { focus = h.content.slice(f, t > f ? t : undefined).trim(); titles = ''; }
            if (t >= 0) titles = h.content.slice(t).trim();
        }
        const question = focus.match(/研究问题[（(]疑问句[）)][*]*[：:][*]*\s*(.+)/)?.[1]?.replace(/\*\*/g, '').trim() || '';
        return { focus, titles, question };
    }
    function funnelProgress(history = []) {
        // Count before truncation. A new cycle reuses facts from the last result.
        const anchor = history.findLastIndex(h => h.role === 'assistant' && (h.content.includes(FOCUS) || h.content.includes(TITLES)));
        const round = history.slice(anchor + 1).filter(h => h.role === 'assistant' && h.content.trim()).length;
        return { round, mode: anchor >= 0 && round === 0 ? 'followup' : round >= 6 ? 'focus' : 'probe' };
    }
    function buildFunnelMessages(system, history) {
        const progress = funnelProgress(history);
        const task = progress.mode === 'focus'
            ? '本次回复必须直接输出阶段二“## 研究问题聚焦结果”，不得再追问。只依据已有信息，缺失条件标为“待核实”；不能为完成聚焦虚构事实。此任务优先于阶段一的单问句约束。'
            : progress.mode === 'followup'
            ? '已有聚焦或标题结果，按教师本次意愿生成标题、修订问题或重新澄清，不自动重复输出聚焦。重新澄清时复用全部已知信息，按初版六个维度的顺序补齐尚未回答的内容，最多追问 6 轮。'
            : '按初版顺序依次核对：①具体现象；②涉及对象；③发生情境；④教师最想改变什么；⑤可观察的变化迹象；⑥教师能投入的时间、班级或协作条件。已回答的维度直接跳过，只问顺序中最早尚未覆盖的一项，一轮只索取其中一项信息。六项全部覆盖或教师要求直接总结时立即聚焦；否则继续下一项追问，最多提出 6 次追问。不得因第 5 次追问即将到来而提前收束或跳过尚未回答的维度。';
        const guidedSystem = `${system}\n\n【本次回复任务与轮次控制】\n当前聚焦周期已经提出 ${progress.round} 次追问，教师最新消息见对话末尾。${task}`;
        let selected = history;
        if (history.length > 29) {
            // Reserve anchors for the original concern and latest focus, plus recent exchanges.
            const indices = new Set(Array.from({length:27}, (_, i) => history.length - 27 + i));
            const first = history.findIndex(h => h.role === 'user');
            const focus = history.findLastIndex(h => h.role === 'assistant' && h.content.includes(FOCUS));
            if (first >= 0) indices.add(first);
            if (focus >= 0) indices.add(focus);
            selected = [...indices].sort((a,b) => a-b).map(i => history[i]);
        }
        return [{ role: 'system', content: guidedSystem }, ...selected.map(({role, content}) => ({ role, content }))];
    }
    function parseReadingCard(raw) {
        let data;
        try {
            const text = String(raw).replace(/```(?:json)?/gi, '').replace(/```/g, '');
            data = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
            if (!object(data)) return null;
        } catch { return null; }
        const warnings = new Set(), card = {};
        const missing = key => { warnings.add(key); return MISSING; };
        const str = (v, key) => clean(v) || missing(key);
        for (const key of KEYS) {
            if (key === 'citation') {
                const c = object(data.citation) ? data.citation : {};
                card.citation = Object.fromEntries(['authors','year','title','journal'].map(k => [k, str(c[k], key)]));
                const value = clean(c.isCore);
                card.citation.isCore = /非|否/.test(value) ? '否' : /是|核心/.test(value) ? '是' : '未知';
                if (!value) warnings.add(key);
            } else if (['question','sample','method','verdict'].includes(key)) card[key] = str(data[key], key);
            else if (key === 'sources') {
                const s = object(data.sources) ? data.sources : {};
                card.sources = Object.fromEntries(SOURCE_KEYS.map(k => [k, str(s[k], key)]));
            } else if (key === 'relevance') {
                const r = object(data.relevance) ? data.relevance : {};
                card.relevance = Object.fromEntries(['borrow','challenge','gap'].map(k => {
                    if (!Array.isArray(r[k])) warnings.add(key);
                    return [k, list(r[k])];
                }));
            } else {
                if (!Array.isArray(data[key])) warnings.add(key);
                card[key] = list(data[key]);
            }
        }
        card.unclear = [...new Set([...card.unclear.filter(k => KEYS.includes(k)), ...warnings])];
        return { card, warnings: [...warnings] };
    }
    const joined = v => Array.isArray(v) ? (v.join('；') || MISSING) : String(v || MISSING);
    function citationText(c) { return `${c.authors}（${c.year}）${c.title} · ${c.journal} · ${c.isCore === '是' ? '核心' : c.isCore === '否' ? '非核心' : '未知'}`; }
    function cardRows(card) {
        const values = [citationText(card.citation), card.question, card.sample, card.method, ...['viewpoints','findings','keyReferences','limitations'].map(k => joined(card[k])),
            ['borrow','challenge','gap'].map((k,i) => `${['可借鉴','可质疑','留下的空白'][i]}：${joined(card.relevance[k])}`).join('；'), card.verdict];
        const keys = ['citation','question','sample','method','viewpoints','findings','keyReferences','limitations','relevance','verdict'];
        return LABELS.map((label,i) => ({ label, key: keys[i], value: values[i], source: card.unclear.includes(keys[i]) ? '未给出' : card.sources[keys[i]] || '教师核对 / 改写' }));
    }
    const md = v => String(v).replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
    function cardToMarkdown(card, { question = '', copy = {} } = {}) {
        const prose = value => Array.isArray(value) ? (value.length ? value : [MISSING]).map(v => `- ${md(v)}`).join('\n') : String(value || MISSING).split(/[；;]/).map(v => v.trim()).filter(Boolean).map((v,i,a) => `${a.length>1?'- ':''}${md(v)}`).join('\n');
        const names = ['cardCitation','cardQuestion','cardSample','cardMethod','cardViewpoints','cardFindings','cardReferences','cardLimitations','cardRelevance','cardVerdict'];
        const relationNames = ['relationBorrow','relationChallenge','relationGap'];
        return `# ${md(card.citation.title)}\n\n**${copy.cardCitation || LABELS[0]}**：${md(citationText(card.citation))}\n\n**${copy.myQuestion || '我的研究问题'}**：${md(question)}\n\n` + cardRows(card).slice(1).map((row,i) => {
            const body = row.key === 'relevance' ? ['borrow','challenge','gap'].map((k,j) => `**${copy[relationNames[j]] || ['可借鉴','可质疑','留下的空白'][j]}**\n\n${prose(card.relevance[k])}`).join('\n\n') : prose(card[row.key]);
            return `## ${copy[names[i+1]] || row.label}\n\n${body}${card.sources[row.key] ? `\n\n**${copy.sourceLabel || '依据位置'}**：${md(card.sources[row.key])}` : ''}`;
        }).join('\n\n');
    }
    const CSV_HEADERS = ['序号','作者','年份','题目','期刊','核心期刊','研究问题','对象与情境','研究方法','核心观点','主要结论','关键引用','局限','可借鉴','可质疑','留下的空白','一句话评价','我的研究问题','保存时间'];
    function savedDate(value) {
        if (value?.toDate) value = value.toDate();
        else if (value?.seconds) value = new Date(value.seconds * 1000);
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? '' : d.toISOString();
    }
    function cardCells(work, index = 0) {
        const raw = work.inputs?._card;
        const parsed = object(raw) ? parseReadingCard(JSON.stringify(raw)) : null;
        const c = parsed?.card;
        if (!c) return [index+1, '', '', work.title || '', '', '', '', '', '', '', '', '', '', '', '', '', '结构化数据缺失', work.inputs?._researchQuestion || '', savedDate(work.createdAt)];
        return [index+1, c.citation.authors, c.citation.year, c.citation.title, c.citation.journal, c.citation.isCore,
            c.question, c.sample, c.method, joined(c.viewpoints), joined(c.findings), joined(c.keyReferences), joined(c.limitations),
            joined(c.relevance.borrow), joined(c.relevance.challenge), joined(c.relevance.gap), c.verdict, work.inputs?._researchQuestion || '', savedDate(work.createdAt)];
    }
    function csvCell(value) {
        let s = String(value ?? '');
        // 避免教师编辑的文本被 Excel 当成公式执行。
        if (/^[\s]*[=+\-@]/.test(s)) s = "'" + s;
        return /[,"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    function cardsToCsv(works) { return '\uFEFF' + [CSV_HEADERS, ...works.map(cardCells)].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'; }
    function cardToTsv(card, question = '') {
        return cardCells({inputs:{_card:card,_researchQuestion:question}}, 0).map(v => {
            const s = String(v).replace(/[\t\r\n]+/g,' ');
            return /^[\s]*[=+\-@]/.test(s) ? "'"+s : s;
        }).join('\t');
    }
    function extractTitles(text) {
        const values = text.split('\n').filter(l => /^\s*\|\s*(问题式|关系式|机制式|路径式|对比式)\s*\|/.test(l)).map(l => l.split('|')[2]?.trim());
        return values.length === 5 && values.every(Boolean) ? values : null;
    }
    function checkFunnelTitles(text) {
        const titles = extractTitles(text), issues = [];
        const structures = text.split('\n').filter(l => /^\s*\|\s*(问题式|关系式|机制式|路径式|对比式)\s*\|/.test(l)).map(l => l.split('|')[1].trim());
        if (!titles || structures.join(',') !== '问题式,关系式,机制式,路径式,对比式') issues.push('请核对五种结构是否齐全且顺序正确');
        if (titles) titles.forEach((title, i) => {
            const plain = title.replace(/\*\*|`/g,'').trim();
            if (!plain.endsWith('研究')) issues.push(`第 ${i+1} 个题名应以“研究”结尾`);
            if ([...plain].length > 30) issues.push(`第 ${i+1} 个题名超过 30 字`);
            if (/^基于/.test(plain)) issues.push(`第 ${i+1} 个题名需改为更具体的表达`);
        });
        return { valid: issues.length === 0, titles, issues };
    }
    // 第二批纯函数独立追加，保持 v1 函数行为。
    const METHODS=['问卷调查','访谈法','观察法','行动研究','准实验','德尔菲法','田野调查','个案研究'];
    const QUESTION_TYPES=['描述型','关系型','干预型','过程型'], SCOPE_STATUS=['可行','需收窄','需回到教练'];
    const RESPONDENTS=['学生','教师','家长','其他','无'], TOOL_TYPES=['问卷','访谈提纲','观察记录表','现有材料','无'];
    const INSTRUMENT_KINDS=['questionnaire','interview','observation'], KIND_NAMES={questionnaire:'问卷',interview:'访谈提纲',observation:'观察记录表'};
    const ISSUES={questionnaire:['双重问题','引导性','绝对词','否定或双重否定','术语或抽象','与维度不符','意思重复','社会赞许','超出对象认知','时间范围模糊','反向题设置','其他'],interview:['封闭式提问','引导或预设','术语或抽象','一问多事','敏感问题位置','超出对象认知','与子问题无关','题量与时长不符','其他'],observation:['推断性描述','一项多行为','不可计数','与维度不符','意思重复','超出观察条件','取样不清','其他']};
    const ACTIONS=['改写','拆分','删除','保留并提醒'], REVIEW_STATUS=['未处理','已采用','条目已删除'];
    const SCALE_LABELS={'5点':['非常不符合','比较不符合','说不清','比较符合','非常符合'],'4点':['完全不符合','比较不符合','比较符合','完全符合'],'3点':['不像我','有点像我','很像我'],'是否':['否','是']};
    const ADAPTATION_NOTICE='以下为依据你的描述改编，不是原量表原文，请核对原量表并确认使用许可。';
    const LIMITS={items:40,probes:5,blocks:8,warmup:3,indicatorsPerDimension:8,indicators:30,dimensions:6,slots:10,review:30};
    const METHOD_LABELS={instructions:'指导语',demographics:'基本信息',dimensions:'维度',items:'题目',opening:'开场说明',consentPoints:'需要对方同意的事项',warmup:'暖场问题',blocks:'主题块',closing:'收尾问题',closingStatement:'结束语',fieldNotes:'现场提醒',sampling:'取样规则',indicators:'观察项',recordingRules:'记录规则',agreement:'记录一致性',ethics:'伦理与实施提醒',pending:'需要补充或核实',review:'逐条审查',checks:'规则检查（不调用 AI）',administration:'施测建议'};
    const DESIGN_HEADERS=['子问题','收集方式','对象','数据来源','工具','时间点','分析方式','预期产出'], PLAN_KEYS=['subQuestion','approach','respondent','source','tool','timing','analysis','output'];
    const mclone=v=>JSON.parse(JSON.stringify(v));
    const mtext=(v,n=200)=>truncateText(typeof v==='string'?v.replace(/[\r\n]+/g,' ').trim():'',n).text;
    const marray=(v,n=5,size=200)=>Array.isArray(v)?v.map(s=>mtext(s,size)).filter(Boolean).slice(0,n):[];
    const mobj=v=>object(v)?v:{};
    function jsonObject(raw){try{const s=String(raw).replace(/```(?:json)?/gi,'');const v=JSON.parse(s.slice(s.indexOf('{'),s.lastIndexOf('}')+1));return object(v)?v:null;}catch{return null;}}
    function normalizeMethod(name){name=mtext(name);if(/混合|多种|综合/.test(name))return '';if(METHODS.includes(name))return name;return [['问卷','问卷调查'],['访谈','访谈法'],['观察','观察法'],['行动','行动研究'],['准实验|对照','准实验'],['德尔菲','德尔菲法'],['田野','田野调查'],['个案|案例','个案研究']].find(([p])=>new RegExp(p).test(name))?.[1]||'';}
    function parseDesign(raw){
        const d=jsonObject(raw);if(!d)return null;const w=new Set(), required=(v,k)=>mtext(v)||(w.add(k),'未给出');
        const a=mobj(d.analysis),s=mobj(d.scope),t=mobj(d.titleCheck);
        const analysis=Object.fromEntries(['object','focus','context','typeReason'].map(k=>[k,required(a[k],'analysis')]));analysis.questionType=QUESTION_TYPES.find(v=>mtext(a.questionType).includes(v.slice(0,2)))||(w.add('analysis'),'待判断');
        const scope={status:/教练|回到/.test(mtext(s.status))?'需回到教练':/收窄/.test(mtext(s.status))?'需收窄':'可行',reason:required(s.reason,'scope'),narrowed:mtext(s.narrowed)};if(scope.status==='需收窄'&&!scope.narrowed)w.add('scope');
        const titleCheck={title:mtext(t.title)||'未提供',implies:mtext(t.implies),conflict:mtext(t.conflict),suggestion:mtext(t.suggestion)};
        const recommended=[], notRecommended=[];
        for(const r of Array.isArray(d.recommended)?d.recommended:[]){const method=normalizeMethod(r?.method);if(!method||recommended.some(x=>x.method===method)||recommended.length===2){w.add('recommended');continue;}recommended.push({method,role:r.role==='辅助方法'?'辅助方法':r.role==='主方法'?'主方法':recommended.length?'辅助方法':'主方法',...Object.fromEntries(['why','limits','data','minimal'].map(k=>[k,required(r[k],'recommended')]))});}
        if(recommended.length===2&&recommended.every(r=>r.role==='主方法'))recommended[1].role='辅助方法';
        for(const r of Array.isArray(d.notRecommended)?d.notRecommended:[]){const method=normalizeMethod(r?.method);if(!method||recommended.some(x=>x.method===method)){w.add('notRecommended');continue;}if(notRecommended.length<4)notRecommended.push({method,reason:required(r.reason,'notRecommended')});}
        let plan=(Array.isArray(d.plan)?d.plan:[]).filter(r=>mtext(r?.subQuestion)).slice(0,4).map(r=>{
            const respondent=RESPONDENTS.includes(r.respondent)?r.respondent:/生/.test(mtext(r.respondent))?'学生':/师/.test(mtext(r.respondent))?'教师':/家长/.test(mtext(r.respondent))?'家长':'其他';
            const toolType=/问卷/.test(mtext(r.toolType))?'问卷':/访谈/.test(mtext(r.toolType))?'访谈提纲':/观察/.test(mtext(r.toolType))?'观察记录表':/现有|已有|作业|成绩/.test(mtext(r.toolType))?'现有材料':'无';
            return {...Object.fromEntries(['subQuestion','approach','source','tool','timing','analysis','output'].map(k=>[k,required(r[k],'plan')])),respondent,toolType};});
        if(scope.status==='需回到教练'){recommended.length=0;plan=[];}else{if(!recommended.length)w.add('recommended');if(!plan.length)w.add('plan');}
        for(const k of ['analysis','scope','titleCheck','recommended','notRecommended','plan','ethics','pending'])if(!(k in d))w.add(k);
        return {design:{analysis,scope,titleCheck,recommended,notRecommended,plan,ethics:marray(d.ethics,6),pending:marray(d.pending,5)},warnings:[...w]};
    }
    function instrumentEntries(inst){
        if(inst.kind==='questionnaire')return inst.items.map(i=>({id:i.id,text:i.text,group:i.dimension,type:'item'}));
        if(inst.kind==='interview')return [...inst.warmup.map(i=>({id:i.id,text:i.text,group:'暖场',type:'warmup'})),...inst.blocks.flatMap(b=>[{id:b.id,text:b.main,group:`主问题·话题：${b.topic}`,type:'block'},...b.probes.map(i=>({id:i.id,text:i.text,group:'追问',type:'probe'}))]),...(inst.closing?[{id:inst.closing.id,text:inst.closing.text,group:'收尾',type:'closing'}]:[])];
        return inst.dimensions.flatMap(d=>d.indicators.map(i=>({id:i.id,text:i.behavior,group:d.name,type:'indicator'})));
    }
    function reviewRows(rows,inst,keepStatus,w){const entries=new Map(instrumentEntries(inst).map(e=>[e.id,e.text])),seen=new Set();return (Array.isArray(rows)?rows:[]).flatMap(r=>{
        if(!object(r)||!entries.has(r.itemId)){w.add('review');return [];}
        const issue=ISSUES[inst.kind].includes(r.issue)?r.issue:'其他',pair=r.itemId+':'+issue;if(seen.has(pair))return [];seen.add(pair);
        return [{itemId:r.itemId,issue,original:entries.get(r.itemId),action:ACTIONS.find(a=>mtext(r.action).includes(a==='保留并提醒'?'保留':a))||'保留并提醒',suggestion:mtext(r.suggestion),reason:mtext(r.reason),status:keepStatus&&REVIEW_STATUS.includes(r.status)?r.status:'未处理'}];}).slice(0,30);}
    function parseInstrument(raw,kind,ctx={}, {keepStatus=false}={}){
        const d=jsonObject(raw);if(!d||!INSTRUMENT_KINDS.includes(kind))return null;const w=new Set();if(d.kind!==kind)w.add('kind');
        const inst={kind,title:mtext(d.title,150)||KIND_NAMES[kind]};const required=(v,k,n)=>mtext(v,n)||(w.add(k),'未给出');
        if(kind==='questionnaire'){
            const sc=mobj(d.scale),scaleName=mtext(sc.type)||mtext(ctx.scale);const type=/5/.test(scaleName)?'5点':/4/.test(scaleName)?'4点':/3/.test(scaleName)?'3点':/是否|是\/否/.test(scaleName)?'是否':Object.keys(SCALE_LABELS).includes(ctx.scale)?ctx.scale:'5点';
            let labels=marray(sc.labels,8,20);if(labels.length!==SCALE_LABELS[type].length||sc.labels?.some(v=>!mtext(v,20))){labels=[...SCALE_LABELS[type]];w.add('scale');}
            inst.respondent=required(d.respondent,'respondent');inst.instructions=required(d.instructions,'instructions');inst.scale={type,labels};
            inst.demographics=(Array.isArray(d.demographics)?d.demographics:[]).filter(r=>mtext(r?.label)).slice(0,6).map(r=>({label:mtext(r.label),options:marray(r.options,8,30)}));
            inst.dimensions=(Array.isArray(d.dimensions)?d.dimensions:[]).filter(r=>mtext(r?.name)).slice(0,6).map(r=>({name:mtext(r.name),definition:mtext(r.definition),source:/教师/.test(mtext(r.source))?'教师提供':'AI拟定'}));
            inst.items=(Array.isArray(d.items)?d.items:[]).filter(r=>mtext(r?.text,150)).slice(0,40).map(r=>{let dimension=mtext(r.dimension);if(dimension!=='未分维度'&&!inst.dimensions.some(x=>x.name===dimension)){dimension='未分维度';w.add('items');}return {id:mtext(r.id),dimension,text:mtext(r.text,150),reverse:r.reverse===true||r.reverse==='true'||r.reverse==='是'};});
            if(!inst.items.length)return null;const ad=mobj(d.administration);inst.administration={pilot:mtext(ad.pilot),duration:mtext(ad.duration),notes:marray(ad.notes,5)};inst.adaptationNotice=mtext(ctx.scaleName)?ADAPTATION_NOTICE:'';
        }else if(kind==='interview'){
            inst.respondent=required(d.respondent,'respondent');inst.format=/焦点/.test(mtext(d.format))?'焦点小组访谈':'半结构式个别访谈';const duration=String(d.duration||'').match(/15|30|45/)?.[0];inst.duration=duration||(['15','30','45'].includes(String(ctx.duration))?String(ctx.duration):'30');inst.opening=required(d.opening,'opening',400);inst.consentPoints=marray(d.consentPoints,6);
            inst.warmup=(Array.isArray(d.warmup)?d.warmup:[]).filter(r=>mtext(r?.text,150)).slice(0,3).map(r=>({id:mtext(r.id),text:mtext(r.text,150)}));
            inst.blocks=(Array.isArray(d.blocks)?d.blocks:[]).filter(r=>mtext(r?.main,150)).slice(0,8).map(r=>({id:mtext(r.id),topic:mtext(r.topic)||'未命名话题',main:mtext(r.main,150),probes:(Array.isArray(r.probes)?r.probes:[]).filter(p=>mtext(p?.text,150)).slice(0,5).map(p=>({id:mtext(p.id),text:mtext(p.text,150)}))}));
            if(!inst.blocks.length)return null;inst.closing=object(d.closing)&&mtext(d.closing.text,150)?{id:mtext(d.closing.id),text:mtext(d.closing.text,150)}:null;inst.closingStatement=mtext(d.closingStatement);inst.fieldNotes=marray(d.fieldNotes,6);
        }else{
            inst.scene=required(d.scene,'scene');inst.target=required(d.target,'target');inst.observer=/同事/.test(mtext(d.observer)||mtext(ctx.observer))?'同事':'本人';const s=mobj(d.sampling);inst.sampling={mode:/事件/.test(mtext(s.mode)||mtext(ctx.sampling))?'事件取样':'时间取样',rule:mtext(s.rule),slots:marray(s.slots,10,20)};
            if((d.dimensions||[]).length>6||(d.dimensions||[]).some(r=>(r.indicators||[]).length>8))w.add('dimensions');let total=0;inst.dimensions=(Array.isArray(d.dimensions)?d.dimensions:[]).filter(r=>mtext(r?.name)).slice(0,6).map(r=>({name:mtext(r.name),source:/教师/.test(mtext(r.source))?'教师提供':'AI拟定',indicators:(Array.isArray(r.indicators)?r.indicators:[]).filter(i=>mtext(i?.behavior,150)).slice(0,8).filter(()=>{if(total++>=30){w.add('dimensions');return false;}return true;}).map(i=>{const record=/计数|次数/.test(mtext(i.record))?'计数':/等级|评分/.test(mtext(i.record))?'等级':'勾选';let levels=record==='等级'?marray(i.levels,3):[];if(record==='等级'&&levels.length<3){w.add('dimensions');while(levels.length<3)levels.push('待补充标准');}return {id:mtext(i.id),behavior:mtext(i.behavior,150),record,levels};})}));
            if(!inst.dimensions.some(d=>d.indicators.length))return null;inst.recordingRules=marray(d.recordingRules,5);inst.agreement=mtext(d.agreement);inst.ethics=marray(d.ethics,5);
        }
        inst.pending=marray(d.pending,5);inst.review=[];
        let bad=false,ids=new Set();const check=(id,re)=>{if(!re.test(id)||ids.has(id))bad=true;ids.add(id);};
        if(kind==='questionnaire')inst.items.forEach(i=>check(i.id,/^Q\d{1,2}$/));
        else if(kind==='observation')inst.dimensions.flatMap(d=>d.indicators).forEach(i=>check(i.id,/^O\d{1,2}$/));
        else{inst.warmup.forEach(i=>check(i.id,/^W\d$/));inst.blocks.forEach(b=>{check(b.id,/^B\d{1,2}$/);b.probes.forEach(i=>check(i.id,new RegExp('^'+b.id+'-\\d$')));});if(inst.closing)check(inst.closing.id,/^C1$/);}
        if(bad){w.add('review');if(kind==='questionnaire')inst.items.forEach((i,n)=>i.id='Q'+(n+1));else if(kind==='observation')inst.dimensions.flatMap(d=>d.indicators).forEach((i,n)=>i.id='O'+(n+1));else{inst.warmup.forEach((i,n)=>i.id='W'+(n+1));inst.blocks.forEach((b,n)=>{b.id='B'+(n+1);b.probes.forEach((i,j)=>i.id=b.id+'-'+(j+1));});if(inst.closing)inst.closing.id='C1';}}
        else inst.review=reviewRows(d.review,inst,keepStatus,w);
        return {instrument:inst,warnings:[...w]};
    }
    function parseReview(raw,inst){const d=jsonObject(raw);if(!d||!Array.isArray(d.review))return null;const w=new Set();return {review:reviewRows(d.review,inst,false,w),summary:mtext(d.summary),warnings:[...w]};}
    function updateEntry(inst,id,text){const n=mclone(inst),v=mtext(text,150);if(n.kind==='questionnaire')n.items.forEach(i=>{if(i.id===id)i.text=v;});else if(n.kind==='observation')n.dimensions.flatMap(d=>d.indicators).forEach(i=>{if(i.id===id)i.behavior=v;});else{n.warmup.forEach(i=>{if(i.id===id)i.text=v;});n.blocks.forEach(b=>{if(b.id===id)b.main=v;b.probes.forEach(i=>{if(i.id===id)i.text=v;});});if(n.closing?.id===id)n.closing.text=v;}return n;}
    function removeEntry(inst,id){const n=mclone(inst),removed=new Set([id]);if(n.kind==='questionnaire')n.items=n.items.filter(i=>i.id!==id);else if(n.kind==='observation')n.dimensions.forEach(d=>d.indicators=d.indicators.filter(i=>i.id!==id));else{n.warmup=n.warmup.filter(i=>i.id!==id);n.blocks=n.blocks.filter(b=>{if(b.id===id){b.probes.forEach(i=>removed.add(i.id));return false;}b.probes=b.probes.filter(i=>i.id!==id);return true;});if(n.closing?.id===id)n.closing=null;}n.review.forEach(r=>{if(removed.has(r.itemId))r.status='条目已删除';});return n;}
    function applySuggestion(inst,index){const r=inst.review[index],e=instrumentEntries(inst).find(e=>e.id===r?.itemId);if(!r||r.status!=='未处理'||!e||e.text!==r.original||!['改写','删除'].includes(r.action))return inst;const n=r.action==='删除'?removeEntry(inst,r.itemId):updateEntry(inst,r.itemId,r.suggestion);n.review[index].status='已采用';return n;}
    function addEntry(inst,{type,group,blockId}={}){const n=mclone(inst),next=(arr,p)=>p+(Math.max(0,...arr.map(i=>Number(i.id.slice(p.length))||0))+1);
        if(n.kind==='questionnaire'){if(n.items.length>=40)return inst;n.items.push({id:next(n.items,'Q'),dimension:group||n.dimensions[0]?.name||'未分维度',text:'',reverse:false});}
        else if(n.kind==='observation'){const d=n.dimensions.find(d=>d.name===group)||n.dimensions[0],all=n.dimensions.flatMap(d=>d.indicators);if(!d||d.indicators.length>=8||all.length>=30)return inst;d.indicators.push({id:next(all,'O'),behavior:'',record:'勾选',levels:[]});}
        else if(type==='warmup'){if(n.warmup.length>=3)return inst;n.warmup.push({id:next(n.warmup,'W'),text:''});}
        else if(type==='closing'){if(n.closing)return inst;n.closing={id:'C1',text:''};}
        else if(type==='probe'){const b=n.blocks.find(b=>b.id===blockId);if(!b||b.probes.length>=5)return inst;b.probes.push({id:next(b.probes,b.id+'-'),text:''});}
        else{if(n.blocks.length>=8)return inst;n.blocks.push({id:next(n.blocks,'B'),topic:'新话题',main:'',probes:[]});}return n;
    }
    function compactInstrument(inst){const n=mclone(inst);if(n.kind==='questionnaire')n.items=n.items.filter(i=>mtext(i.text));else if(n.kind==='observation')n.dimensions.forEach(d=>d.indicators=d.indicators.filter(i=>mtext(i.behavior)));else{n.warmup=n.warmup.filter(i=>mtext(i.text));n.blocks=n.blocks.filter(b=>mtext(b.main));n.blocks.forEach(b=>b.probes=b.probes.filter(i=>mtext(i.text)));if(n.closing&&!mtext(n.closing.text))n.closing=null;}return n;}
    function instrumentChecks(inst,ctx={}){const hints=[],entries=instrumentEntries(inst),low=String(ctx.stage||'').startsWith('小学低年级')&&ctx.respondent==='学生';
        if(inst.kind==='questionnaire'){
            if(!inst.instructions.includes('匿名'))hints.push('指导语没有写明匿名');if(!inst.instructions.includes('自愿'))hints.push('指导语没有写明自愿');
            const reverse=inst.items.filter(i=>i.reverse).length;if(reverse>inst.items.length/5)hints.push(`反向题 ${reverse} 道，超过总题数的五分之一`);
            inst.dimensions.forEach(d=>{const n=inst.items.filter(i=>i.dimension===d.name).length;if(n<3||n>6)hints.push(`维度“${d.name}”有 ${n} 道题，建议 3 至 6 道`);});
            const missing=inst.items.filter(i=>i.dimension==='未分维度').length;if(missing)hints.push(`有 ${missing} 道题没有归入维度`);
            if(low&&['4点','5点'].includes(inst.scale.type))hints.push('小学低年级学生不宜独立填写 4 点或 5 点量表');
            inst.demographics.forEach(d=>{if(/姓名|学号|收入|职业|电话|手机|住址|身份证/.test(d.label))hints.push(`基本信息“${d.label}”可能识别个人或过于敏感`);});if(inst.items.length>30)hints.push(`共 ${inst.items.length} 道题，填答时间可能过长`);
        }else if(inst.kind==='interview'){
            if(!/录音|录像/.test(inst.opening))hints.push('开场说明没有提到录音并征得同意');if(!/匿名|保密/.test(inst.opening))hints.push('开场说明没有提到匿名或保密');if(!/停止|不回答|退出|自愿/.test(inst.opening))hints.push('开场说明没有告诉对方可以不回答或随时停止');
            const [min,max]=({'15':[2,3],'30':[3,4],'45':[4,5]})[inst.duration]||[3,4],n=inst.blocks.length;if(n<min||n>max)hints.push(`${inst.duration} 分钟访谈有 ${n} 个主题块，建议 ${min} 至 ${max} 个`);
            inst.blocks.forEach(b=>{if(/是不是|是否|有没有|会不会|对不对|能不能|好不好|喜不喜欢/.test(b.main)||(/吗[？?]?$/.test(b.main)&&!/讲讲|说说|谈谈|描述|举个例子|怎么|怎样|什么|哪些|为什么/.test(b.main)))hints.push(`${b.id} 主问题可能是封闭式提问`);});
            if(String(ctx.stage||'').startsWith('小学')&&ctx.respondent==='学生'&&Number(inst.duration)>20)hints.push('小学生单次访谈建议不超过 20 分钟');if(!inst.warmup.length)hints.push('没有暖场问题');if(!inst.closing)hints.push('没有收尾问题');
        }else{
            entries.forEach(e=>{const word=e.text.match(/专注|积极|认真|理解|喜欢|兴趣|主动|努力|能力|自信/)?.[0];if(word)hints.push(`${e.id} 含推断性词语“${word}”，建议改成看得见的行为`);});
            if(entries.length>20)hints.push(`共 ${entries.length} 个观察项，现场难以记全`);if(inst.sampling.mode==='时间取样'&&!inst.sampling.slots.length)hints.push('时间取样没有列出记录时间点');if(inst.sampling.mode==='事件取样'&&!inst.sampling.rule)hints.push('事件取样没有写清一次事件的起止');
            inst.dimensions.flatMap(d=>d.indicators).forEach(i=>{if(i.record==='等级'&&(i.levels.length!==3||i.levels.some(s=>!s||s==='待补充标准')))hints.push(`${i.id} 等级标准不完整`);});
        }return hints;
    }
    const HANDOFF_TTL=30*60*1000;
    function writeHandoff(storage,uid,data,now=Date.now()){if(!uid)return false;try{storage.setItem('rsHandoff:'+uid,JSON.stringify({...data,at:now}));return true;}catch{return false;}}
    function takeHandoff(storage,uid,to,now=Date.now()){if(!uid)return null;const key='rsHandoff:'+uid;try{const raw=storage.getItem(key);if(!raw)return null;let d;try{d=JSON.parse(raw);}catch{storage.removeItem(key);return null;}if(!object(d)||!Number.isFinite(d.at)||d.at<now-HANDOFF_TTL){storage.removeItem(key);return null;}if(d.to!==to)return null;storage.removeItem(key);const result={to};for(const [k,n] of Object.entries({question:300,subQuestion:200,title:60,target:60}))if(typeof d[k]==='string')result[k]=mtext(d[k],n);if(Array.isArray(d.titles))result.titles=marray(d.titles,5,60);if(INSTRUMENT_KINDS.includes(d.mode))result.mode=d.mode;if(RESPONDENTS.slice(0,4).includes(d.respondent))result.respondent=d.respondent;if(['小学低年级（1–3年级）','小学高年级（4–6年级）','初中','高中','其他'].includes(d.stage))result.stage=d.stage;return result;}catch{return null;}}
    const tsvCell=v=>{const s=String(v??'').replace(/[\t\r\n]+/g,' ');return /^\s*[=+\-@]/.test(s)?"'"+s:s;};
    const tsvRows=rows=>rows.map(r=>r.map(tsvCell).join('\t')).join('\n');
    const mdTable=(headers,rows)=>[headers,headers.map(()=>'---'),...rows].map(r=>'| '+r.map(v=>md(v??'')).join(' | ')+' |').join('\n');
    function designPlanTsv(d){return tsvRows([DESIGN_HEADERS,...d.plan.map(r=>PLAN_KEYS.map(k=>r[k]))]);}
    function designToMarkdown(d,{question='',title='',conditions={}}={}){const lines=[`# 研究设计：${md(d.scope.narrowed||question)}`,`**研究问题**：${md(question)}`,`**拟定题目**：${md(title||'未提供')}`,'## 我的条件',...Object.entries(conditions).map(([k,v])=>`- ${({'stage':'学段','classes':'研究对象','parallel':'可比较的平行班','period':'研究周期','data':'可以收集的数据','ability':'数据分析能力','support':'可求助的人','purpose':'研究用途','preference':'方法偏好','notes':'其他说明'})[k]||k}：${md(Array.isArray(v)?v.join('、'):v)}`),'## 问题解析',...Object.entries(d.analysis).map(([k,v])=>`- ${({'object':'研究对象','focus':'关键变量或现象','context':'研究情境','questionType':'问题类型','typeReason':'判断依据'})[k]}：${md(v)}`),'## 范围检查',`**${d.scope.status}**：${md(d.scope.reason)}`];if(d.scope.narrowed)lines.push(`收窄后的研究问题：${md(d.scope.narrowed)}`);
        if(d.scope.status!=='需回到教练'){if(d.titleCheck.title!=='未提供')lines.push('## 题目承诺检查',...Object.values(d.titleCheck).map(md));lines.push('## 推荐方法',...d.recommended.map(r=>`### ${r.method} · ${r.role}\n\n${['why','limits','data','minimal'].map((k,i)=>`- ${['为什么适合','本案局限','会产生的数据','最小可行版本'][i]}：${md(r[k])}`).join('\n')}`),'## 不推荐的方法',...d.notRecommended.map(r=>`- **${r.method}**：${md(r.reason)}`),'## 一页纸研究设计',mdTable(DESIGN_HEADERS,d.plan.map(r=>PLAN_KEYS.map(k=>r[k]))),'## 需要准备的工具',...d.plan.filter(r=>r.toolType!=='无').map(r=>`- ${md(r.subQuestion)} → ${md(r.tool)}（${r.toolType}）`));}
        if(d.ethics.length)lines.push('## 伦理与实施提醒',...d.ethics.map(s=>'- '+md(s)));if(d.pending.length)lines.push('## 需要补充或核实',...d.pending.map(s=>'- '+md(s)));return lines.join('\n\n');}
    function instrumentTsv(inst){inst=compactInstrument(inst);if(inst.kind==='questionnaire')return tsvRows([['题号','维度','题目','反向题','量表'],...inst.items.map(i=>[i.id,i.dimension,i.text,i.reverse?'是':'否',inst.scale.type])]);if(inst.kind==='interview')return tsvRows([['编号','类型','问题','话题'],...instrumentEntries(inst).map(e=>[e.id,({warmup:'暖场',block:'主问题',probe:'追问',closing:'收尾'})[e.type],e.text,e.group])]);return tsvRows([['编号','维度','观察行为','记录方式','等级标准',...inst.sampling.slots],...inst.dimensions.flatMap(d=>d.indicators.map(i=>[i.id,d.name,i.behavior,i.record,i.levels.join('／'),...inst.sampling.slots.map(()=>'')]))]);}
    function instrumentToMarkdown(inst,ctx={}){inst=compactInstrument(inst);const l=METHOD_LABELS,lines=[`# ${md(inst.title)}`,`**研究问题**：${md(ctx.question||'')}`,`**子问题**：${md(ctx.subQuestion||'')}`,`**对象**：${md(ctx.respondent||ctx.target||'')}（${md(ctx.stage||'')}）`];
        if(inst.kind==='questionnaire'){lines.push('## '+l.instructions,md(inst.instructions),'## '+l.demographics,...inst.demographics.map(d=>`- ${md(d.label)}：${d.options.map(md).join('、')}`),'## '+l.dimensions,...inst.dimensions.map(d=>`- ${md(d.name)}：${md(d.definition)}（${d.source}）`),'## '+l.items,mdTable(['题号','维度','题目','反向题'],inst.items.map(i=>[i.id,i.dimension,i.text,i.reverse?'是':'否'])),`选项：${inst.scale.labels.map(md).join('、')}`,'## '+l.administration,md(inst.administration.pilot),md(inst.administration.duration),...inst.administration.notes.map(v=>'- '+md(v)));if(inst.adaptationNotice)lines.push('## 改编说明',md(inst.adaptationNotice));}
        else if(inst.kind==='interview')lines.push('## '+l.opening,md(inst.opening),'## '+l.consentPoints,...inst.consentPoints.map(v=>'- '+md(v)),'## '+l.items,...instrumentEntries(inst).map(e=>`- **${e.id}（${md(e.group)}）** ${md(e.text)}`),'## '+l.closingStatement,md(inst.closingStatement),'## '+l.fieldNotes,...inst.fieldNotes.map(v=>'- '+md(v)));
        else lines.push('## '+l.sampling,`${inst.sampling.mode}：${md(inst.sampling.rule)}`,inst.sampling.slots.map(md).join('、'),'## '+l.indicators,mdTable(['编号','维度','观察行为','记录方式','等级标准'],inst.dimensions.flatMap(d=>d.indicators.map(i=>[i.id,d.name,i.behavior,i.record,i.levels.join('／')]))),'## '+l.recordingRules,...inst.recordingRules.map(v=>'- '+md(v)),'## '+l.agreement,md(inst.agreement),'## '+l.ethics,...inst.ethics.map(v=>'- '+md(v)));
        lines.push('## '+l.review,mdTable(['编号','问题类型','原句','处理','建议','理由','状态'],inst.review.map(r=>['itemId','issue','original','action','suggestion','reason','status'].map(k=>r[k]))),'## '+l.checks,...instrumentChecks(inst,ctx).map(v=>'- '+md(v)),'## '+l.pending,...inst.pending.map(v=>'- '+md(v)));return lines.join('\n\n');}

    root.ResearchCore = { funnelProgress, detectFunnelPhase, extractFunnelResult, buildFunnelMessages, checkFunnelTitles, parseReadingCard, cardRows, cardToMarkdown, cardsToCsv, cardToTsv, truncateText, extractTitles, citationText, savedDate, CSV_HEADERS, METHODS,QUESTION_TYPES,SCOPE_STATUS,RESPONDENTS,TOOL_TYPES,INSTRUMENT_KINDS,KIND_NAMES,ISSUES,ACTIONS,REVIEW_STATUS,SCALE_LABELS,ADAPTATION_NOTICE,LIMITS,METHOD_LABELS,DESIGN_HEADERS,PLAN_KEYS,HANDOFF_TTL,normalizeMethod,parseDesign,parseInstrument,parseReview,instrumentEntries,updateEntry,applySuggestion,removeEntry,addEntry,compactInstrument,instrumentChecks,writeHandoff,takeHandoff,designToMarkdown,designPlanTsv,instrumentToMarkdown,instrumentTsv };
})(globalThis);
