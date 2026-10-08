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
    const [f,r] = RESEARCH_AGENTS, C = ResearchCore;
    assert(RESEARCH_AGENTS.length===2 && f.id==='research-funnel' && r.id==='research-reading-card','两个科研智能体定义不正确');
    for (const a of RESEARCH_AGENTS) assert(a.name && a.system, '智能体缺少名称或系统提示');
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
    const parts=C.extractFunnelResult([{role:'assistant',content:both}]);
    assert(C.extractFunnelResult([{role:'assistant',content:both},{role:'assistant',content:'## 研究问题聚焦结果\n新的研究问题'}]).titles==='', '重新聚焦后旧标题仍与新结果混合');
    assert(parts.question==='怎样提升参与？'&&parts.focus.startsWith('## 研究问题聚焦结果')&&!parts.focus.includes('## 五种结构的标题')&&parts.titles.startsWith('## 五种结构的标题'),'结果提取未切开两个块');
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
    assert(markdown.includes('原文未明确')&&markdown.includes('我的研究问题：我的问题'),'Markdown 研究问题或未明确标记缺失');
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
    for(const agentId of ['research-funnel','research-reading-card']){
        let providerCount=0,model='';
        globalThis.fetch=async(url,options)=>{
            if(String(url).includes('accounts:lookup'))return new Response(JSON.stringify({users:[{localId:agentId+'-test',email:'teacher@example.invalid',emailVerified:true}]}),{headers:{'Content-Type':'application/json'}});
            providerCount++;model=JSON.parse(options.body).model;return new Response('模拟供应商不可用',{status:501});
        };
        const response=await agent.onRequestPost({request:new Request('https://site.test/api/agent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'system',content:'系统'},{role:'user',content:'教学研究'}],idToken:'test-token',agentId,curriculum:null})}),env:{ZHIPU_API_KEY:'fake-test-key'}});
        assert(![400,422].includes(response.status)&&providerCount===1,'科研调用被课程闸门误拦截');
        assert(model==='glm-5.2','科研智能体未优先使用 GLM');
    }
    console.log(`科研写作回归通过：${passed} 项断言（全部合成数据，无真实模型调用）。`);
} finally {globalThis.fetch=originalFetch;globalThis.window=originalWindow;}
