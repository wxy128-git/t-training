#!/usr/bin/env node
// Loopback-only disposable demo. SQL is simulated; no production configuration is read.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adminFixture } from './fixtures/admin-store.mjs';
import * as content from '../server/local-content.mjs';
import * as users from '../server/local-admin-users.mjs';
const f = await adminFixture();
f.users.push({uid:'teacher-with-work',name:'有作品的演示教师',email:'author@example.invalid',email_verified:1,school:'演示学校',joined_at_iso:'2026-10-01T00:00:00Z'});
f.seed('works','protected-work',{uid:'teacher-with-work',title:'演示备课本',content:'此作品应受到保护'});
const root = fileURLToPath(new URL('../', import.meta.url));
for (const [collection, id, data] of [
    ['tools','demo-tool',{name:'演示工具',desc:'仅供本地验收',url:'https://example.invalid',order:0}],
    ['prompts','demo-prompt',{name:'演示提示词',category:'备课',content:'虚构示例',order:0}],
    ['announcements','demo-ann',{title:'演示公告',content:'修改后应保留发布时间',createdAt:'2026-10-01T00:00:00Z'}],
    ['contact_messages','demo-message',{name:'演示教师',contact:'teacher@example.invalid',message:'标记已处理后，这段虚构留言应保持完整。',createdAt:'2026-10-01T00:00:00Z',handled:false}],
    ['resource_categories','demo-category',{title:'演示素材',icon:'ph-image',items:[],order:0}]
]) f.seed(collection,id,data);
const js = `const _currentUser={uid:'${f.users[0].uid}',name:'本地演示管理员',isAdmin:true};
const Auth={isAdmin:()=>true,canUseFeatures:()=>true,getIdToken:async()=>${JSON.stringify(f.token)}};
function onAuthReady(fn){queueMicrotask(()=>fn(_currentUser));}
function renderNav(){}function showToast(text){document.getElementById('demo-status').textContent=text;}
const db={collection(){throw new Error('演示禁止连接 Firebase');}};`;
const ignored = new Set(['/js/auth.js','/js/privacy-ui.js','/js/email-gate.js','/js/assistant.js','/js/pwa.js']);
const server = createServer(async(req,res)=>{
    try {
        const url = new URL(req.url,'http://localhost');
        let response;
        if (url.pathname.startsWith('/api/')) {
            const chunks=[];for await(const chunk of req){chunks.push(chunk);if(Buffer.concat(chunks).length>400000)throw new Error('请求过大');}
            const request=new Request(url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});
            if(url.pathname==='/api/content')response=await content[req.method==='POST'?'onRequestPost':'onRequestGet']({request,env:f.env});
            else if(url.pathname==='/api/admin-users')response=await users.onRequestPost({request,env:f.env});
            else response=Response.json({ok:false,msg:'本地演示未提供此接口'},{status:404});
            res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
        }
        res.setHeader('Cache-Control','no-store');
        if(url.pathname==='/js/firebase-config.js'){res.setHeader('Content-Type','text/javascript');res.end(js);return;}
        if(ignored.has(url.pathname)||url.pathname.startsWith('/vendor/firebase/')){res.setHeader('Content-Type','text/javascript');res.end('/* isolated preview */');return;}
        let pathname = decodeURIComponent(url.pathname);
        if(pathname==='/')pathname='/admin';
        if(!extname(pathname))pathname+='.html';
        const file=resolve(root,'.'+pathname);
        if(!file.startsWith(root)||!(/\.(html|css|js|woff2?|svg|png|jpg|webp)$/.test(file)))throw new Error('文件不可用');
        let body=await readFile(file);
        res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'})[extname(file)]||'application/octet-stream');
        if(extname(file)==='.html')body=body.toString().replace('<body>','<body><div style="padding:12px;background:#fff3cd">本地演示 · 全部为虚构数据 · 重启后重置 <span id="demo-status" role="status"></span></div>');
        res.end(body);
    }catch{res.writeHead(404);res.end('本地演示：无法读取');}
});
server.listen(8768,'127.0.0.1',()=>console.log('腾讯后台演示：http://127.0.0.1:8768/admin（仅虚构数据）'));
