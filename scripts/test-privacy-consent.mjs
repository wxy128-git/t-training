#!/usr/bin/env node
// Offline behavioral tests: no real DB, mail, Firebase or model requests.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';
import {generateKeyPairSync} from 'node:crypto';
import mysql from 'mysql2/promise';
import '../js/privacy-policy.js';
import {savePrivacy,readPrivacy,storeConsentedEvent} from '../server/local-privacy.mjs';
import {expireAnalytics} from '../server/analytics-retention.mjs';
import * as localAnalytics from '../server/local-analytics.mjs';
import * as localAuth from '../server/local-auth-proxy.mjs';
import * as legacyAuth from '../functions/api/auth-proxy.js';
import * as legacyPrivacy from '../functions/api/privacy.js';
import * as legacyAnalytics from '../functions/api/analytics.js';
import {createLocalAccount} from '../server/local-auth-store.mjs';
const policy=globalThis.PrivacyPolicy;
const yes={accepted:true,version:policy.VERSION};
let passed=0;
function check(condition,message){assert.ok(condition,message);passed++;}
check(policy.registration(undefined)===null,'当前范围允许未绑定定稿政策的注册');
for(const value of [{}, {...yes,accepted:'true'},{...yes,version:'old'},{...yes,research:'yes'},{...yes,research:true}]) {assert.throws(()=>policy.registration(value));passed++;}
let consent=policy.update(null,{...yes,research:false},'2026-09-29T01:00:00.000Z');
check(!policy.allows(consent),'只同意政策不代表同意研究');
const acceptedAt=consent.acceptedAt;
consent=policy.update(consent,yes,'2026-09-29T02:00:00.000Z');
check(!policy.allows(consent)&&consent.acceptedAt===acceptedAt,'政策确认不启用研究、不改写原确认时间');
check(!policy.allows({...consent,version:'old'})&&!policy.allows({...consent,researchVersion:'old'}),'版本更新后停止采集');
check(!policy.allows(policy.update(consent,{...yes,accepted:false,research:false})),'撤回无需重新勾选政策');
assert.throws(()=>policy.update(null,{...yes,research:true}));passed++;
check(!policy.allows(null),'旧用户默认未同意');
const originalFetch=globalThis.fetch,originalPool=mysql.createPool;
let row={privacy_json:null},calls=[],failInsert=false,events=[],transaction=false,snapshot,createdProfile;
const connection={
 async beginTransaction(){transaction=true;snapshot=JSON.stringify({row,events});},
 async commit(){transaction=false;},
 async rollback(){({row,events}=JSON.parse(snapshot));transaction=false;},
 release(){check(!transaction,'连接释放前结束事务');},
 async execute(sql,params=[]){
    calls.push({sql,params});
    if(sql.includes('SELECT privacy_json'))return [[row]];
    if(sql.startsWith('UPDATE user_profiles SET privacy_json')){row.privacy_json=params[0];return [{affectedRows:1}];}
    if(sql.includes('INSERT INTO firestore_documents')){if(failInsert)throw new Error('fixture write failure');events.push(params);return [{affectedRows:1}];}
    if(sql.includes('INSERT INTO auth_users'))return [{affectedRows:1}];
    if(sql.includes('INSERT INTO user_profiles')){createdProfile=params;return [{affectedRows:1}];}
    if(sql.includes('FROM auth_users')&&sql.includes('LOWER(a.email)'))return [[]];
    if(sql.includes('FROM auth_users'))return [[{uid:'new-user',email:'fixture@example.invalid'}]];
    throw new Error('Unexpected SQL: '+sql);
 }
};
const pool={execute:connection.execute,getConnection:async()=>connection};
mysql.createPool=()=>pool;
const env={T_TRAINING_DB_NAME:'offline_privacy_unit',T_TRAINING_DB_PASSWORD:'fixture-only',T_TRAINING_AUTH_SECRET:'fixture-only-secret-00000000000000000000'};
const post=(mod,body)=>mod.onRequestPost({env,request:new Request('http://127.0.0.1/api/test',{method:'POST',headers:{'CF-Connecting-IP':'fixture-'+Math.random()},body:JSON.stringify(body)})});
try {
 globalThis.fetch=async()=>{throw new Error('External request forbidden');};
 for(const mod of [localAuth,legacyAuth]) {
    const r=await post(mod,{action:'register',email:'fixture@example.invalid',password:'fixture-password',profile:{name:'虚构教师'}});
    const body=await r.json();
    check(body.code!=='PRIVACY_CONSENT_REQUIRED','两条注册路径不再因缺失定稿政策而拒绝注册，且不连接外部');
 }
 check((await readPrivacy(env,'teacher'))===null,'数据库旧用户无同意记录');
 check(!await storeConsentedEvent(env,'teacher',{ts:new Date().toISOString()}),'服务端拒绝无同意的事件');
 const saved=await savePrivacy(env,'teacher',{...yes,acceptedAt:'1900',researchUpdatedAt:'1900',ip:'forged'});
 check(!policy.allows(saved)&&!JSON.stringify(saved).includes('1900')&&!('ip' in saved),'时间由服务器生成，多余字段不入库');
 check(calls.some(c=>c.sql.includes('FOR UPDATE')),'政策确认更新保留事务锁');
 const countBefore=calls.length;
 check(!await storeConsentedEvent(env,'teacher',{action:'page_view',ts:new Date().toISOString()}),'底层统计写入器也停止采集');
 check(calls.length===countBefore,'暂停采集不访问数据库');
 for(const mod of [localAnalytics,legacyAnalytics]) {
   for(const idToken of [undefined,'old-consented-token','forged-token']) {
     const result=await post(mod,{action:'track',idToken,event:{action:'page_view',research:true},research:true});
     const body=await result.json();
     check(result.status===200&&body.recorded===false&&body.reason==='research_paused','新旧接口均拒绝新事件，包括旧同意和伪造请求');
   }
 }
 const snapshotPrivacy=row.privacy_json;
 await assert.rejects(()=>savePrivacy(env,'teacher',{...yes,research:true}));passed++;
 check(row.privacy_json===snapshotPrivacy,'非法开启研究不能改写政策确认记录');
 await createLocalAccount(env,'fixture@example.invalid','fixture-password',{name:'虚构教师',privacy:saved});
 check(JSON.parse(createdProfile.at(-1)).version===policy.VERSION,'账号创建事务内一并记录同意');
 check(!JSON.stringify(createdProfile).includes('fixture-password'),'用户资料不存密码原文');
 // Legacy path: fixture server implements Firestore timestamps and masked writes.
 let f={version:{stringValue:policy.VERSION},acceptedAt:{timestampValue:'2026-09-29T01:00:00.000Z'},research:{booleanValue:true},researchVersion:{stringValue:policy.VERSION},researchUpdatedAt:{timestampValue:'2026-09-29T01:00:00.000Z'}};
 let legacyCalls=[],commits=[];
 const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 env.FIREBASE_CLIENT_EMAIL='fixture@example.invalid';env.FIREBASE_PRIVATE_KEY=privateKey.export({type:'pkcs8',format:'pem'});
 globalThis.fetch=async(url,options={})=>{
    const address=String(url),body=options.body instanceof URLSearchParams ? {} : JSON.parse(options.body||'{}');legacyCalls.push(address);
    if(address==='https://oauth2.googleapis.com/token')return Response.json({access_token:'fixture',expires_in:3600});
    if(address.endsWith(':beginTransaction'))return Response.json({transaction:'fixture'});
    if(address.endsWith(':rollback'))return Response.json({});
    if(address.endsWith(':batchGet'))return Response.json([{found:{name:'projects/xylaoshi-28f6c/databases/(default)/documents/users/verified-user',fields:{privacy:{mapValue:{fields:f}}}}}]);
    if(address.includes('accounts:lookup'))return Response.json(body.idToken==='invalid'?{}:{users:[{localId:'verified-user'}]});
    if(address.includes('/users/verified-user?mask.fieldPaths=privacy'))return Response.json({fields:{privacy:{mapValue:{fields:f}}}});
    if(address.endsWith(':commit')){commits.push(body);f=body.writes[0].update.fields.privacy.mapValue.fields;f.researchUpdatedAt={timestampValue:'2026-09-29T02:00:00.000Z'};return Response.json({writeResults:[{}]});}
    throw new Error('Undeclared network request: '+address);
 };
 check((await post(legacyPrivacy,{action:'save',idToken:'invalid',uid:'verified-user',choice:yes})).status===401,'旧隐私接口拒绝伪造身份');
 let r=await post(legacyPrivacy,{action:'save',idToken:'fixture',uid:'other-user',choice:{...yes,accepted:false,research:false}});
 check(r.status===200&&commits[0].writes[0].update.name.endsWith('/verified-user'),'旧路径只写凭证所属用户');
 check(commits[0].writes[0].updateTransforms[0].setToServerValue==='REQUEST_TIME','旧路径使用数据库服务器时间');
 r=await post(legacyAnalytics,{action:'track',idToken:'fixture',event:{action:'page_view'}});
 check(r.status===200&&(await r.json()).recorded===false,'Firebase 旧路径同样拒绝撤回后的上报');
 check(!commits.some(c=>c.writes.some(w=>w.update.name.includes('/analytics_events/'))),'拒绝采集不创建统计文档');
 const authSource=readFileSync(new URL('../js/auth.js',import.meta.url),'utf8');
 const uiSource=readFileSync(new URL('../js/privacy-ui.js',import.meta.url),'utf8');
 const policyPage=readFileSync(new URL('../privacy.html',import.meta.url),'utf8');
 check(policyPage.includes(policy.VERSION)&&!/尚未生效|审阅稿|待确认|待核实|研究参与|研究采集/.test(policyPage),'注册使用的政策与正式说明一致');
 check(!/已暂停研究|研究采集保持暂停/.test(uiSource),'确认界面仅说明政策确认');
 check(policyPage.includes('data-contact-trigger')&&policyPage.includes('js/assistant.js'),'政策页申请入口具备处理脚本');
 check(!authSource.includes('id="rg-research"')&&!uiSource.includes('id="privacy-research"')&&!uiSource.includes('id="privacy-withdraw"'),'移除注册、个人区域研究开关与撤回入口');
 check(!policy.allows({version:policy.VERSION,acceptedAt:'2026-09-29',research:true,researchVersion:policy.VERSION}),'历史已同意记录也不能重新启用研究');
 // Retention boundary and batch count; actual SQL execution is separately integration-tested.
 const now=new Date('2026-09-29T00:00:00.000Z'),cutoff=new Date(now-180*86400000).toISOString();
 let retentionCalls=[],affected=[1000,2];
 const retentionPool={execute:async(sql,params)=>{retentionCalls.push({sql,params});return [sql.startsWith('SELECT')?[{count:1002}]:{affectedRows:affected.shift()}];}};
 check((await expireAnalytics(retentionPool,{now})).count===1002&&retentionCalls.length===1,'到期清理默认只统计');
 check((await expireAnalytics(retentionPool,{now,dryRun:false})).count===1002,'到期清理分批处理完整结果');
 check(retentionCalls.every(c=>c.params[0]==='analytics_events'&&c.params[1]===cutoff)&&retentionCalls.at(-1).sql.includes(' < ?'),'只清理统计表中严格超过 180 天的行');
 // Browser: unconsented visits never create identifiers or issue requests.
 let sent=0,stored=0;
 const ctx=vm.createContext({console,Date,Math,crypto:globalThis.crypto,document:{readyState:'loading',addEventListener(){}},localStorage:{getItem:()=>null,setItem(){stored++;}},sessionStorage:{getItem:()=>null,setItem(){stored++;}},fetch:async()=>{sent++;return {ok:true};}});
 vm.runInContext("window=globalThis;location={pathname:'/'};PrivacyUI={allowed:async()=>false};SiteAuth={getCurrentUser:()=>({uid:'fixture'}),getIdToken:async()=> 'fixture'};",ctx);
 vm.runInContext(readFileSync(new URL('../js/analytics-policy.js',import.meta.url),'utf8'),ctx);
 vm.runInContext(readFileSync(new URL('../js/analytics.js',import.meta.url),'utf8'),ctx);
 await ctx.Analytics.track('page_view');check(sent===0&&stored===0,'未同意不创建统计标识、不发送事件');
 ctx.PrivacyUI.allowed=async()=>true;await ctx.Analytics.track('page_view');check(sent===0&&stored===0,'旧页面伪造同意也不发送或生成标识');
 ctx.PrivacyUI.allowed=async()=>false;await ctx.Analytics.track('page_view');check(sent===0,'研究采集持续暂停');
 for(const name of readdirSync(new URL('../',import.meta.url)).filter(n=>n.endsWith('.html'))) {
    const html=readFileSync(new URL('../'+name,import.meta.url),'utf8');
    if(!html.includes('js/auth.js'))continue;
    check(html.includes('js/privacy-ui.js')&&html.indexOf('js/privacy-policy.js')<html.indexOf('js/auth.js'),'页面接入统一隐私设置：'+name);
 }
} finally {globalThis.fetch=originalFetch;mysql.createPool=originalPool;}
console.log(`隐私同意回归通过：${passed} 项检查（模拟数据库和上游，无外部请求）。`);
