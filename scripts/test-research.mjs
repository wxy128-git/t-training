#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
let passed = 0;
const assert = (condition, message) => { if (!condition) throw new Error(message); passed++; };
const importSource = file => import(pathToFileURL(resolve(root,file)).href + `?research-test=${Date.now()}`);
const originalWindow = globalThis.window, originalFetch = globalThis.fetch;
try {
    globalThis.window = globalThis;
    await importSource('js/research-data.js');
    await importSource('js/research-core.js');
    await importSource('js/research-pdf.js');
    const [f,r,d,w] = RESEARCH_AGENTS, C = ResearchCore;
    assert(RESEARCH_AGENTS.length===4 && f.id==='research-funnel' && r.id==='research-reading-card','两个科研智能体定义不正确');
    for (const a of RESEARCH_AGENTS) assert(a.name && (a.system || a.systems), '智能体缺少名称或系统提示');
    assert(f.system.includes('## 研究问题聚焦结果')&&f.system.includes('## 五种结构的标题')&&f.system.includes('每次只问一个问题')&&f.system.includes('不得以'),'漏斗约束缺失');
    for(const key of r.schemaKeys) assert(r.system.includes('"'+key+'"'),`精读卡 schema 缺 ${key}`);
    const specification=readFileSync(resolve(root,'docs/2026-10-06-research-writing-module-spec.md'),'utf8');
    const coachSpec=readFileSync(resolve(root,'docs/2026-10-08-research-coach-update.md'),'utf8');
    assert(f.system === coachSpec.split('## 教练系统提示')[1].split('```')[1].trim(),'教练系统提示与已确认更新方案不一致');
    assert(f.name==='研究问题教练' && r.name==='文献研读伙伴','角色名称仍显示功能名');
    assert(!f.greeting.includes('六轮')&&f.system.includes('不设固定追问轮数')&&f.system.includes('待核实'),'自适应轮次或信息不足规则缺失');
    assert(r.system === specification.split('系统提示词（全文，逐字写入）：')[1].split('```')[1].trim(),'精读卡系统提示未逐字保留');
    assert(f.requestSystem.startsWith(f.system) && f.requestSystem.includes('恰好一个问号'), '漏斗请求补充约束缺失');
    assert(r.requestSystem.startsWith(r.system) && r.requestSystem.includes('正文未明确说明时必须为“未知”'), '核心属性请求补充约束缺失');
    const message=r.buildUserMessage({question:'问题',meta:'',text:'正文',sourceType:'pdf',fileName:'文章.pdf',pageCount:8,truncated:true});
    assert(message.includes('已截断')&&message.includes('未提供')&&message.includes('文章.pdf')&&message.includes('共 8 页'),'用户消息来源与截断提示缺失');
    assert(C.detectFunnelPhase([]).phase==='start','空历史阶段错误');
    assert(C.detectFunnelPhase([{role:'user',content:'困扰'},{role:'assistant',content:'有多少人？'}]).round===1,'追问轮数错误');
    assert(C.detectFunnelPhase([{role:'user',content:'困扰'}]).phase==='probing','追问阶段错误');
    const both='## 研究问题聚焦结果\n- **研究问题（疑问句）**：怎样提升参与？\n\n## 五种结构的标题\n标题表格';
    assert(C.detectFunnelPhase([{role:'assistant',content:'## 研究问题聚焦结果'}]).phase==='focused','聚焦阶段错误');
    assert(C.detectFunnelPhase([{role:'assistant',content:both}]).phase==='titles','标题阶段错误');
    assert(C.detectFunnelPhase(Array.from({length:9},()=>({role:'assistant',content:'最关键的缺口是什么？'}))).round===9,'追问次数仍被六轮封顶');
    assert(C.detectFunnelPhase([{role:'assistant',content:both},{role:'user',content:f.commands.reopen},{role:'assistant',content:'你想理解哪个协作环节？'}]).phase==='probing','标题之后无法重新澄清');
    const probingHistory = n => [{role:'user',content:'小组讨论中参与不均'},...Array.from({length:n},(_,i)=>[{role:'assistant',content:`第${i+1}个关键缺口？`},{role:'user',content:'已观察到的事实'}]).flat()];
    for (const [round,mode] of [[0,'probe'],[4,'probe'],[5,'converge'],[6,'converge'],[7,'focus'],[19,'focus']]) {
        const history=probingHistory(round),progress=C.funnelProgress(history),request=C.buildFunnelMessages(f.requestSystem,history);
        assert(progress.round===round&&progress.mode===mode&&request[0].content.includes(`已经提出 ${round} 次追问`),'轮次收束边界错误');
    }
    const seventhRequest=C.buildFunnelMessages(f.requestSystem,probingHistory(7));
    assert(seventhRequest[0].content.endsWith('此任务优先于阶段一的单问句约束。')&&seventhRequest[0].content.includes('不得再追问'),'七轮后未请求直接聚焦');
    const longProbe=C.buildFunnelMessages(f.requestSystem,probingHistory(19));
    assert(longProbe.length<=30&&longProbe[0].content.includes('已经提出 19 次追问')&&longProbe[1].content==='小组讨论中参与不均','截断历史丢失真实轮次或原始困扰');
    const focusedHistory=[...probingHistory(7),{role:'assistant',content:both},{role:'user',content:f.commands.titles}];
    assert(C.funnelProgress(focusedHistory).mode==='followup'&&C.buildFunnelMessages(f.requestSystem,focusedHistory)[0].content.includes('按教师本次意愿生成标题'),'聚焦后被轮次上限阻断标题');
    const reopened=[...focusedHistory,{role:'assistant',content:'## 五种结构的标题\n标题表格'},{role:'user',content:f.commands.reopen},{role:'assistant',content:'你希望改为关注哪个参与过程？'},{role:'user',content:'讨论中回应同伴的过程'}];
    assert(C.funnelProgress(reopened).round===1&&C.funnelProgress(reopened).mode==='probe','重新澄清周期未重计数');
    const stopped=[...probingHistory(6),{role:'user',content:'网络失败后重复发送的回答'}];
    assert(C.funnelProgress(stopped).round===6,'失败重试的用户消息被多算追问');
    const parts=C.extractFunnelResult([{role:'assistant',content:both}]);
    assert(C.extractFunnelResult([{role:'assistant',content:both},{role:'assistant',content:'## 研究问题聚焦结果\n新的研究问题'}]).titles==='', '重新聚焦后旧标题仍与新结果混合');
    assert(parts.question==='怎样提升参与？'&&parts.focus.startsWith('## 研究问题聚焦结果')&&!parts.focus.includes('## 五种结构的标题')&&parts.titles.startsWith('## 五种结构的标题'),'结果提取未切开两个块');
    // 学术疑问句保持原文，供保存、标题与研究设计交接；不在前端机械改写。
    for (const question of ['七年级学生在小组讨论中的参与呈现哪些特征？','教师互信与校本教研参与有何关联？','新教师在集体备课中如何形成教学判断？','两轮同伴反馈实践中，学生的作文修改行为发生哪些变化？']) {
        const focus='## 研究问题聚焦结果\n- **研究对象**：教师已说明的对象\n- **可行性边界**：资料取得方式待核实\n- **研究问题（疑问句）**：'+question+'\n- **最初的困扰 → 现在的问题**：原始困扰 → '+question;
        const history=[{role:'user',content:'我的困扰'},{role:'assistant',content:focus}];
        const extracted=C.extractFunnelResult(history);
        assert(extracted.question===question&&extracted.focus===focus&&C.buildFunnelMessages(f.requestSystem,history)[0].content.includes('不能只凭单班观察'),'学术问题或证据边界未保留至后续流程');
    }
    const fixture={citation:{authors:'张三',year:'2021',title:'课堂参与',journal:'教育研究',isCore:'未知'},question:'原文未明确',sample:'七年级',method:'观察',viewpoints:['观点1','观点2'],findings:['结论'],keyReferences:[],limitations:['材料有限'],relevance:{borrow:['任务设计'],challenge:[],gap:[]},verdict:'值得核对',sources:{question:'摘要',sample:'摘要',method:'研究设计',viewpoints:'引言',findings:'结论',keyReferences:'正文',limitations:'结论'},unclear:[]};
    const json=JSON.stringify(fixture),parsed=C.parseReadingCard(json);
    assert(parsed.card && parsed.warnings.length===0 && Object.keys(parsed.card).length===12,'合法 JSON 未规范化');
    assert(C.parseReadingCard('```json\n'+json+'\n```')?.card.citation.title==='课堂参与','JSON 围栏解析失败');
    assert(C.parseReadingCard('解释\n'+json+'\n结束')?.card.method==='观察','解释性文本解析失败');
    const missing={...fixture};delete missing.sources;delete missing.verdict;
    const defaults=C.parseReadingCard(JSON.stringify(missing));
    assert(defaults.warnings.includes('sources')&&defaults.warnings.includes('verdict')&&defaults.card.unclear.includes('verdict')&&defaults.card.verdict==='原文未明确','补默认值与 unclear 错误');
    for(const [input,expected] of [['核心','是'],['非核心','否'],['否','否'],['未知','未知']]) assert(C.parseReadingCard(JSON.stringify({...fixture,citation:{...fixture.citation,isCore:input}})).card.citation.isCore===expected,'核心期刊规范化错误');
    assert(C.parseReadingCard('非 JSON')===null && C.parseReadingCard('[]')===null,'非 JSON 没有拒绝');
    const bounded=C.parseReadingCard(JSON.stringify({...fixture,method:'a'.repeat(601),viewpoints:Array(20).fill('长观点\n'),unexpected:'危险键'})).card;
    assert(bounded.method.length===600&&bounded.viewpoints.length===12&&!('unexpected' in bounded)&&!bounded.viewpoints[0].includes('\n'),'字符串与数组限制或未知键丢弃失败');
    const markdown=C.cardToMarkdown(fixture,{question:'我的问题'});
    for(const label of C.cardRows(fixture).map(row=>row.label))assert(markdown.includes(label),'Markdown 缺少栏目 '+label);
    assert(markdown.includes('原文未明确')&&markdown.includes('**我的研究问题**：我的问题'),'Markdown 研究问题或未明确标记缺失');
    assert(markdown.includes('## 核心观点') && markdown.includes('- 观点1\n- 观点2') && !markdown.includes('| 栏目 |'), 'Markdown 未改为分节和分点');
    await importSource('js/safe-render.js');
    await importSource('js/site-copy.js');
    await importSource('js/research-presentation.js');
    const P=ResearchPresentation,copy=SiteCopy.defaults('research');
    const html=P.cardHTML(fixture,'我的问题',copy,true);
    assert(html.includes('rs-reading-document') && html.includes('data-relation="borrow"') && !html.includes('<table'), '阅读稿仍为长横表或缺少改写');
    assert(html.includes('<li>') && html.includes('data-research-note="helpFindings"') && html.includes('data-note-text="结论"'), '分点或栏目/依据备注缺失');
    const unsafe=P.cardHTML({...fixture,citation:{...fixture.citation,title:'<img src=x onerror=alert(1)>'}},'<script>evil()</script>',copy);
    assert(!unsafe.includes('<img') && !unsafe.includes('<script>'), '阅读稿元信息或问题未转义');
    assert(P.items('观察；访谈').length===2 && P.items('一句完整的话。第二句完整的话。').length===1, '分点拆开句子或遗漏明确条目');
    const works=[{title:'课堂参与',inputs:{_card:fixture,_researchQuestion:'a,b"c\nd'},createdAt:'2026-10-06T00:00:00Z'},{title:'旧卡',inputs:{},createdAt:'2026-10-06'}];
    const csv=C.cardsToCsv(works);
    assert(csv.charCodeAt(0)===0xFEFF && csv.split('\r\n')[0].split(',').length===19,'CSV BOM 或 19 列表头错误');
    assert(csv.includes('"a,b""c\nd"')&&csv.includes('观点1；观点2'),'CSV 逗号、引号、换行或数组转义错误');
    assert(csv.includes('结构化数据缺失')&&csv.endsWith('\r\n'),'旧卡或 CRLF 错误');
    assert(C.cardsToCsv([{title:'=HYPERLINK("unsafe")'}]).includes("'=HYPERLINK"),'CSV 公式注入未防护');
    assert(C.cardToTsv(fixture,'我的问题').split('\t').length===19,'TSV 列数错误');
    const truncated=C.truncateText('a'.repeat(59999)+'😀尾',60000);
    assert(truncated.truncated&&truncated.text.length===59999&&!/[\uD800-\uDBFF]$/.test(truncated.text),'截断切开 emoji');
    assert(!C.truncateText('正好',2).truncated,'等长文本误标截断');
    const messages=C.buildFunnelMessages('系统',Array.from({length:40},(_,i)=>({role:'user',content:String(i)})));
    assert(messages.length<=30&&messages[0].role==='system'&&messages[1].content==='0'&&messages.at(-1).content==='39','长对话未保留系统、最初困扰与近期对话');
    const anchored=Array.from({length:60},(_,i)=>({role:i%2?'assistant':'user',content:String(i)}));anchored[9].content='## 研究问题聚焦结果\n教师协作';
    const retained=C.buildFunnelMessages('系统',anchored);
    assert(retained.length<=30&&retained[1].content==='0'&&retained.some(m=>m.content===anchored[9].content)&&retained.at(-1).content==='59','长对话丢失最近聚焦结果');
    const table=['问题式','关系式','机制式','路径式','对比式'].map((v,i)=>`| ${v} | 标题${i} | 说明 |`).join('\n');
    assert(C.extractTitles(table)?.length===5 && C.extractTitles('无表格')===null,'标题数组提取错误');
    assert(!C.checkFunnelTitles(table).valid,'无研究后缀的标题未提示核对');
    const validTitles=table.replace(/标题(\d)/g,'教师协作过程$1研究');
    assert(C.checkFunnelTitles(validTitles).valid,'自然研究后缀的五种结构被拒绝');
    assert(!C.checkFunnelTitles(validTitles.replace('教师协作过程0研究','a'.repeat(31)+'研究')).valid,'过长题名未提示核对');
    assert(!C.checkFunnelTitles(validTitles.replace('关系式','问题式')).valid,'重复结构未提示核对');
    assert(!C.checkFunnelTitles(validTitles.replace('教师协作过程0研究','基于教师协作的过程研究')).valid,'基于开头题名未提示核对');
    assert(!C.checkFunnelTitles('无表格').valid,'缺少标题表格未提示核对');
    for(const [name,size,data,error] of [['doc.caj',2,'%PDF','知网'],['large.pdf',21*1024*1024,'%PDF','20 MB'],['bad.pdf',2,'html','不是有效']]) {
        let caught='';try{await ResearchPdf.extract({name,size,arrayBuffer:async()=>new TextEncoder().encode(data).buffer});}catch(e){caught=e.message;}
        assert(caught.includes(error),'PDF 文件前置校验错误');
    }
    const agent=await importSource('functions/api/agent.js');
    for(const agentId of ['research-funnel','research-reading-card','research-design','research-instrument']){
        let providerCount=0,model='';
        globalThis.fetch=async(url,options)=>{
            if(String(url).includes('accounts:lookup'))return new Response(JSON.stringify({users:[{localId:agentId+'-test',email:'teacher@example.invalid',emailVerified:true}]}),{headers:{'Content-Type':'application/json'}});
            providerCount++;model=JSON.parse(options.body).model;return new Response('模拟供应商不可用',{status:501});
        };
        const response=await agent.onRequestPost({request:new Request('https://site.test/api/agent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'system',content:'系统'},{role:'user',content:'教学研究'}],idToken:'test-token',agentId,curriculum:null})}),env:{ZHIPU_API_KEY:'fake-test-key'}});
        assert(![400,422].includes(response.status)&&providerCount===1,'科研调用被课程闸门误拦截');
        assert(model==='glm-5.2','科研智能体未优先使用 GLM');
    }
    {
    // 第二批结构化输出、编辑与交接：全部为合成数据。
    const methodsSpec=readFileSync(resolve(root,'docs/2026-10-12-research-methods-agents-spec.md'),'utf8');
    for(const [anchor,value] of [['设计顾问系统提示',d.system],...['问卷','访谈提纲','观察记录表','重新审查'].map((a,i)=>['工坊系统提示：'+a,w.systems[['questionnaire','interview','observation','review'][i]]])])assert(value===methodsSpec.split('## '+anchor+'\n')[1].match(/```[^\n]*\n([\s\S]*?)\n```/)[1].trim(),anchor+'未逐字复制');
    assert(RESEARCH_AGENTS.map(a=>a.id).join(',')==='research-funnel,research-reading-card,research-design,research-instrument','四个ID或顺序不正确');
    for(const [system,request] of [[d.system,d.requestSystem],...Object.entries(w.systems).map(([k,v])=>[v,w.requestSystems[k]])])assert(request.startsWith(system)&&request.includes('【请求补充约束】'),'JSON补充约束缺失');
    assert(w.systems.questionnaire.includes(C.ADAPTATION_NOTICE),'改编声明不一致');
    const F=await import('./fixtures/research-methods.mjs'),j=v=>JSON.stringify(v),dc=F.designContext,ic=F.instrumentContext;
    const designParsed=C.parseDesign(j(F.designFixture));assert(designParsed.design.recommended[0].method==='行动研究'&&designParsed.design.notRecommended[0].method==='准实验'&&designParsed.design.plan.length===3,'标准设计解析失败');
    assert(C.parseDesign('无JSON')===null,'非JSON设计未拒绝');assert(C.parseDesign('说明```json\n'+j(F.designFixture)+'\n```结束')!==null,'设计JSON提取失败');
    const messy=C.parseDesign(j({...F.designFixture,extra:'丢弃',analysis:{...F.designFixture.analysis,questionType:'研究描述'},recommended:[{...F.designFixture.recommended[0],method:'混合方法'},{...F.designFixture.recommended[0],method:'行动研究法'},{...F.designFixture.recommended[0],method:'访谈',role:'主方法'},{...F.designFixture.recommended[0],method:'观察法'}]}));
    assert(messy.design.recommended.length===2&&messy.design.recommended[1].role==='辅助方法'&&!('extra' in messy.design)&&messy.design.analysis.questionType==='描述型','方法枚举、去重或主辅规范化失败');
    const back=C.parseDesign(j({...F.designFixture,scope:{status:'回到教练',reason:'缺少问题'}}));assert(!back.design.plan.length&&!back.design.recommended.length,'回教练设计仍推荐方法');
    for(const method of C.METHODS)assert(C.normalizeMethod(method)===method,'方法名无法保留');assert(!C.normalizeMethod('混合方法')&&!C.normalizeMethod('综合观察'),'笼统方法名未拒绝');
    assert(d.buildUserMessage({...dc,title:'',conditions:{...dc.conditions,data:[],notes:''}}).includes('【拟定题目】未提供\n')&&d.buildUserMessage({...dc,title:'',conditions:{...dc.conditions,data:[],notes:''}}).includes('【可以收集的数据】未选择'),'设计空值模板错误');
    const fixtures={questionnaire:F.questionnaireFixture,interview:F.interviewFixture,observation:F.observationFixture},parsed={};
    for(const [kind,fixture] of Object.entries(fixtures)){parsed[kind]=C.parseInstrument(j(fixture),kind,ic).instrument;assert(parsed[kind].kind===kind&&C.instrumentEntries(parsed[kind]).length>0,'工具解析失败');assert(C.parseInstrument('{}',kind,ic)===null,'空核心工具未拒绝');assert(!C.instrumentChecks(parsed[kind],ic).length,'标准工具误报规则');const duplicate=structuredClone(fixture);if(kind==='questionnaire'){duplicate.items[1].id='Q1';duplicate.review=[{itemId:'Q1'}];}else if(kind==='interview')duplicate.warmup[0].id='';else duplicate.dimensions[0].indicators[0].id='';const result=C.parseInstrument(j(duplicate),kind,ic);assert(!result.instrument.review.length&&result.warnings.includes('review'),'失效编号未重排清审查');}
    const q=C.parseInstrument(j({...F.questionnaireFixture,scale:{type:'未知',labels:[]}}),'questionnaire',{...ic,scaleName:'参考量表'}).instrument;assert(q.scale.type==='5点'&&q.scale.labels.length===5&&q.adaptationNotice===C.ADAPTATION_NOTICE,'量表回退或改编声明错误');
    const ob=structuredClone(F.observationFixture);ob.dimensions[0].indicators[1].levels=['一级'];assert(C.parseInstrument(j(ob),'observation',ic).instrument.dimensions[0].indicators[1].levels[1]==='待补充标准','等级标准未补');
    assert(C.parseInstrument(j({...F.interviewFixture,closing:null}),'interview',ic).instrument.closing===null,'访谈缺收尾被补造');
    const largeQ=structuredClone(F.questionnaireFixture);largeQ.title='题'.repeat(160);largeQ.items=Array.from({length:45},(_,i)=>({...largeQ.items[0],id:'Q'+(i+1),text:'题'.repeat(160)}));largeQ.dimensions=Array.from({length:8},(_,i)=>({name:'维度'+i,definition:'定义',source:'教师'}));largeQ.demographics=Array.from({length:8},()=>({label:'年级',options:Array(10).fill('五'.repeat(40))}));largeQ.pending=Array(8).fill('核实');largeQ.administration.notes=Array(8).fill('匿名');largeQ.review=Array.from({length:40},(_,i)=>({itemId:'Q'+(i+1),issue:'其他',action:'保留'}));const lq=C.parseInstrument(j(largeQ),'questionnaire',ic).instrument;
    assert(lq.items.length===40&&lq.items[0].text.length===150&&lq.title.length===150,'问卷题量或文字上限');assert(lq.dimensions.length===6&&lq.demographics.length===6&&lq.demographics[0].options.length===8&&lq.demographics[0].options[0].length===30,'问卷维度和人口学上限');assert(lq.review.length===30&&lq.pending.length===5&&lq.administration.notes.length===5,'审查与辅助数组上限');
    const largeI=structuredClone(F.interviewFixture);largeI.warmup=Array.from({length:5},(_,i)=>({id:'W'+(i+1),text:'暖场'}));largeI.blocks=Array.from({length:10},(_,i)=>({id:'B'+(i+1),topic:'话题',main:'问题',probes:Array.from({length:8},(_,n)=>({id:'B'+(i+1)+'-'+(n+1),text:'追问'}))}));largeI.opening='字'.repeat(450);largeI.consentPoints=Array(8).fill('自愿');largeI.fieldNotes=Array(8).fill('整理');const li=C.parseInstrument(j(largeI),'interview',ic).instrument;assert(li.warmup.length===3&&li.blocks.length===8&&li.blocks.every(b=>b.probes.length===5),'访谈核心数组上限');assert(li.opening.length===400&&li.consentPoints.length===6&&li.fieldNotes.length===6,'访谈长文字与附加数组上限');
    const largeO=structuredClone(F.observationFixture);largeO.dimensions=Array.from({length:7},(_,di)=>({name:'维度'+di,indicators:Array.from({length:10},(_,i)=>({id:'O'+(di*10+i+1),behavior:'行为',record:'等级',levels:['一','二','三','四']}))}));largeO.sampling.slots=Array(15).fill('时'.repeat(30));largeO.recordingRules=Array(8).fill('规则');largeO.ethics=Array(8).fill('编号');const lo=C.parseInstrument(j(largeO),'observation',ic);assert(lo.instrument.dimensions.length===6&&lo.instrument.dimensions[0].indicators.length===8&&C.instrumentEntries(lo.instrument).length===30,'观察全局和分组上限');assert(lo.warnings.includes('dimensions')&&lo.instrument.sampling.slots.length===10&&lo.instrument.sampling.slots[0].length===20&&lo.instrument.recordingRules.length===5&&lo.instrument.ethics.length===5,'观察截断警告及辅助数组上限');
    const manyDesign=C.parseDesign(j({...F.designFixture,plan:Array(8).fill(F.designFixture.plan[0]),ethics:Array(9).fill('匿名'),pending:Array(8).fill('核实')})).design;assert(manyDesign.plan.length===4&&manyDesign.ethics.length===6&&manyDesign.pending.length===5,'设计数组上限');
    const common=`【工具类型】问卷\n【来源】从零起草\n【研究问题】${ic.question}\n【子问题】${ic.subQuestion}`;assert(w.buildUserMessage(ic)===common+`\n【填答对象】${ic.respondent}（${ic.stage}）\n【维度】\n未提供，请拟定 2 至 4 个\n【每个维度题数】${ic.perDimension}\n【量表类型】${ic.scale}\n【人口学信息】需要\n【参考的成熟量表】无`,'完整问卷消息模板不一致');
    const reviewed=C.parseReview(j({review:[{itemId:'Q1',issue:'双重问题',original:'假原句',action:'改写',suggestion:'新原句',reason:'一题一事'},{itemId:'Q99',issue:'其他'}],summary:'总体评价'}),q);assert(reviewed.review.length===1&&reviewed.review[0].original===q.items[0].text,'审查ID或原句未绑定');assert(C.parseReview('{}',q)===null,'无审查数组未拒绝');
    const iq={...q,review:reviewed.review},original=j(iq),adopt=C.applySuggestion(iq,0);assert(adopt.items[0].text==='新原句'&&adopt.review[0].status==='已采用'&&j(iq)===original,'采用建议改了输入对象');assert(C.applySuggestion(C.updateEntry(iq,'Q1','手动修改'),0).items[0].text==='手动修改','过期建议覆盖新原句');
    const deleted=C.removeEntry(iq,'Q1');assert(deleted.items[0].id==='Q2'&&deleted.review[0].status==='条目已删除','删除后重号或未标记');const adoptDelete=C.applySuggestion({...iq,review:[{...reviewed.review[0],action:'删除'}]},0);assert(adoptDelete.items.length===2&&adoptDelete.review[0].status==='已采用','采用删除未生效');
    const maxQ={...q,items:Array.from({length:40},(_,i)=>({...q.items[0],id:'Q'+(i+1)}))};assert(C.addEntry(maxQ,{type:'item'})===maxQ,'达到上限未原样返回');assert(C.addEntry(parsed.interview,{type:'closing'})===parsed.interview,'已有收尾重复新增');
    assert(C.addEntry(deleted,{type:'item',group:'完成经历'}).items.at(-1).id==='Q4','新增编号错误');
    const cases=[
      ['questionnaire',x=>x.instructions='自愿','没有写明匿名'],['questionnaire',x=>x.instructions='匿名','没有写明自愿'],['questionnaire',x=>x.items[0].reverse=true,'反向题'],['questionnaire',x=>x.items.pop(),'建议 3 至 6 道'],['questionnaire',x=>x.items[0].dimension='未分维度','没有归入维度'],['questionnaire',x=>x.demographics.push({label:'姓名',options:[]}),'可能识别个人'],['questionnaire',x=>x.items=Array.from({length:31},(_,i)=>({...x.items[0],id:'Q'+i})),'填答时间'],
      ['interview',x=>x.opening='匿名，自愿，可停止','没有提到录音'],['interview',x=>x.opening='录音，自愿，可停止','没有提到匿名'],['interview',x=>x.opening='录音，匿名','可以不回答'],['interview',x=>x.blocks.pop(),'建议 2 至 3 个'],['interview',x=>x.blocks[0].main='你喜不喜欢作业？','封闭式'],['interview',x=>x.warmup=[],'没有暖场'],['interview',x=>x.closing=null,'没有收尾'],
      ['observation',x=>x.dimensions[0].indicators[0].behavior='很专注','推断性词语'],['observation',x=>x.dimensions[0].indicators=Array.from({length:21},(_,i)=>({...x.dimensions[0].indicators[0],id:'O'+i})),'现场难以记全'],['observation',x=>x.sampling.slots=[],'没有列出'],['observation',x=>x.sampling={mode:'事件取样',rule:'',slots:[]},'起止'],['observation',x=>x.dimensions[0].indicators[1].levels=['','',''],'标准不完整']
    ];
    for(const [kind,mutate,hit] of cases){const sample=structuredClone(parsed[kind]);mutate(sample);assert(C.instrumentChecks(sample,ic).some(s=>s.includes(hit)),'规则未命中：'+hit);assert(!C.instrumentChecks(parsed[kind],ic).some(s=>s.includes(hit)),'规则误命中：'+hit);}
    assert(C.instrumentChecks(q,{...ic,stage:'小学低年级（1–3年级）'}).some(s=>s.includes('4 点或 5 点')),'低年级量表未提醒');assert(!C.instrumentChecks(q,ic).some(s=>s.includes('4 点或 5 点')),'高年级量表误提醒');
    assert(C.instrumentChecks({...parsed.interview,duration:'30'},ic).some(s=>s.includes('不超过 20')),'小学生访谈时长未提醒');assert(!C.instrumentChecks(parsed.interview,ic).some(s=>s.includes('不超过 20')),'短访谈误提醒');
    const storage={data:new Map(),getItem(k){return this.data.get(k)||null;},setItem(k,v){this.data.set(k,v);},removeItem(k){this.data.delete(k);}};
    assert(C.writeHandoff(storage,'a',{to:'design',question:'x'.repeat(400),titles:['y'.repeat(80)],mode:'bad',respondent:'unknown',stage:'unknown'},100),'交接写入失败');assert(C.takeHandoff(storage,'b','design',200)===null&&C.takeHandoff(storage,'a','instrument',200)===null&&storage.data.size===1,'交接账号或目标隔离失败');const hand=C.takeHandoff(storage,'a','design',200);assert(hand.question.length===300&&hand.titles[0].length===60&&!hand.mode&&!hand.respondent&&!hand.stage&&C.takeHandoff(storage,'a','design',200)===null,'交接清洗或一次性失败');C.writeHandoff(storage,'a',{to:'design'},100);assert(C.takeHandoff(storage,'a','design',100+C.HANDOFF_TTL+1)===null&&storage.data.size===0,'交接未过期');
    for(const kind of C.INSTRUMENT_KINDS){const message=w.buildUserMessage({...ic,kind,source:'审查我的草稿',draft:'第一行\n第二行'});assert(message.endsWith('【草稿】\n第一行\n第二行')&&!message.includes('【每个维度题数】'),'审查模板失真');const reviewMessage=w.buildReviewMessage(C.addEntry(parsed[kind],kind==='interview'?{type:'warmup'}:{type:kind==='questionnaire'?'item':'indicator',group:parsed[kind].dimensions[0].name}),{...ic,kind});assert(reviewMessage.includes('【当前条目】')&&!reviewMessage.endsWith('］'),'复审发送空文字');const tsv=C.instrumentTsv(parsed[kind]).split('\n').map(r=>r.split('\t'));assert(tsv.every(r=>r.length===tsv[0].length),'工具TSV列不一致');}
    const formula=structuredClone(F.designFixture);formula.plan[0].subQuestion='=SUM(A1)\t换行\n';assert(C.designPlanTsv(formula).includes("'=SUM(A1) 换行 "),'TSV公式或分隔符未清洗');formula.plan[0].tool='工具|备注';assert(C.designToMarkdown(formula,dc).includes('工具\\|备注'),'Markdown未转义');
    globalThis.SafeRender={escape:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),markdown:s=>String(s)};await importSource('js/site-copy.js');await importSource('js/research-methods.js');const c=globalThis.SiteCopy.defaults('research');
    const attack='<img src=x onerror=alert(1)><script>alert(1)</script>',dx=structuredClone(F.designFixture);dx.analysis.focus=attack;const qx=structuredClone(q);qx.items[0].text=attack;qx.title=attack;
    for(const html of [ResearchMethods.designHTML(dx,dc,c),ResearchMethods.instrumentHTML(qx,ic,c),ResearchMethods.printDocument(qx,ic,c).html])assert(!html.includes('<img src=x')&&!html.includes('<script>'),'模型HTML未转义');
    const brief=ResearchMethods.designHTML(designParsed.design,dc,c),fold=brief.indexOf('rs-design-full');
    assert(brief.slice(0,fold).includes(F.designFixture.recommended[0].limits)&&brief.slice(0,fold).includes(F.designFixture.ethics[0])&&brief.slice(0,fold).includes(F.designFixture.pending[0]),'精简设计隐藏了限制、伦理或待核实事项');
    assert(brief.includes('rs-design-plan')&&brief.includes('data-design-row="0"')&&brief.includes('rs-design-table')&&!brief.includes('rs-design-full" open'),'精简安排、交接或完整设计展开缺失');
    const conflict=ResearchMethods.designHTML({...designParsed.design,titleCheck:{...designParsed.design.titleCheck,conflict:'缺少平行班',suggestion:'改为行动研究'}},dc,c);
    assert(conflict.indexOf('缺少平行班')<conflict.indexOf('rs-design-full'),'题目冲突被收进详细设计');
    assert(d.buildUserMessage(dc).includes('【文字精简】')&&d.buildUserMessage(dc).includes('不得遗漏重要限制'),'生成请求未要求简洁并保留重要限制');
    const print=ResearchMethods.printDocument(q,ic,c);assert(!print.html.includes('反向题')&&!print.html.includes('完成经历')&&!print.landscape,'问卷打印泄露内部维度');assert(ResearchMethods.printDocument(parsed.observation,ic,c).landscape,'观察打印不是横向');

    }
    console.log(`科研写作回归通过：${passed} 项断言（全部合成数据，无真实模型调用）。`);
} finally {globalThis.fetch=originalFetch;globalThis.window=originalWindow;}
