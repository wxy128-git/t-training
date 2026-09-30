import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {setImmediate as tick} from 'node:timers/promises';
const source=readFileSync(new URL('../js/privacy-ui.js',import.meta.url),'utf8');
let checks=0;
const check=(value,message)=>{assert.ok(value,message);checks++;};
function harness(){
 let user={uid:'old-teacher'},dialog,notice;
 const requests=[],toasts=[],timers=new Map(),listeners=new Map();let timerId=0;
 const element=()=>({disabled:false,checked:false,textContent:'',onclick:null});
 const doc={visibilityState:'visible',addEventListener(type,fn){listeners.set(type,fn);},getElementById(id){return id==='privacy-dialog'?dialog:id==='privacy-notice'?notice:null;},
  createElement(tag){
   const nodes=new Map(),events=new Map();
   return {open:false,id:'',className:'',innerHTML:'',setAttribute(){},addEventListener(type,fn){events.set(type,fn);},
    querySelector(key){if(!nodes.has(key))nodes.set(key,element());return nodes.get(key);},
    showModal(){this.open=true;},close(){this.open=false;events.get('close')?.();},remove(){notice=null;}};
  },body:{appendChild(node){if(node.id==='privacy-dialog')dialog=node;else notice=node;}}};
 const ctx=vm.createContext({document:doc,console,Date,AbortController,PrivacyPolicy:{VERSION:'current',allows:()=>false},
  SiteAuth:{getCurrentUser:()=>user,getIdToken:async()=> 'synthetic-token'},
  localStorage:{removeItem(){}},sessionStorage:{removeItem(){}},addEventListener(){},showToast:msg=>toasts.push(msg),
  setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout(id){timers.delete(id);},
  fetch(url,options){return new Promise((resolve,reject)=>requests.push({url,body:JSON.parse(options.body),signal:options.signal,resolve,reject}));}});
 vm.runInContext('window=globalThis',ctx);vm.runInContext(source,ctx);
 return {ui:ctx.PrivacyUI,requests,toasts,timers,get dialog(){return dialog;},get notice(){return notice;},node:id=>dialog.querySelector(id),
  fire:type=>listeners.get(type)?.(),switchUser(value){user=value;},reply(index,privacy=null,status=200){requests[index].resolve({ok:status===200,json:async()=>({ok:status===200,privacy,msg:status===200?'':'保存失败，请重试'})});}};
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
console.log(`隐私确认界面通过：${checks} 项检查（并发、超时、重试、账号切换；虚构数据）。`);
