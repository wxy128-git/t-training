#!/usr/bin/env node
// Isolated local review. All accounts/consent/events are fictional and in memory.
// Does not import production auth/database adapters; never sends mail or model requests.
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import '../js/privacy-policy.js';
import '../js/analytics-policy.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const profiles=new Map(),events=[];
const user={uid:'preview-teacher',name:'演示教师（虚构）',email:'teacher@example.invalid',school:'演示学校',emailVerified:true,isAdmin:false};
const fixture=`let _currentUser=null,_authReady=true;window.PROXY_AUTH_SESSION_KEY='privacyPreviewSession';window.LAST_AUTH_USER_KEY='privacyPreviewUser';
try{_currentUser=JSON.parse(localStorage.getItem(window.PROXY_AUTH_SESSION_KEY)||'null')?.user||null;}catch{}
const auth={currentUser:null,signOut:async()=>{}};const db={collection(){throw new Error('预览不连接数据库');}};
function rememberLastAuthUser(){}function onAuthReady(callback){queueMicrotask(()=>callback(_currentUser));}
window.sendAccountVerification=async()=>{};window.syncEmailGate=()=>{};
window.fixtureUser=function(mode){if(mode==='guest'){localStorage.removeItem(window.PROXY_AUTH_SESSION_KEY);sessionStorage.removeItem(window.PROXY_AUTH_SESSION_KEY);_currentUser=null;}else{_currentUser=${JSON.stringify(user)};localStorage.setItem(window.PROXY_AUTH_SESSION_KEY,JSON.stringify({idToken:'preview-token',user:_currentUser,expiresAt:Date.now()+3600000}));}refreshAuthUI();document.dispatchEvent(new CustomEvent('authRefresh',{detail:_currentUser}));};
window.inspectPrivacy=async function(){const data=await(await fetch('/__preview/state')).json();document.getElementById('preview-state').textContent=JSON.stringify(data,null,2);};
window.fixtureEvent=async function(){await Analytics.track('page_view');await inspectPrivacy();};`;
const panel=`<aside style="padding:18px 24px;background:#e7f0f5;border-bottom:1px solid #bdcbd4;line-height:1.8"><strong>第二阶段 · 本地虚构数据预览</strong><p>这里的注册和选择只存在本地内存，不发邮件、不连接数据库或模型。刷新保留演示状态，关闭服务即清空。</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn-login" onclick="fixtureUser('guest');showAuthModal('register')">查看注册表单</button><button class="btn-login" onclick="fixtureUser('teacher');PrivacyUI.open()">模拟老用户确认</button><button class="btn-login" onclick="fixtureEvent()">模拟一次访问</button><button class="btn-login" onclick="inspectPrivacy()">查看确认记录与事件数</button></div><details><summary>查看演示数据</summary><pre id="preview-state" style="white-space:pre-wrap;overflow-wrap:anywhere">点击“查看确认记录与事件数”刷新。</pre></details></aside>`;
const headers={'Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'"};
const json=(res,status,data)=>{res.writeHead(status,{...headers,'Content-Type':'application/json'});res.end(JSON.stringify(data));};
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 try{
 if(req.method==='GET'&&url.pathname==='/__preview/state'){json(res,200,{privacy:profiles.get(user.uid)||null,eventCount:events.length,events});return;}
 if(req.method==='GET'&&url.pathname==='/__preview/fixture.js'){res.writeHead(200,{...headers,'Content-Type':'application/javascript'});res.end(fixture);return;}
 if(req.method==='POST'){
   let input='';for await(const part of req){input+=part;if(input.length>20000){json(res,413,{ok:false});return;}}
   const p=JSON.parse(input);
   if(url.pathname==='/api/auth-proxy'&&p.action==='register'){
     PrivacyPolicy.registration(p.consent);
     if(!p.email?.endsWith('@example.invalid'))throw Object.assign(new Error('预览请使用 teacher@example.invalid 这样的虚构邮箱'),{statusCode:400});
     profiles.set(user.uid,PrivacyPolicy.update(null,p.consent));json(res,200,{ok:true,user,idToken:'preview-token',expiresIn:3600,authBackend:'local'});return;
   }
   if(url.pathname==='/api/auth-proxy'&&p.action==='logout'){json(res,200,{ok:true});return;}
   if(p.idToken!=='preview-token'){json(res,401,{ok:false,msg:'请使用页面上方的演示按钮'});return;}
   if(url.pathname==='/api/privacy'){
     if(p.action==='save')profiles.set(user.uid,PrivacyPolicy.update(profiles.get(user.uid),p.choice));
     else if(p.action!=='get')throw Object.assign(new Error('未知操作'),{statusCode:400});
     json(res,200,{ok:true,privacy:profiles.get(user.uid)||null,version:PrivacyPolicy.VERSION});return;
   }
   if(url.pathname==='/api/analytics'){
     const recorded=PrivacyPolicy.allows(profiles.get(user.uid));
     if(recorded)events.push({...AnalyticsPolicy.normalize(p.event),uid:user.uid,ts:new Date().toISOString()});
     json(res,200,{ok:true,recorded});return;
   }
   json(res,404,{ok:false,msg:'预览不提供此功能'});return;
 }
 if(req.method==='GET'&&['/','/privacy','/privacy.html'].includes(url.pathname)){
   let html=readFileSync(resolve(root,'privacy.html'),'utf8');
   html=html.replace(/<script src="(?:vendor\/firebase\/[^"\n]+|js\/(?:firebase-config|data|email-gate)\.js[^"\n]*)"><\/script>/g,'');
   html=html.replace('<script src="js/auth.js','<script src="/__preview/fixture.js"></script><script src="js/auth.js');
   html=html.replace('<main id="main-content"',panel+'<main id="main-content"');
   html=html.replace('</body>','<script src="js/analytics-policy.js"></script><script src="js/analytics.js"></script></body>');
   res.writeHead(200,{...headers,'Content-Type':'text/html; charset=utf-8'});res.end(html);return;
 }
 const file=resolve(root,'.'+url.pathname);
 const ext=extname(file);
 if(req.method==='GET'&&file.startsWith(root)&&/^\/(js|css|vendor|assets)\//.test(url.pathname)&&['.js','.css','.svg','.woff2','.png','.jpg'].includes(ext)&&existsSync(file)){
   res.writeHead(200,{...headers,'Content-Type':({'.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg'})[ext]});res.end(readFileSync(file));return;
 }
 json(res,404,{ok:false,msg:'仅提供本地隐私预览'});
 }catch(error){json(res,error.statusCode||400,{ok:false,msg:error.message});}
});
server.listen(8767,'127.0.0.1',()=>console.log('第二阶段本地预览：http://127.0.0.1:8767/privacy （仅虚构内存数据，Ctrl+C 关闭）'));
