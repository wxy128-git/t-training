import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {locateOperation} from '../server/operations-geo.mjs';
import {recordOperation,operationsSummary,initializeOperations,chinaDay} from '../server/operations-analytics.mjs';
import {initializeSources,normalizeSourceFilter,sourceSummary} from '../server/operations-sources.mjs';
import {onRequestPost as analytics} from '../server/local-analytics.mjs';
import {onRequestPost as register} from '../server/local-auth-proxy.mjs';
import {getPool} from '../server/local-auth-store.mjs';
let checks=0;
const check=(value,message)=>{assert.ok(value,message);checks++;};
const source=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const P=globalThis.OperationsPolicy;
const hidden='不应留存的私人搜索词';
const forbiddenFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw new Error('测试禁止外部查询');};
try{
    for(const ip of ['113.118.113.77','240e:3b7:3272:d8d0:db09:c067:8d59:539e','::ffff:113.118.113.77','::ffff:7176:714d']){
        const geo=await locateOperation(ip);
        check(geo.country==='中国'&&geo.region==='广东省'&&geo.city==='深圳市','离线 IPv4 / IPv6 / mapped 地址城市定位 '+ip);
        check(Object.keys(geo).length===3&&!JSON.stringify(geo).includes(ip),'仅返回地区，无 IP 或运营商');
    }
    for(const ip of ['127.0.0.1','10.1.2.3','192.168.1.2','100.64.0.1','169.254.1.1','203.0.113.1','::1','fc00::1','fe80::1','2001:db8::1','::ffff:192.168.1.2','invalid','8.8.8.8,1.1.1.1']){
        check((await locateOperation(ip)).country==='未知','私有、保留及非法地址为未知 '+ip);
    }
    const data=new Map(),requests=[];
    let time=Date.now();
    class Clock extends Date{static now(){return time;}}
    function browser(url,referrer='',storage=data){
        const listeners=new Map();
        const ctx=vm.createContext({console,URL,Date:Clock,AbortSignal,location:new URL(url),
            sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
            document:{referrer,readyState:'loading',visibilityState:'visible',addEventListener:(key,fn)=>listeners.set(key,fn)},
            fetch:async(url,options)=>{requests.push({url,options,body:JSON.parse(options.body)});return {ok:true,json:async()=>({enabled:true,recorded:true})};}});
        vm.runInContext('window=globalThis',ctx);
        for(const file of ['js/analytics-policy.js','js/operations-policy.js','js/operations-analytics.js'])vm.runInContext(source(file),ctx);
        return {ctx,listeners,channel:()=>ctx.OperationsAnalytics.headers()['X-Operations-Source']};
    }
    let b=browser('https://ai.teachailab.com/?utm_source=wechat&utm_campaign='+hidden,'https://example.invalid/'+hidden);
    check(b.channel()==='wechat','固定推广渠道优先');
    check(!JSON.stringify([...data]).includes(hidden)&&!JSON.stringify([...data]).includes('http'),'标签页只存固定渠道与时间');
    b=browser('https://ai.teachailab.com/research','https://ai.teachailab.com/');
    check(b.channel()==='wechat','站内换页保留入口渠道');
    b=browser('https://ai.teachailab.com/agents','https://www.baidu.com/s?wd='+hidden);
    check(b.channel()==='baidu','新的外部入口更新渠道');
    b=browser('https://ai.teachailab.com/research','https://ai.teachailab.com/agents');
    time+=30*60*1000+1;
    check(b.channel()==='unknown','标签页归因超过 30 分钟失效');
    for(const [ref,expected] of [['https://www.google.com/search?q='+hidden,'google'],['https://cn.bing.com/search?q='+hidden,'bing'],['https://mp.weixin.qq.com/s/'+hidden,'wechat'],['https://evilbaidu.com/'+hidden,'referral'],['https://baidu.com.evil.invalid/','referral'],['','direct']]){
        const test=browser('https://ai.teachailab.com/research',ref,new Map());
        check(test.channel()===expected,'来源域名边界 '+expected);
    }
    b=browser('https://ai.teachailab.com/?utm_source='+hidden,'',new Map());
    check(b.channel()==='direct','任意推广文本不进入渠道');
    b.listeners.get('DOMContentLoaded')();await new Promise(r=>setTimeout(r,0));
    b.listeners.get('visibilitychange')();await new Promise(r=>setTimeout(r,0));
    check(requests.filter(r=>r.body.action==='operations-track').length===1,'可见页面仍只计一次');
    check(requests.every(r=>r.options.credentials==='omit'&&r.options.referrerPolicy==='no-referrer'),'匿名统计不带凭证或完整来源网址');
    check(!JSON.stringify(requests).includes(hidden),'网络请求不含搜索词或推广原文');
    const expired=browser('https://ai.teachailab.com/?utm_source=wechat','',new Map());
    check(expired.channel()==='wechat','本页入口首次归类');time+=30*60*1000+1;
    check(expired.channel()==='unknown','同一页面停留超过 30 分钟不反复续用最初分享参数');
    check(P.source('__proto__')==='unknown'&&P.source('toString')==='unknown','渠道只允许自有白名单键');
    check(normalizeSourceFilter('agent:research-design').targetId==='research-design','特定伙伴筛选');
    check(normalizeSourceFilter('classroom:countdown').feature==='classroom','特定课堂工具筛选');
    check(normalizeSourceFilter('feature:research').feature==='research','栏目筛选');
    for(const value of ['agent:'+hidden,'feature:__proto__','classroom:countdown:extra',"feature:site' OR 1=1",{feature:'research'}])check(normalizeSourceFilter(value).value==='all','无效筛选不拼接 SQL');
}finally{globalThis.fetch=forbiddenFetch;}

const real=process.env.ADMIN_TEST_ALLOW_CREATE==='yes';
const {adminFixture}=await import(real?'./fixtures/admin-mariadb.mjs':'./fixtures/admin-store.mjs');
const fixture=await adminFixture(),env={...fixture.env,T_TRAINING_OPERATIONS_ANALYTICS:'1',T_TRAINING_OPERATIONS_SOURCES:'1',T_TRAINING_REGISTRATION_BACKEND:'local',T_TRAINING_DATA_BACKEND:'local',T_TRAINING_AUTH_BACKEND:'local'};
const request=(channel='wechat',ip='113.118.113.77')=>new Request('http://127.0.0.1/api/analytics',{method:'POST',headers:{'CF-Connecting-IP':ip,'X-Operations-Source':channel}});
const invoke=async(body,headers={})=>{
    const response=await analytics({env,request:new Request('http://127.0.0.1/api/analytics',{method:'POST',headers:{Origin:'http://127.0.0.1',...headers},body:JSON.stringify(body)})});
    return {status:response.status,body:await response.json()};
};
try{
    await initializeOperations(env);
    check((await invoke({action:'operations-status'})).body.sources===true,'公开状态明确显示来源开关，研究仍关闭');
    const started=await initializeSources(env);
    check(await initializeSources(env)===started,'独立来源启用时间幂等且与旧统计区分');
    await Promise.all(Array.from({length:40},()=>recordOperation(env,{action:'page_view',path:'/research'},{request:request()})));
    for(const action of ['agent_open','agent_run','generation_failed','workbook_save'])await recordOperation(env,{action,targetId:'research-funnel'},{trusted:true,request:request('baidu')});
    await recordOperation(env,{action:'classroom_open',targetId:'countdown'},{request:request('qq','8.8.8.8')});
    await recordOperation(env,{action:'page_view',path:'/agents',country:hidden,uid:hidden},{request:request(encodeURIComponent(hidden),'127.0.0.1')});
    let summary=await operationsSummary(env,14);
    check(summary.sources.totals.pageViews===41&&summary.totals.pageViews===41,'并发来源与原访问汇总一致');
    check(summary.sources.totals.opens===2&&summary.sources.totals.generations===1&&summary.sources.totals.failures===1&&summary.sources.totals.saves===1,'功能打开、生成成败与保存分别计数');
    check(summary.sources.regions.some(r=>r.label==='中国 · 广东省'&&r.pageViews===40),'按省份归并');
    check(summary.sources.channels.some(r=>r.label==='百度搜索'&&r.generations===1),'服务端生成沿用来源');
    check(summary.sources.channels.some(r=>r.label==='未识别'&&r.pageViews===1),'非法来源归为未知');
    const city=await operationsSummary(env,14,new Date(),{level:'city',filter:'agent:research-funnel'});
    check(city.sources.regions.length===1&&city.sources.regions[0].label==='中国 · 广东省 · 深圳市'&&city.sources.totals.pageViews===0&&city.sources.totals.generations===1,'城市与具体伙伴过滤');
    const classroom=await operationsSummary(env,14,new Date(),{level:'country',filter:'classroom:countdown'});
    check(classroom.sources.channels.length===1&&classroom.sources.channels[0].label==='QQ'&&classroom.sources.totals.opens===1,'国家与具体课堂工具过滤');
    check((await sourceSummary(env,['2026-01-01','2026-01-02'])).totals===null,'启用前来源不可补回，不显示零');
    const registration={action:'register',email:'source-test@example.invalid',password:'fixture-password-123',profile:{name:'虚构来源测试'}};
    const operations=[];
    const runRegistration=async body=>register({env,request:new Request('http://127.0.0.1/api/auth-proxy',{method:'POST',headers:{'CF-Connecting-IP':'113.118.113.77','X-Operations-Source':'wechat'},body:JSON.stringify(body)}),onOperation:counter=>operations.push(recordOperation(env,counter,{trusted:true,request:request()}))});
    check((await runRegistration(registration)).status===200,'真实注册处理函数成功');
    await Promise.all(operations);
    check((await runRegistration(registration)).status>=400&&operations.length===1,'重复注册不增加来源计数');
    check((await runRegistration({...registration,email:'invalid'})).status===400&&operations.length===1,'失败注册不计数');
    check((await invoke({action:'operations-track',counter:{action:'registration'}})).status===400,'客户端不能伪造注册成功');
    summary=await operationsSummary(env,14);
    check(summary.sources.totals.registrations===1&&summary.sources.channels.find(r=>r.label==='微信').registrations===1,'注册成功按渠道汇总');
    check((await invoke({action:'operations-summary'})).status===401,'来源汇总拒绝匿名');
    check((await invoke({action:'operations-summary',adminIdToken:fixture.teacherToken})).status===403,'来源汇总拒绝普通账号');
    check((await invoke({action:'operations-summary',adminIdToken:fixture.token,sourceFilter:'classroom:countdown'})).body.sources.totals.opens===1,'管理员筛选经真实接口生效');
    check((await invoke({action:'track',event:{action:'page_view'}})).body.recorded===false,'新授权不恢复研究采集');
    const serialized=JSON.stringify(summary.sources);
    for(const value of [hidden,'113.118.113.77','source-test@example.invalid','虚构来源测试','visitorId','sessionId'])check(!serialized.includes(value),'来源汇总无身份、IP 或正文 '+value);
    const disabled={...env,T_TRAINING_OPERATIONS_SOURCES:'0'};
    await recordOperation(disabled,{action:'page_view',path:'/research'},{request:request()});
    check((await operationsSummary(env,14)).sources.totals.pageViews===41,'停用来源不新增来源记录');
    check((await operationsSummary(disabled,14)).sources.totals===null,'停用来源显示未采集');
    check((await operationsSummary(env,14)).totals.pageViews===42,'停用来源不影响原运营计数');

    // Exercise the real HTTP adapter: it overwrites spoofed CF geo headers and carries context to server hooks.
    process.env.T_TRAINING_AUTH_BACKEND='local';process.env.T_TRAINING_DATA_BACKEND='local';
    const {createApiServer}=await import('../server/tencent-api.mjs');
    const server=createApiServer({env,publicOrigin:'http://127.0.0.1'});
    try{
        await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
        const base='http://127.0.0.1:'+server.address().port;
        const response=await fetch(base+'/api/auth-proxy',{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-For':'8.8.8.8,113.118.113.77','CF-Connecting-IP':'8.8.8.8','X-Operations-Source':'bing'},body:JSON.stringify({...registration,email:'adapter-source@example.invalid'})});
        check(response.status===200,'HTTP 注册链路成功');
        await Promise.all([...server.backgroundTasks]);
        const after=await operationsSummary(env,14,new Date(),{level:'city'});
        check(after.sources.regions.find(r=>r.label==='中国 · 广东省 · 深圳市')?.registrations===2,'代理覆盖伪造 IP，使用可信代理最后一跳');
        check(after.sources.channels.find(r=>r.label==='必应搜索')?.registrations===1,'HTTP 注册来源钩子已接通');
    }finally{await new Promise(resolve=>server.close(resolve));}

    const html=source('admin.html'),renderers=html.slice(html.indexOf('function analyticsEscape('),html.indexOf('// ===== MODAL HELPERS ====='));
    const content={innerHTML:''},ctx=vm.createContext({Date,Map,Math,Number,OperationsPolicy:P,_adminUsers:[],document:{getElementById:()=>content}});
    vm.runInContext(renderers,ctx);ctx.renderAnalyticsContent(summary);
    check(content.innerHTML.includes('地区分布')&&content.innerHTML.includes('访问渠道')&&content.innerHTML.includes('深圳')===false,'默认按省份显示两个来源表');
    check(content.innerHTML.includes('不代表独立人数')&&!content.innerHTML.includes('登录用户使用明细'),'口径清晰且无个人行为明细');
    ctx.renderAnalyticsContent(city);check(content.innerHTML.includes('深圳市')&&content.innerHTML.includes('注册仅在'),'功能筛选不虚构注册转化');
    const poisoned=structuredClone(summary);poisoned.sources.regions[0].label='<img src=x onerror=alert(1)>';
    ctx.renderAnalyticsContent(poisoned);check(!content.innerHTML.includes('<img src=x')&&content.innerHTML.includes('&lt;img'),'地区标签安全转义');
    ctx.renderAnalyticsContent(await operationsSummary(disabled,14));check(content.innerHTML.includes('来源统计尚未启用'),'未启用说明');

    // Large regional tails remain in the totals instead of disappearing at the top-20 boundary.
    for(let i=0;i<25;i++)await getPool(env).execute(`INSERT INTO operations_sources_daily (day,action,feature,target_id,country,region,city,source,count)
        VALUES (?,?,?,?,?,?,?,?,1) ON DUPLICATE KEY UPDATE count=count+1`,[chinaDay(new Date()),'page_view','research','research','测试地区'+String(i).padStart(2,'0'),'未知','未知','unknown']);
    const tail=await operationsSummary(env,14,new Date(),{level:'country'});
    check(tail.sources.regions.length===21&&tail.sources.regions.at(-1).label==='其他地区（合计）','超过 20 个地区合并尾部');
    for(const key of ['registrations','pageViews','opens','generations','failures','saves'])check(tail.sources.regions.reduce((n,r)=>n+r[key],0)===tail.sources.totals[key],'尾部合并保留全部 '+key);
}finally{await fixture.cleanup?.();}
console.log(`来源统计通过：${checks} 项（${real?'独立 MariaDB':'合成 SQL'}；离线地区查询，无模型、邮件或生产业务写入）。`);
