import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {recordOperation,summarizeOperations,operationsSummary,initializeOperations,chinaDay} from '../server/operations-analytics.mjs';
import {onRequestPost} from '../server/local-analytics.mjs';
import {onRequestPost as saveWork} from '../server/local-works.mjs';
const source=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
let checks=0; const check=(v,msg)=>{assert.ok(v,msg);checks++;};
const P=globalThis.OperationsPolicy;
const sensitive='不可进入运营统计的姓名正文题目';
const raw={action:'page_view',path:'/research?question='+sensitive+'#'+sensitive,
    uid:sensitive,user:sensitive,visitorId:sensitive,sessionId:sensitive,ip:sensitive,userAgent:sensitive,
    targetName:sensitive,meta:{input:sensitive,output:sensitive,school:sensitive}};
check(!JSON.stringify(P.normalize(raw)).includes(sensitive),'自由文字和标识被过滤');
check(P.normalize(raw).targetId==='research','页面白名单正确');
check(P.normalize(P.normalize(raw)).targetId==='research','规范化后仍保留正确页面');
for(const action of ['agent_run','generation_failed','workbook_save','teacher_reviewed','result_feedback']){
    assert.throws(()=>P.normalize({...raw,action,targetId:'lesson-design'}));checks++;
}
for(const targetId of ['lesson-design','research-funnel','research-design','research-instrument'])check(P.normalize({action:'agent_run',targetId,meta:{durationMs:100}},true).targetId===targetId,'允许固定伙伴 '+targetId);
assert.throws(()=>P.normalize({...raw,path:'/secret/'+sensitive}));checks++;
check(chinaDay('2026-10-13T16:00:00Z')==='2026-10-14','中国日期边界');
const summary=summarizeOperations([{day:'2026-10-14',action:'agent_run',target_id:'research-funnel',count:2,duration_ms:2000},
    {day:'2026-10-14',action:'workbook_save',count:1},{day:'2026-10-14',action:'page_view',count:3}],
    ['2026-10-13','2026-10-14'],'2026-10-14T00:00:00Z',[{day:'2026-10-13',count:4}]);
check(summary.daily[0].pageViews===null&&summary.daily[1].pageViews===3,'缺失历史与真实计数区分');
check(summary.totals.visitors===null&&summary.totals.loggedUsers===null&&summary.users.length===0,'无访客识别与个人明细');
check(summary.totals.averageGenerationMs===1000&&summary.totals.workbookUses===1&&summary.totals.existingWorks===4,'耗时、保存与业务历史口径');
check(summarizeOperations([],['2026-10-12'],'2026-10-14T00:00:00Z').totals.agentRuns===null,'未采集不显示零');
check(summarizeOperations([],['2026-10-14'],'2026-10-14T00:00:00Z').totals.agentRuns===0,'已启用无记录显示零');

// Browser: no storage, identity, credentials, full URLs or duplicate page loads.
const requests=[],listeners=new Map();
const ctx=vm.createContext({console,Date,URL,AbortSignal,
    document:{readyState:'loading',visibilityState:'visible',addEventListener:(name,fn)=>listeners.set(name,fn)},
    location:{pathname:'/research',search:'?private',hash:'#private'},
    fetch:async(url,options)=>{const body=JSON.parse(options.body);requests.push({url,body,options});return {ok:true,json:async()=>body.action==='operations-status'?{enabled:true}:{recorded:true}};}
});
vm.runInContext('window=globalThis',ctx);
for(const file of ['js/analytics-policy.js','js/operations-policy.js','js/analytics.js','js/operations-analytics.js'])vm.runInContext(source(file),ctx);
await ctx.Analytics.track('page_view');check(requests.length===0,'研究通道仍不发送');
listeners.get('DOMContentLoaded')();await new Promise(r=>setTimeout(r,0));
listeners.get('visibilitychange')();await new Promise(r=>setTimeout(r,0));
check(requests.filter(r=>r.body.action==='operations-track').length===1,'可见页面只计一次');
await ctx.OperationsAnalytics.track('agent_open',{...raw,targetId:'research-funnel'});
check(!JSON.stringify(requests.map(r=>r.body)).includes(sensitive),'浏览器仅发送允许的汇总维度');
check(requests.every(r=>r.options.credentials==='omit'&&r.options.referrerPolicy==='no-referrer'),'不带账号凭证或来源参数');
await ctx.OperationsAnalytics.track('agent_run',{targetId:'research-funnel'});
check(requests.filter(r=>r.body.action==='operations-track').length===2,'浏览器不伪造模型成功计数');

const real=process.env.ADMIN_TEST_ALLOW_CREATE==='yes';
const {adminFixture}=await import(real?'./fixtures/admin-mariadb.mjs':'./fixtures/admin-store.mjs');
const fixture=await adminFixture(),env={...fixture.env,T_TRAINING_OPERATIONS_ANALYTICS:'1'};
const invoke=async body=>{
 const response=await onRequestPost({env,request:new Request('http://127.0.0.1/api/analytics',{method:'POST',headers:{'Content-Type':'application/json','Origin':'http://127.0.0.1'},body:JSON.stringify(body)})});
 return {status:response.status,body:await response.json()};
};
try{
    check((await invoke({action:'operations-summary'})).status===401,'无管理员凭证不能查看');
    check((await invoke({action:'operations-summary',adminIdToken:fixture.teacherToken})).status===403,'普通老师不能查看');
    check((await invoke({action:'operations-status'})).body.enabled===true,'启用状态');
    const started=await initializeOperations(env);
    await initializeOperations(env);check(await initializeOperations(env)===started,'初始化保留首次启用时间');
    await Promise.all(Array.from({length:40},()=>recordOperation(env,{action:'page_view',path:'/research'})));
    await recordOperation(env,{action:'agent_run',targetId:'research-funnel',meta:{durationMs:1200}},{trusted:true});
    await recordOperation(env,{action:'generation_failed',targetId:'research-funnel'},{trusted:true});
    const before=await operationsSummary(env,14);
    check(before.totals.pageViews===40&&before.totals.agentRuns===1&&before.totals.generationFailures===1,'并发计数不丢失');
    check((await invoke({action:'operations-track',counter:{action:'agent_run',targetId:'research-funnel'}})).status===400,'公网不能伪造服务端计数');
    check((await invoke({action:'operations-track',counter:raw})).body.recorded===true,'访问计数可匿名接收');
    check((await invoke({action:'track',event:raw})).body.recorded===false,'旧研究通道保持关闭');
    const foreign=await onRequestPost({env,request:new Request('http://127.0.0.1/api/analytics',{method:'POST',headers:{Origin:'https://foreign.invalid'},body:JSON.stringify({action:'operations-track',counter:raw})})});
    check(foreign.status===403,'跨站不能提交计数');

    const operations=[];
    const response=await saveWork({env,request:new Request('http://127.0.0.1/api/works',{method:'POST',body:JSON.stringify({action:'create',idToken:fixture.teacherToken,work:{agentId:'research-funnel',title:sensitive,content:sensitive}})}),onOperation:counter=>operations.push(recordOperation(env,counter,{trusted:true}))});
    check(response.status===200,'业务保存正常');await Promise.all(operations);
    const after=await invoke({action:'operations-summary',adminIdToken:fixture.token,days:14});
    check(after.body.totals.workbookSaves===1&&after.body.totals.existingWorks===1,'成功保存只计一次且业务成果可补统计');
    check(after.body.totals.pageViews===41&&!JSON.stringify(after.body).includes(sensitive),'汇总无正文或个人资料');
    const disabled=await operationsSummary({...env,T_TRAINING_OPERATIONS_ANALYTICS:'0'},14);
    check(disabled.totals.pageViews===null&&disabled.totals.existingWorks===1,'停用仍展示业务数据，未统计不伪装零');
    check(await recordOperation({...env,T_TRAINING_OPERATIONS_ANALYTICS:'0'},raw)===false,'停用不写计数');
    const hookFailure=await saveWork({env,request:new Request('http://127.0.0.1/api/works',{method:'POST',body:JSON.stringify({action:'create',idToken:fixture.teacherToken,work:{agentId:'research-funnel',content:'虚构成果'}})}),onOperation:()=>{throw new Error('统计失败');}});
    check(hookFailure.status===200,'统计失败不阻断业务保存');
    if(fixture.state){fixture.state.failOperations=true;check((await invoke({action:'operations-summary',adminIdToken:fixture.token})).status===500,'数据库失败不返回假零');fixture.state.failOperations=false;}
    // Render actual dashboard functions with only synthetic aggregate data.
    const html=source('admin.html'),renderers=html.slice(html.indexOf('function analyticsEscape('),html.indexOf('// ===== MODAL HELPERS ====='));
    const content={innerHTML:''},ui=vm.createContext({Date,Map,Math,Number,_adminUsers:[],document:{getElementById:()=>content}});
    vm.runInContext(renderers,ui);ui.renderAnalyticsContent(after.body);
    check(content.innerHTML.includes('每日运营趋势')&&!content.innerHTML.includes('登录用户使用明细')&&!content.innerHTML.includes(sensitive),'后台仅显示运营汇总');
    ui.renderAnalyticsContent(disabled);check(content.innerHTML.includes('尚未启用')&&content.innerHTML.includes('—'),'停用状态清晰');
}finally{await fixture.cleanup?.();}
console.log(`运营统计通过：${checks} 项（${real?'独立 MariaDB':'合成 SQL'}，无邮件、模型或生产业务写入）。`);
