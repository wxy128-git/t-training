import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../js/pwa.js',import.meta.url),'utf8');
let checks=0;
const check=(condition,message)=>{assert.ok(condition,message);checks++;};
function implementation(name){
    const start=source.search(new RegExp('^    (?:async )?function '+name+'\\(', 'm'));
    assert.ok(start>=0,name+': definition exists');
    const end=source.indexOf('\n    }',start)+6;
    return source.slice(start,end);
}
function harness({storage=new Map(),path='/',visible=true,blocked=false,modal=false}={}){
    let now=Date.now(),reloads=0,posts=0,checksSent=0,registrations=0;
    class Clock extends Date {static now(){return now;}}
    const nodes=new Map(),timers=new Map(),swListeners=new Map(),windowListeners=new Map(),statuses=[],workerListeners=new Map(),registrationListeners=new Map();
    let timerId=0;
    const makeNode=()=>({id:'',className:'',textContent:'',disabled:false,innerHTML:'',setAttribute(){},
        appendChild(node){nodes.set(node.id,node);},remove(){nodes.delete(this.id);},parentElement:null});
    const primary=makeNode();
    const doc={visibilityState:visible?'visible':'hidden',getElementById:id=>nodes.get(id),createElement:makeNode,
        querySelector:selector=>selector==='[data-pwa-apply-update]'?primary:modal?{}:null,
        body:{appendChild:node=>nodes.set(node.id,node)}};
    const localStorage={getItem:key=>{if(blocked)throw Error('blocked');return storage.get(key);},setItem(key,value){if(blocked)throw Error('blocked');storage.set(key,value);},removeItem:key=>storage.delete(key)};
    const tabStorage=new Map();
    const worker={state:'installed',postMessage(){posts++;},addEventListener:(type,fn)=>workerListeners.set(type,fn)};
    const registration={waiting:worker,installing:null,update:async()=>{checksSent++;},addEventListener:(type,fn)=>registrationListeners.set(type,fn)};
    const ctx=vm.createContext({console,Date:Clock,document:doc,localStorage,location:{pathname:path,reload(){reloads++;}},
        sessionStorage:{getItem:key=>tabStorage.get(key),setItem:(key,value)=>tabStorage.set(key,value),removeItem:key=>tabStorage.delete(key)},
        navigator:{serviceWorker:{controller:{},register:async()=>{registrations++;return registration;},addEventListener:(type,fn)=>swListeners.set(type,fn)}},
        addEventListener:(type,fn)=>windowListeners.set(type,fn),isSecure:true,
        updateWorker:null,reloadAfterUpdate:false,lastUpdateNoticeAt:0,updateApplyTimer:0,
        manualUpdateRequested:false,updateCheckPromise:null,serviceWorkerRegistration:null,serviceWorkerRegistrationPromise:null,networkStatusTimer:0,
        track(){},showNetworkStatus:message=>statuses.push(message),
        setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id)});
    ctx.window=ctx;
    vm.runInContext(source.slice(source.indexOf('    const UPDATE_LATER_KEY'),source.indexOf('    const APP_PREVIEW_KEY')),ctx);
    for(const name of ['safeStorage','cleanPathname','getCardStack','removeCard','rememberUpdateNotice','updateNoticeSuppressed','showUpdateCard','applyUpdate','updateLater','checkForUpdate','registerServiceWorker'])vm.runInContext(implementation(name),ctx);
    vm.runInContext(source.match(/^    navigator\.serviceWorker && navigator\.serviceWorker\.addEventListener\('controllerchange',[\s\S]*?^    \}\);/m)[0],ctx);
    vm.runInContext(source.match(/^    window\.addEventListener\('storage',[\s\S]*?^    \}\);/m)[0],ctx);
    return {ctx,worker,registration,primary,storage,tabStorage,statuses,timers,doc,
        get card(){return nodes.get('pwa-update-card');},get reloads(){return reloads;},get posts(){return posts;},get checksSent(){return checksSent;},get registrations(){return registrations;},
        status(message){const node=makeNode();node.textContent=message;nodes.set('pwa-network-status',node);return node;},
        advance:ms=>{now+=ms;},controllerChange:()=>swListeners.get('controllerchange')(),
        storageEvent:event=>windowListeners.get('storage')(event),
        install(candidate){registration.installing=candidate;registrationListeners.get('updatefound')();},
        stateChange:()=>workerListeners.get('statechange')?.()};
}
const week=7*24*60*60*1000;
{
    const storage=new Map(),h=harness({storage});
    check(h.ctx.showUpdateCard(h.worker)&&!!h.card,'浏览页面可以显示准备好的更新');
    check(h.posts===0&&h.reloads===0,'发现更新不自动激活或刷新');
    h.ctx.updateLater();check(!h.card,'稍后收起提示');
    const next=harness({storage});
    check(!next.ctx.showUpdateCard(next.worker)&&!next.card,'切页、重开标签和同源多标签沿用七天提醒间隔');
    next.advance(week-10000);check(!next.ctx.showUpdateCard(next.worker),'七天内继续静默');
    next.advance(10001);check(next.ctx.showUpdateCard(next.worker),'七天后可再次提醒');
}
{
    for(const path of ['/agents','/agents.html','/research','/workspace','/classroom-tools','/admin']){
        const h=harness({path});
        check(!h.ctx.showUpdateCard(h.worker)&&!h.storage.size,path+': 工作页面不自动提示或消耗提醒机会');
        check(h.ctx.showUpdateCard(h.worker,true),path+': 主动检查仍可查看更新');
    }
    for(const options of [{visible:false},{modal:true}]){
        const h=harness(options);check(!h.ctx.showUpdateCard(h.worker),'后台页面和打开的弹窗不叠加更新提醒');
    }
    const h=harness();h.worker.state='activated';check(!h.ctx.showUpdateCard(h.worker),'已激活的旧 worker 不产生无效更新卡片');
}
{
    const h=harness();h.ctx.showUpdateCard(h.worker);h.controllerChange();
    check(!h.card&&h.reloads===0,'其他标签更新后移除失效提示，不刷新当前未保存内容');
    const chosen=harness();chosen.ctx.showUpdateCard(chosen.worker);chosen.ctx.applyUpdate();chosen.ctx.applyUpdate();
    check(chosen.posts===1&&chosen.primary.disabled,'主动更新只发送一次激活请求并提供进行中状态');
    chosen.controllerChange();chosen.controllerChange();
    check(chosen.reloads===1&&!chosen.card&&chosen.timers.size===0,'仅主动更新的页面刷新一次，清理卡片和计时器');
    const timeout=harness();timeout.ctx.showUpdateCard(timeout.worker);timeout.ctx.applyUpdate();
    for(const fn of [...timeout.timers.values()])fn();
    check(!timeout.primary.disabled&&timeout.statuses.at(-1).includes('重试'),'更新超时恢复重试');
    timeout.controllerChange();check(timeout.reloads===0,'更新超时后晚到的激活不会意外刷新');
    const throwing=harness();throwing.ctx.showUpdateCard(throwing.worker);throwing.worker.postMessage=()=>{throw Error('gone');};throwing.ctx.applyUpdate();
    check(!throwing.primary.disabled&&throwing.timers.size===0,'失效 worker 发送失败后不留下不可用按钮或计时器');
    const deferred=harness();deferred.ctx.showUpdateCard(deferred.worker);deferred.ctx.applyUpdate();deferred.ctx.updateLater();deferred.controllerChange();
    check(deferred.reloads===0&&deferred.timers.size===0,'点击更新后改选稍后，取消当前页面自动刷新');
    const ready=harness(),status=ready.status('正在检查更新…');ready.ctx.showUpdateCard(ready.worker,true);
    check(status.hidden,'更新已准备好后收起正在检查提示，避免叠加过时反馈');
}
{
    const h=harness();h.tabStorage.set('xylaoshi:pwa-update-later','1');
    check(!h.ctx.showUpdateCard(h.worker)&&h.storage.size===1&&!h.tabStorage.size,'升级后尊重旧版稍后选择并迁入持久提醒间隔');
    const blocked=harness({blocked:true});blocked.ctx.showUpdateCard(blocked.worker);blocked.ctx.updateLater();
    check(!blocked.ctx.showUpdateCard(blocked.worker),'存储不可用时仍在当前页面记住稍后');
    const cross=harness();cross.ctx.showUpdateCard(cross.worker);cross.storageEvent({key:'xylaoshi:pwa-update-notice-at',newValue:String(Date.now())});
    check(!cross.card,'其他标签提醒或稍后时同步收起重复卡片');
}
{
    const h=harness({path:'/agents'});await h.ctx.registerServiceWorker();
    const a=h.ctx.checkForUpdate(),b=h.ctx.checkForUpdate();await Promise.all([a,b]);
    check(h.checksSent===2&&!!h.card,'一次后台检查和一次合并的主动检查，主动入口绕过安静页面与提醒间隔');
    const latest=harness();latest.registration.waiting=null;await latest.ctx.registerServiceWorker();await latest.ctx.checkForUpdate();
    check(latest.statuses.at(-1)==='当前已是最新版本。'&&!latest.card,'没有待更新 worker 时明确告知最新状态');
    latest.registration.update=async()=>{throw Error('offline');};await latest.ctx.checkForUpdate();
    check(latest.statuses.at(-1).includes('联网后重试'),'断网时主动检查可重试且不误报最新版本');
}
{
    const h=harness({path:'/agents'});await Promise.all([h.ctx.registerServiceWorker(),h.ctx.registerServiceWorker()]);
    check(h.registrations===1,'并发加载与手动检查共用一次 Service Worker 注册');
    h.registration.waiting=null;h.worker.state='installing';h.install(h.worker);await h.ctx.checkForUpdate();
    h.worker.state='installed';h.registration.installing=null;h.registration.waiting=h.worker;h.stateChange();
    check(!!h.card&&!h.ctx.manualUpdateRequested,'主动检查等待下载完成后仍能在工作页面查看更新');
    const first=harness();first.ctx.navigator.serviceWorker.controller=null;await first.ctx.registerServiceWorker();
    first.registration.waiting=null;first.worker.state='installing';first.install(first.worker);await first.ctx.checkForUpdate();
    first.worker.state='installed';first.stateChange();
    check(!first.card&&!first.ctx.manualUpdateRequested&&first.statuses.at(-1)==='当前已是最新版本。','首次安装完成不留下跨版本的主动更新标记');
}
console.log(`PWA 更新提醒通过：${checks} 项检查（跨页、多标签、工作页面、主动检查、刷新与失败恢复；无外部请求）。`);
