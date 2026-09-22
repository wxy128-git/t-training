// 只清理本次私有 ledger 中由固定 QA 前缀创建的记录；绝不枚举普通用户。
import fs from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
process.loadEnvFile('/home/ubuntu/.config/t-training.env');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const ledger=JSON.parse(fs.readFileSync(resolve(root,'.qa-ledger.json')));
if(!ledger.users.every(u=>u.email.startsWith('ttqa-20260921-')&&u.email.endsWith('@example.invalid'))) throw new Error('QA identity guard failed');
// 管理 Authentication 的删除与回查需要 identitytoolkit scope；只在本清理进程申请。
const source=fs.readFileSync(resolve(root,'functions/api/works.js'),'utf8').replace("const ADMIN_SCOPES = 'https://www.googleapis.com/auth/datastore';", "const ADMIN_SCOPES = 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit';");
const internal=await import('data:text/javascript;base64,'+Buffer.from(source+'\nexport { getGoogleAccessToken };').toString('base64'));
const token=await internal.getGoogleAccessToken(process.env);
const base='https://firestore.googleapis.com/v1/projects/xylaoshi-28f6c/databases/(default)/documents';
const deleted=[];
for(const [collection,ids] of [['works',ledger.works],['subscribers',ledger.subscribers],['users',ledger.users.map(u=>u.uid)]]) {
    for(const id of new Set(ids)) {
        if(!/^[\w-]+$/.test(id))throw new Error('Invalid cleanup id');
        const response=await fetch(`${base}/${collection}/${id}`,{method:'DELETE',headers:{Authorization:`Bearer ${token}`}});
        if(!response.ok&&response.status!==404)throw new Error(`Cleanup failed: ${collection}, ${response.status}`);
        const check=await fetch(`${base}/${collection}/${id}`,{headers:{Authorization:`Bearer ${token}`}});
        if(check.status!==404)throw new Error('Deletion verification failed');
        deleted.push(collection);
    }
}
for(const user of ledger.users) {
    const response=await fetch('https://identitytoolkit.googleapis.com/v1/projects/xylaoshi-28f6c/accounts:delete',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({localId:user.uid})});
    const result=await response.json().catch(()=>({}));
    if(!response.ok && result.error?.message !== 'USER_NOT_FOUND')throw new Error(`Auth cleanup failed: ${response.status}`);
    const check=await fetch('https://identitytoolkit.googleapis.com/v1/projects/xylaoshi-28f6c/accounts:lookup',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({localId:[user.uid]})});
    const remaining=await check.json();
    if(!check.ok || remaining.users?.length)throw new Error('Auth deletion verification failed');
}
const summary={cleaned:true,users:ledger.users.length,documents:deleted.length,modelCalls:ledger.modelCalls,classificationCalls:ledger.modelRequests.filter(r=>!r.stream).length,models:[...new Set(ledger.modelRequests.map(r=>r.model))]};
if(process.argv.includes('--remove-staging')) {
    if(root!=='/home/ubuntu/t-training/qa-20260921-account-quality')throw new Error('Staging path guard failed');
    const pid=Number(fs.readFileSync(resolve(root,'.qa.pid'),'utf8'));
    if(!Number.isInteger(pid)||pid<2)throw new Error('Invalid QA PID');
    if(fs.existsSync(`/proc/${pid}`)) {
        if(fs.readlinkSync(`/proc/${pid}/cwd`)!==root || !fs.readFileSync(`/proc/${pid}/cmdline`,'utf8').includes('scripts/qa/real-server.mjs'))throw new Error('QA process ownership guard failed');
        process.kill(pid,'SIGTERM');
        for(let attempt=0;attempt<50&&fs.existsSync(`/proc/${pid}`);attempt++)await new Promise(r=>setTimeout(r,100));
        if(fs.existsSync(`/proc/${pid}`))throw new Error('QA server did not stop; preserve staging');
    }
    fs.rmSync(root,{recursive:true});
    summary.serverStopped=true;
    summary.stagingRemoved=!fs.existsSync(root);
}
console.log(JSON.stringify(summary));
