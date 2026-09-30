#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import vm from 'node:vm';
import * as local from '../server/local-analytics.mjs';
import * as legacy from '../functions/api/analytics.js';
import { encodeFields } from '../server/local-firestore-store.mjs';
import { PERSONAL_FIELDS, scrubRow } from './clean-analytics-personal-fields.mjs';

const sensitive = '禁止进入统计的自由文字';
const raw = {
    action:'agent_run',feature:'agents',path:'/agents?topic='+sensitive+'#'+sensitive,
    pageTitle:sensitive,referrer:sensitive,targetId:'lesson-design',targetName:sensitive,
    visitorId:`v_${randomUUID()}`,sessionId:`s_${randomUUID()}`,
    user:{uid:'forged',name:sensitive,school:sensitive,email:sensitive,phone:sensitive},
    meta:{durationMs:1200,hasProject:true,agentType:'form',input:sensitive,output:sensitive,subject:sensitive,
        ip:sensitive,userAgent:sensitive,screen:sensitive,timezone:sensitive}
};
let assertions = 0;
const check = (value,message) => { assert.ok(value,message); assertions++; };
for (const event of [local.eventFromPayload(raw,{uid:'verified',email:sensitive}),legacy.normalizeEvent(raw,{localId:'verified',email:sensitive})]) {
    check(event.uid === 'verified','只允许凭证中的 UID');
    check(PERSONAL_FIELDS.every(key=>!Object.hasOwn(event,key)),'禁止四个个人资料字段');
    check(!JSON.stringify(event).includes(sensitive),'禁止任意文字进入事件');
    assert.deepEqual(event.meta,{agentType:'form',durationMs:1200,hasProject:true});
    check(event.path === '/agents' && event.targetName === '教学设计助手','路径与名称必须由白名单生成');
}
check(local.eventFromPayload(raw,null).uid === '' && legacy.normalizeEvent(raw,null).uid === '', '访客不能伪造 UID');
assert.throws(()=>local.eventFromPayload({action:'invented'},null));
for (const targetId of ['homework-grader','essay-review','error-diagnosis']) {
    const event = local.eventFromPayload({...raw,targetId,meta:{subject:'语文',grade:'高中',input:sensitive,studentName:sensitive}},null);
    assert.deepEqual(event.meta,{});
}
check(Object.keys(globalThis.AnalyticsPolicy.normalize({...raw,meta:{durationMs:Infinity,hasProject:'true'}}).meta).length===0,'错误数据类型不得进入统计');
check(globalThis.AnalyticsPolicy.normalize({...raw,visitorId:sensitive,sessionId:sensitive,targetId:sensitive,path:'/secret/name'}).visitorId === '', '任意文字不能冒充访客标识');
check(globalThis.AnalyticsPolicy.normalize({action:'result_feedback',meta:{reason:sensitive}}).meta.reason === undefined,'反馈只接受固定选项');
check(globalThis.AnalyticsPolicy.normalize({action:'result_feedback',meta:{reason:'usable'}}).meta.reason === 'usable','有效反馈保留');

const day = new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const event = {...local.eventFromPayload(raw,{uid:'teacher'}),day,userName:sensitive,userEmail:sensitive,userPhone:sensitive,userSchool:sensitive};
const events = [event,{...event,action:'page_view'},{...event,action:'workbook_save'}];
for (const summarize of [local.summary,legacy.summarizeEvents]) {
    const profiles = new Map([['teacher',{name:'虚构教师',school:'虚构学校',account:'teacher@example.invalid'}]]);
    const summary = summarize(events,[day],profiles);
    check(!JSON.stringify(summary).includes(sensitive),'汇总不得回读事件中的历史个人资料');
    check(summary.users[0].name === '虚构教师' && summary.users[0].school==='虚构学校','汇总显示用户表资料');
    check(summary.recent[0].userName==='虚构教师','近期记录同样关联资料');
    profiles.set('teacher',{name:'新姓名',school:'新学校',account:''});
    check(summarize(events,[day],profiles).users[0].name==='新姓名','资料修改立即反映');
    check(summarize(events,[day]).users[0].name==='资料已不可用','资料不存在不回读旧值');
    const rows = events.map(e=>({fields_json:JSON.stringify(encodeFields(e)),raw_json:JSON.stringify({fields:encodeFields(e)})}));
    const clean = rows.map(scrubRow);
    check(clean.every(row=>PERSONAL_FIELDS.every(key=>!Object.hasOwn(JSON.parse(row.fields_json),key)&&!Object.hasOwn(JSON.parse(row.raw_json).fields,key))),'两份事件副本均清理');
    const without = events.map(e=>Object.fromEntries(Object.entries(e).filter(([key])=>!PERSONAL_FIELDS.includes(key))));
    assert.deepEqual(summarize(events,[day],profiles),summarize(without,[day],profiles));
}

// Browser tracker: execute actual files in a DOM substitute; no network leaves this process.
let posted;
const storage = new Map();
const context = vm.createContext({crypto:globalThis.crypto,Math,Date,console,URL,
    localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},
    sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},
    document:{readyState:'loading',addEventListener(){},title:sensitive,referrer:sensitive},
    fetch:async(url,options)=>{posted=JSON.parse(options.body);return {ok:true};}
});
vm.runInContext("PrivacyUI={allowed:async()=>true};window=globalThis; location={pathname:'/agents',search:'?private',hash:'#private'}; SiteAuth={getCurrentUser:()=>({uid:'teacher',name:'private',email:'private',school:'private',phone:'private'}),getIdToken:async()=> 'local-test'};",context);
vm.runInContext(readFileSync(new URL('../js/analytics-policy.js',import.meta.url),'utf8'),context);
vm.runInContext(readFileSync(new URL('../js/analytics.js',import.meta.url),'utf8'),context);
await context.Analytics.track('agent_run',raw);
check(posted === undefined,'研究暂停后浏览器不发送任何事件或用户资料');

// Exercise the real legacy HTTP route using strictly mocked Firebase responses.
const originalFetch = globalThis.fetch;
const {privateKey} = generateKeyPairSync('rsa',{modulusLength:2048});
const env = {FIREBASE_CLIENT_EMAIL:'fixture@example.invalid',FIREBASE_PRIVATE_KEY:privateKey.export({type:'pkcs8',format:'pem'})};
let written, profileRequests=0;
const document = e => ({name:'projects/xylaoshi-28f6c/databases/(default)/documents/analytics_events/test',fields:encodeFields(e)});
globalThis.fetch = async (url,options={}) => {
    const address=String(url); const body = options.body instanceof URLSearchParams ? {} : JSON.parse(options.body || '{}');
    let data;
    if(address==='https://oauth2.googleapis.com/token') data={access_token:'fake',expires_in:3600};
    else if(address.includes('/accounts:lookup')) data={users:[{localId:body.idToken==='admin-test'?'MCUSTieySYczODKB9hkERtyvtZG2':'teacher',emailVerified:true}]};
    else if(address.includes('/users/teacher?mask.fieldPaths=privacy')) data={fields:encodeFields({privacy:{version:'2026-09-29.1',acceptedAt:new Date(),research:true,researchVersion:'2026-09-29.1'}})};
    else if(address.endsWith(':beginTransaction')) data={transaction:'fixture-transaction'};
    else if(address.endsWith(':rollback')) data={};
    else if(address.endsWith(':commit')) {written=body.writes[0].update;data={writeResults:[{}]};}
    else if(address.endsWith(':batchGet')&&body.transaction) data=[{found:{name:'projects/xylaoshi-28f6c/databases/(default)/documents/users/teacher',fields:encodeFields({privacy:{version:'2026-09-29.1',acceptedAt:new Date(),research:true,researchVersion:'2026-09-29.1'}})}}];
    else if(address.endsWith(':batchGet')) {
        profileRequests++;
        assert.deepEqual(body.mask.fieldPaths,['name','email','phone','school']);
        data=[{found:{name:'projects/xylaoshi-28f6c/databases/(default)/documents/users/teacher',fields:encodeFields({name:'虚构教师',school:'虚构学校'})}}];
    } else if(address.endsWith(':runQuery')) data=events.map(e=>({document:document(e)}));
    else if(address.endsWith('/analytics_events')) {written=body;data={name:'test'};}
    else throw new Error('禁止未声明的网络请求');
    return new Response(JSON.stringify(data),{status:200});
};
try {
    const request = body => new Request('http://127.0.0.1/api/analytics',{method:'POST',body:JSON.stringify(body)});
    check((await legacy.onRequestPost({request:request({action:'track',event:raw,idToken:'teacher-test'}),env})).status===200,'旧路径兼容返回成功');
    check(written===undefined,'旧路径研究暂停后不写任何事件');
    check((await legacy.onRequestPost({request:request({action:'summary',adminIdToken:'teacher-test'}),env})).status===403,'普通用户仍不能读汇总');
    const response=await legacy.onRequestPost({request:request({action:'summary',adminIdToken:'admin-test'}),env});
    const result=await response.json();
    check(response.status===200 && result.users[0].name==='虚构教师' && profileRequests===1,'旧路径按 UID 批量关联资料');
    check(response.headers.get('cache-control')==='no-store','含资料的汇总不缓存');
} finally {globalThis.fetch=originalFetch;}
console.log(`统计隐私回归通过：${assertions} 项检查（另含结构相等与异常断言），无外部请求。`);
