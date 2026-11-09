import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {setImmediate as tick} from 'node:timers/promises';
const source=readFileSync(new URL('../js/privacy-ui.js',import.meta.url),'utf8');
let checks=0;
const check=(value,message)=>{assert.ok(value,message);checks++;};
function harness({storage=new Map(),version='current',path='/',blockedStorage=false}={}){
 let user={uid:'old-teacher'},dialog,notice;
 const requests=[],toasts=[],timers=new Map(),listeners=new Map(),windowListeners=new Map();let timerId=0,now=Date.now();
 class Clock extends Date {static now(){return now;}}
 const element=()=>({disabled:false,checked:false,textContent:'',onclick:null});
 const doc={visibilityState:'visible',addEventListener(type,fn){listeners.set(type,fn);},getElementById(id){return id==='privacy-dialog'?dialog:id==='privacy-notice'?notice:null;},
  createElement(tag){
   const nodes=new Map(),events=new Map();
   return {open:false,id:'',className:'',innerHTML:'',setAttribute(){},addEventListener(type,fn){events.set(type,fn);},
    querySelector(key){if(!nodes.has(key))nodes.set(key,element());return nodes.get(key);},
    showModal(){this.open=true;},close(){this.open=false;events.get('close')?.();},remove(){notice=null;}};
  },body:{appendChild(node){if(node.id==='privacy-dialog')dialog=node;else notice=node;}}};
 const ctx=vm.createContext({document:doc,console,Date:Clock,AbortController,location:{pathname:path},PrivacyPolicy:{VERSION:version,allows:()=>false},
  SiteAuth:{getCurrentUser:()=>user,getIdToken:async()=> 'synthetic-token'},
  localStorage:{getItem:key=>{if(blockedStorage)throw Error('blocked');return storage.get(key);},setItem(key,value){if(blockedStorage)throw Error('blocked');storage.set(key,value);},removeItem:key=>storage.delete(key)},sessionStorage:{removeItem(){}},addEventListener(type,fn){windowListeners.set(type,fn);},showToast:msg=>toasts.push(msg),
  setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout(id){timers.delete(id);},
  fetch(url,options){return new Promise((resolve,reject)=>requests.push({url,body:JSON.parse(options.body),signal:options.signal,resolve,reject}));}});
 vm.runInContext('window=globalThis',ctx);vm.runInContext(source,ctx);
 return {ui:ctx.PrivacyUI,requests,toasts,timers,storage,get dialog(){return dialog;},get notice(){return notice;},node:id=>dialog.querySelector(id),
  fire:(type,event)=>listeners.get(type)?.(event)??windowListeners.get(type)?.(event),advance:ms=>{now+=ms;},switchUser(value){user=value;},reply(index,privacy=null,status=200){requests[index].resolve({ok:status===200,json:async()=>({ok:status===200,privacy,msg:status===200?'':'保存失败，请重试'})});}};
}
const record={version:'current',acceptedAt:'2026-10-01T00:00:00Z'};
{
 const h=harness(),opening=h.ui.open();await tick();
 h.fire('authRefresh');h.fire('visibilitychange');await tick();
 check(h.requests.length===1,'登录刷新及切回页面不打断当前弹窗读取');
 h.reply(0);await opening;
 check(!h.node('#privacy-save').disabled,'读取完成后确认按钮可用');
 await h.node('#privacy-save').onclick();
 check(h.requests.length===1&&h.node('#privacy-message').textContent.includes('勾选'),'未勾选不保存');
 h.node('#privacy-accept').checked=true;
 const saving=h.node('#privacy-save').onclick();await tick();
 check(h.node('#privacy-save').disabled&&h.node('#privacy-save').textContent==='正在保存…','保存过程明确反馈并禁止重复点击');
 await h.node('#privacy-save').onclick();h.fire('authRefresh');await tick();
 check(h.requests.length===2,'重复点击和状态刷新不重复提交');
 h.reply(1,record);await saving;
 check(!h.dialog.open&&h.toasts[0]==='已确认隐私政策'&&!h.notice,'成功后关闭弹窗并显示完成提示');
 const reopen=h.ui.open();await tick();h.reply(2,record);await reopen;
 check(h.node('#privacy-accept').checked&&h.node('#privacy-record').textContent.includes('current'),'重新打开显示已保存记录');
 check(h.timers.size===0,'完成请求清理超时计时器');
}
{
 const h=harness(),opening=h.ui.open();await tick();h.reply(0);await opening;
 h.node('#privacy-accept').checked=true;
 const saving=h.node('#privacy-save').onclick();await tick();
 for(const fn of [...h.timers.values()])fn();await saving;
 check(h.dialog.open&&!h.node('#privacy-save').disabled&&h.node('#privacy-message').textContent.includes('超时'),'超时恢复按钮并提示重试');
 check(h.requests[1].signal.aborted&&h.toasts.length===0,'超时中止请求且不假报成功');
 const retry=h.node('#privacy-save').onclick();await tick();h.reply(2,record);await retry;
 check(!h.dialog.open&&h.toasts.length===1,'超时后可重试成功');
 h.reply(1,record);await tick();check(h.toasts.length===1,'超时请求晚到不重复提示或改变状态');
}
{
 const h=harness(),opening=h.ui.open();await tick();h.reply(0,null,500);await opening;
 check(!h.node('#privacy-save').disabled&&h.node('#privacy-message').textContent.includes('失败'),'读取失败不让按钮永久失效');
 h.node('#privacy-accept').checked=true;
 const saving=h.node('#privacy-save').onclick();await tick();h.reply(1,null,500);await saving;
 check(h.dialog.open&&!h.node('#privacy-save').disabled&&h.toasts.length===0,'保存失败保留弹窗和勾选供重试');
}
{
 const h=harness(),opening=h.ui.open();await tick();h.dialog.close();
 const second=h.ui.open();await tick();h.reply(0,record);await opening;
 check(h.node('#privacy-save').disabled,'关闭后旧请求不能更新新弹窗');
 h.reply(1);await second;h.node('#privacy-accept').checked=true;
 const saving=h.node('#privacy-save').onclick();await tick();
 h.switchUser(null);h.fire('authChanged');h.reply(2,record);await saving;
 check(!h.dialog.open&&h.toasts.length===0,'退出账号后忽略旧账号保存响应');
}
{
 const storage=new Map(),h=harness({storage});
 const refreshing=h.ui.refresh();h.fire('authRefresh');h.fire('visibilitychange');h.fire('pageshow');await tick();
 check(h.requests.length===1,'同账号的并发登录、可见性和切页事件合并读取');
 h.reply(0);await refreshing;
 check(!!h.notice,'服务端明确无当前确认记录时才显示首次提醒');
 h.notice.querySelector('[data-later]').onclick();h.fire('visibilitychange');await tick();
 check(!h.notice&&h.requests.length===1,'稍后不会被切回窗口立即撤销，短时间不重复读取');
 h.advance(5*60*1000+1);const later=h.ui.refresh();await tick();h.reply(1);await later;
 check(!h.notice,'刷新服务端状态后仍记住同版本已提醒');
 const next=harness({storage}),n=next.ui.refresh();await tick();next.reply(0);await n;
 check(!next.notice,'跨页及重新打开仍保留同账号同版本的提醒偏好');
 const other=harness({storage});other.switchUser({uid:'other-teacher'});const o=other.ui.refresh();await tick();other.reply(0);await o;
 check(!!other.notice,'提醒偏好按账号隔离');
 const updated=harness({storage,version:'new-policy'}),u=updated.ui.refresh();await tick();updated.reply(0,record);await u;
 check(!!updated.notice,'政策实际换版后可提醒一次，旧版本偏好不冒充同意');
 check(await next.ui.allowed()===false,'已提醒偏好不启用研究采集或充当政策同意');
}
{
 const h=harness(),failed=h.ui.refresh();await tick();h.reply(0,null,500);await failed;
 check(!h.notice&&![...h.storage.keys()].some(key=>key.startsWith('xylaoshi:privacy-notice:')),'读取失败既不弹未确认提示，也不记已提醒');
 h.advance(5*60*1000+1);const retry=h.ui.refresh();await tick();h.reply(1);await retry;
 check(!!h.notice,'读取恢复后仍能显示必要的首次提醒');
 const accepted=harness(),first=accepted.ui.refresh();await tick();accepted.reply(0,record);await first;
 accepted.advance(5*60*1000+1);const offline=accepted.ui.refresh();await tick();accepted.reply(1,null,500);await offline;
 check(!accepted.notice,'曾经确认的状态不会因为后续读取失败被清空成未确认');
}
{
 for(const path of ['/agents','/research','/workspace.html','/classroom-tools','/admin']){
  const h=harness({path}),r=h.ui.refresh();await tick();h.reply(0);await r;
  check(!h.notice&&!h.storage.size,path+': 工作页面不自动提醒，也不消耗后续提醒机会');
 }
 const h=harness(),r=h.ui.refresh();await tick();h.reply(0);await r;
 const key=[...h.storage.keys()].find(key=>key.startsWith('xylaoshi:privacy-notice:'));
 h.fire('storage',{key,newValue:'1'});
 check(!h.notice,'其他标签页已提醒或稍后时，当前卡片同步收起');
}
{
 const h=harness({blockedStorage:true}),r=h.ui.refresh();await tick();h.reply(0);await r;
 h.notice.querySelector('[data-later]').onclick();h.advance(5*60*1000+1);
 const next=h.ui.refresh();await tick();h.reply(1);await next;
 check(!h.notice,'浏览器存储不可用时，至少在当前页面记住稍后');
 const racing=harness(),a=racing.ui.refresh();await tick();racing.switchUser({uid:'other-teacher'});
 const b=racing.ui.refresh();await tick();racing.reply(0,record);await a;
 check(!racing.notice,'账号切换后旧账号读取响应不得触发新账号提示');
 racing.reply(1);await b;check(!!racing.notice,'新账号独立采用自己的服务端记录');
}
console.log(`隐私确认界面通过：${checks} 项检查（去重、跨页、换版、失败、并发、账号切换；虚构数据）。`);
