#!/usr/bin/env node
// Loopback-only workbook preview. All accounts and works are fictional and held in memory.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.WORKBOOK_PREVIEW_PORT || 8769);
const lesson = `# 分数的初步认识\n\n## 教学目标\n\n1. 在分物活动中理解平均分，认识几分之一。\n2. 用折纸、涂色和语言描述一个整体的几分之一。\n3. 交流不同分法，说明分数表示的意义。\n\n## 课堂活动\n\n### 从分享一块月饼开始\n\n两个人怎样公平地分享一块月饼？请学生先画一画，再说说自己的理由。关注学生是否把“分成两份”和“平均分成两份”区别开来。\n\n| 环节 | 活动安排 | 观察重点 |\n| --- | --- | --- |\n| 情境导入 | 讨论两人分享一块月饼 | 是否主动提出平均分 |\n| 动手探究 | 折纸并涂出二分之一 | 分法不同但每份相等 |\n| 交流表达 | 用自己的话解释分数 | 能说清整体、份数与一份 |\n\n## 课后练习\n\n画出一个正方形的四分之一，并解释为什么不同的画法都成立。`;
const items = [
    ['lesson','lesson-design','教学设计助手','三年级数学《分数的初步认识》教学设计','draft','分数单元备课',lesson],
    ['quiz','quiz-gen','出题助手','分数的初步认识 · 分层练习与参考答案','draft','分数单元备课','# 分层练习\n\n## 基础练习\n\n把一个圆平均分成四份，涂出其中的一份。写出对应的分数，并说说分母表示什么。\n\n## 拓展练习\n\n两张大小不同的纸，分别涂出二分之一，涂色部分的面积一定相等吗？请解释。'],
    ['reading','research-reading-card','文献研读伙伴','合作学习中的同伴反馈：文献精读卡','draft','课堂反馈研究','# 文献精读卡\n\n## 研究关注\n\n示例文献关注同伴反馈的具体方式，以及反馈如何被学习者理解与采纳。此处为虚构阅读记录，不对应真实研究结论。\n\n## 对课堂的启发\n\n设计明确的反馈问题，先邀请学生描述观察到的现象，再提出一个可以执行的修改建议。'],
    ['reflection','teaching-reflection','教学反思助手','小组讨论课后反思：让每个学生有话可说','draft','课堂反馈研究','# 课后反思\n\n## 本次观察\n\n部分小组的发言集中在少数成员，其他学生更多承担记录工作。\n\n## 下次调整\n\n先独立写出观点，再轮流分享；每位学生带着一条同伴的意见回到全班交流。'],
    ['chat','socratic','苏格拉底助手','如何用问题引导学生理解“平均分”','chat','分数单元备课','# 对话记录\n\n## 我的提问\n\n怎样让学生自己发现平均分的重要性？\n\n## 讨论记录\n\n可以先呈现两种分法，邀请学生判断是否公平，再用折叠或重叠的方法验证。不要直接给出定义，先让学生描述每一份之间的关系。'],
    ['parent','parent-comm','家校沟通助手','关于家庭阅读习惯的家校沟通提纲','draft','','# 家校沟通提纲\n\n## 先了解家庭阅读情况\n\n邀请家长分享孩子喜欢的书和方便阅读的时间，不把阅读时长作为唯一标准。\n\n## 共同尝试\n\n每周选择一个固定时段，家长与孩子各分享一段喜欢的文字，先持续两周，再交流实际感受。']
];
const works = items.map(([id,agentId,agentName,title,workType,project,content],i)=>({
    id:'demo-'+id,agentId,agentName,title,workType,agentType:workType==='chat'?'chat':'form',content,
    createdAt:new Date(Date.UTC(2026,10,3-i,8)).toISOString(),updatedAt:new Date(Date.UTC(2026,10,3-i,9)).toISOString(),
    inputs:{subject:'数学',grade:'小学三年级',topic:'分数的初步认识',...(project?{_projectId:project,_projectTitle:project}:{}),...(agentId.startsWith('research-')?{_module:'research'}:{})}
}));
const authStub = `let _currentUser=new URLSearchParams(location.search).get('state')==='guest'?null:{uid:'workbook-demo',name:'示例教师',email:'demo@example.invalid',emailVerified:true};
const _authReady=true;const auth={currentUser:null,signOut:async()=>{}};
function onAuthReady(fn){queueMicrotask(()=>fn(_currentUser));}function rememberLastAuthUser(){}
window.PrivacyUI={open:()=>showToast('本地预览使用虚构账号')};`;
const dataStub = `const demoState=new URLSearchParams(location.search).get('state');
let demoWorks=demoState==='empty'?[]:${JSON.stringify(works)};
if(demoState==='long'){demoWorks[0].title='三年级数学《分数的初步认识》单元教学设计与课堂活动调整记录：基于操作、观察和交流的完整方案';demoWorks[0].content+=('\n\n## 补充观察记录\n\n请根据课堂实际记录学生的解释、操作过程和讨论中提出的问题。'.repeat(30));}
const DB={getMyWorks:async()=>{if(demoState==='error')throw new Error('示例：网络暂时不可用，请重试');return structuredClone(demoWorks);},
getPageCopy:async()=>null,renameWork:async(id,title)=>{demoWorks.find(w=>w.id===id).title=title;},deleteWork:async id=>{demoWorks=demoWorks.filter(w=>w.id!==id);},
saveWork:async raw=>{const id='demo-revision-'+Date.now();demoWorks.unshift({...structuredClone(raw),id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});return id;}};`;
const ignored = new Set(['/js/privacy-ui.js','/js/email-gate.js','/js/assistant.js','/js/pwa.js','/js/operations-analytics.js','/js/analytics.js']);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.json':'application/json'};
const server=createServer(async(req,res)=>{
    try {
        const url=new URL(req.url,'http://127.0.0.1');
        res.setHeader('Cache-Control','no-store');
        res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-src 'none'");
        if(url.pathname.startsWith('/api/')){res.writeHead(501,{'Content-Type':'application/json'});res.end('{"ok":false,"msg":"本地示例不连接业务接口"}');return;}
        if(url.pathname==='/js/firebase-config.js'||url.pathname==='/js/data.js'||ignored.has(url.pathname)||url.pathname.startsWith('/vendor/firebase/')){
            res.setHeader('Content-Type',types['.js']);res.end(url.pathname==='/js/firebase-config.js'?authStub:url.pathname==='/js/data.js'?dataStub:'/* isolated preview */');return;
        }
        let pathname=decodeURIComponent(url.pathname);
        if(pathname==='/')pathname='/workspace';
        if(!extname(pathname))pathname+='.html';
        const file=resolve(root,'.'+pathname);
        if(!file.startsWith(root.endsWith(sep)?root:root+sep)||!types[extname(file)])throw new Error('Unavailable');
        let body=await readFile(file);
        if(extname(file)==='.html')body=body.toString().replace('</body>','<aside style="position:fixed;bottom:8px;left:8px;z-index:9000;padding:5px 10px;background:#fff;border:1px solid #d8e0e7;border-radius:6px;font:12px system-ui;color:#52616e">本地预览 · 示例内容</aside></body>');
        res.setHeader('Content-Type',types[extname(file)]);res.end(body);
    }catch{res.writeHead(404);res.end('本地预览：文件不存在');}
});
server.listen(port,'127.0.0.1',()=>console.log('备课本示例预览：http://127.0.0.1:'+port+'/workspace（仅虚构数据；Ctrl+C 停止）'));
