#!/usr/bin/env node
// Deliberately separate from production: synthetic in-memory data, loopback only,
// no auth service, database, email, model or external network connection.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { eventFromPayload, summary } from '../server/local-analytics.mjs';
import { encodeFields, decodeFields } from '../server/local-firestore-store.mjs';
import { scrubRow } from './clean-analytics-personal-fields.mjs';

const root = new URL('../',import.meta.url);
const admin = readFileSync(new URL('admin.html',root),'utf8');
const styles = admin.match(/<style>([\s\S]*?)<\/style>/)[1];
const renderers = admin.slice(admin.indexOf('function analyticsEscape('),admin.indexOf('// ===== MODAL HELPERS ====='));
const day = new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const profile = {name:'林老师（虚构）',school:'示范小学（虚构）',account:'teacher@example.invalid'};
const profiles = new Map([['demo-teacher',profile]]);
const visitorId=`v_${randomUUID()}`,sessionId=`s_${randomUUID()}`;
const events = ['page_view','agent_open','agent_run','teacher_reviewed','workbook_save'].map(action=>({
    ...eventFromPayload({action,feature:'agents',path:'/agents',targetId:'lesson-design',visitorId,sessionId,
        meta:action==='agent_run'?{durationMs:1200}:{}},{uid:'demo-teacher'}),
    userName:'旧姓名（虚构）',userSchool:'旧学校（虚构）',userEmail:'old@example.invalid',userPhone:''
}));
let latest=null,cleaned=false;
const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>阶段一 · 本地隐私验收</title><link rel="stylesheet" href="/css/style.css"><style>${styles}
body{padding:24px;max-width:1280px;margin:auto} .demo-controls{display:flex;flex-wrap:wrap;gap:12px;margin:20px 0}
.demo-controls button{padding:10px 16px;cursor:pointer;border:1px solid var(--line);background:white;border-radius:7px;font:inherit}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:white;padding:16px;border:1px solid var(--line)}
</style></head><body><h1>阶段一 · 本地隐私验收</h1><p>仅使用虚构数据，运行在本机内存中。此页面复用管理后台的看板显示程序，不连接生产数据库，不修改正式登录或权限。</p>
<p>清理工具另有真实 MariaDB 测试；下面的“清理”按钮仅演示字段删除后的看板效果。</p>
<div class="demo-controls"><button onclick="demo('track')">模拟一次访问</button><button onclick="demo('rename')">修改虚构教师资料</button>
<button onclick="demo('missing')">模拟资料不存在</button><button onclick="demo('restore')">恢复虚构资料</button>
<button onclick="demo('clean')">演示清理旧记录</button></div>
<p id="demo-status" role="status"></p><details open><summary>最近一次新记录（可检查没有姓名、邮箱、手机号、学校）</summary><pre id="demo-event">点击“模拟一次访问”查看。</pre></details>
<div id="analytics-content"></div><script src="/js/safe-render.js"></script><script>
let _adminUsers=[],_analyticsLoaded=false,_analyticsLoading=false;
${renderers}
async function demo(action='view') {
 const response=await fetch('/demo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action})});
 const data=await response.json();if(!response.ok)throw new Error(data.msg);
 renderAnalyticsContent(data.summary);
 document.getElementById('demo-event').textContent=data.latest?JSON.stringify(data.latest,null,2):'点击“模拟一次访问”查看。';
 document.getElementById('demo-status').textContent=data.status;
}
demo().catch(error=>document.getElementById('demo-status').textContent=error.message);
</script></body></html>`;
const assets = new Map(['/css/style.css','/js/safe-render.js'].map(path=>[path,new URL(path.slice(1),root)]));
const server=createServer(async(req,res)=>{
    const path=new URL(req.url,'http://127.0.0.1').pathname;
    const headers={'Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'",'X-Content-Type-Options':'nosniff'};
    if(req.method==='GET'&&path==='/') {res.writeHead(200,{...headers,'Content-Type':'text/html; charset=utf-8'});res.end(html);return;}
    if(req.method==='GET'&&assets.has(path)){res.writeHead(200,{...headers,'Content-Type':path.endsWith('.css')?'text/css':'application/javascript'});res.end(readFileSync(assets.get(path)));return;}
    if(req.method==='POST'&&path==='/demo') {
        try {
            let body='';for await(const chunk of req){body+=chunk;if(body.length>1000)throw new Error('请求过大');}
            const {action}=JSON.parse(body);
            if(action==='track') {
                latest=eventFromPayload({action:'page_view',feature:'agents',path:'/agents?private=虚构文字',visitorId,sessionId,
                    user:{name:'不应保存',email:'不应保存',phone:'不应保存',school:'不应保存'},meta:{input:'不应保存'}},{uid:'demo-teacher'});
                events.push(latest);
            }
            if(action==='rename')profiles.set('demo-teacher',{...profile,name:'林老师（资料已修改）',school:'新的示范学校（虚构）'});
            if(action==='missing')profiles.delete('demo-teacher');
            if(action==='restore')profiles.set('demo-teacher',profile);
            if(action==='clean') {
                for(let i=0;i<events.length;i++)events[i]=decodeFields(JSON.parse(scrubRow({fields_json:JSON.stringify(encodeFields(events[i])),raw_json:JSON.stringify({fields:encodeFields(events[i])})}).fields_json));
                cleaned=true;
            }
            res.writeHead(200,{...headers,'Content-Type':'application/json; charset=utf-8'});
            res.end(JSON.stringify({summary:summary([...events].reverse(),[day],profiles),latest,
                status:`当前虚构事件 ${events.length} 条。${cleaned?'旧记录中的四项个人资料已删除，事件条数保持不变。':'旧记录保留虚构旧资料，但看板始终只从用户资料取得姓名和学校。'}`}));
        } catch {res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({msg:'无效演示请求'}));}
        return;
    }
    res.writeHead(404);res.end();
});
const port=Number(process.env.ANALYTICS_PREVIEW_PORT || 8766);
server.listen(port,'127.0.0.1',()=>console.log(`本地虚构数据验收：http://127.0.0.1:${port}/\n按 Ctrl+C 关闭，数据随进程退出删除。`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.closeAllConnections();server.close();});
