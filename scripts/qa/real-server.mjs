// 仅在服务器私有的临时副本中运行；不对公网监听，不更改生产进程。
import fs from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startApiServer } from '../../server/tencent-api.mjs';

process.loadEnvFile('/home/ubuntu/.config/t-training.env');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ledgerPath = resolve(root, '.qa-ledger.json');
const controlPath = resolve(root, '.qa-control.json');
const prefix = 'ttqa-20260921-';
const ledger = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath)) : {users:[],works:[],subscribers:[],modelCalls:0,modelRequests:[]};
const save = () => fs.writeFileSync(ledgerPath, JSON.stringify(ledger), {mode:0o600});
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, options = {}) => {
    const url = String(input);
    const body = typeof options.body === 'string' ? (()=>{try{return JSON.parse(options.body);}catch{return {};}})() : {};
    if (/api\.deepseek\.com\/|open\.bigmodel\.cn\//.test(url)) {
        const control = fs.existsSync(controlPath) ? JSON.parse(fs.readFileSync(controlPath)) : {maxModelCalls:0};
        const limit = Math.min(32, Math.max(0, Number(control.maxModelCalls)||0));
        if (ledger.modelCalls >= limit) return Response.json({error:{message:'真实模型验收额度未授权或已用完'}}, {status:429});
        ledger.modelCalls++;
        ledger.modelRequests.push({number:ledger.modelCalls,model:body.model,stream:body.stream !== false,at:new Date().toISOString()}); save();
        console.log(`QA model request ${ledger.modelCalls}/${limit}: ${body.model}, stream=${body.stream !== false}`);
    }
    if (url.includes('accounts:signUp') && (!String(body.email).startsWith(prefix) || !String(body.email).endsWith('@example.invalid'))) {
        return Response.json({error:{message:'QA_ONLY_TEST_ACCOUNTS'}},{status:400});
    }
    // 本次不发送恢复邮件；邮件送达必须用负责人明确指定的收件账号另验。
    if (url.includes('accounts:sendOobCode')) return Response.json({error:{message:'QA_EMAIL_DELIVERY_NOT_AUTHORIZED'}},{status:400});
    const response = await originalFetch(input, options);
    if (url.includes('accounts:signUp') && response.ok) {
        const data = await response.clone().json();
        ledger.users.push({email:body.email,uid:data.localId}); save();
    }
    if (/\/documents\/works(?:\?|$)/.test(url) && options.method === 'POST' && response.ok) {
        const data = await response.clone().json();
        ledger.works.push(data.name.split('/').at(-1)); save();
    }
    if (/\/documents\/subscribers\?documentId=/.test(url) && options.method === 'POST' && String(body.fields?.email?.stringValue).startsWith(prefix)) {
        ledger.subscribers.push(new URL(url).searchParams.get('documentId')); save();
    }
    return response;
};
const server = await startApiServer({host:'127.0.0.1',port:18766});
fs.writeFileSync(resolve(root,'.qa.pid'),String(process.pid),{mode:0o600});
process.on('SIGTERM',()=>{server.closeAllConnections?.();server.close(()=>process.exit(0));});
