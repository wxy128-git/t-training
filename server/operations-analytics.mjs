import '../js/analytics-policy.js';
import '../js/operations-policy.js';
import {getPool} from './local-auth-store.mjs';
import {localFeatureSession} from './local-firestore-store.mjs';
import {recordSource,sourceSummary,sourcesEnabled} from './operations-sources.mjs';

const initialized = new WeakMap();
const P=globalThis.OperationsPolicy;
export const enabled = env => env.T_TRAINING_OPERATIONS_ANALYTICS === '1';
export const chinaDay = value => new Date(new Date(value).getTime()+8*3600000).toISOString().slice(0,10);
const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});

export async function initializeOperations(env) {
    const pool=getPool(env);
    if(!initialized.has(pool)) {
        const init=(async()=>{
            await pool.execute(`CREATE TABLE IF NOT EXISTS operations_daily (
                day DATE NOT NULL, action VARCHAR(40) NOT NULL, feature VARCHAR(30) NOT NULL,
                target_id VARCHAR(80) NOT NULL DEFAULT '', count BIGINT UNSIGNED NOT NULL DEFAULT 0,
                duration_ms BIGINT UNSIGNED NOT NULL DEFAULT 0,
                PRIMARY KEY(day,action,feature,target_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
            await pool.execute(`CREATE TABLE IF NOT EXISTS operations_state (
                name VARCHAR(40) PRIMARY KEY, value VARCHAR(80) NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
            await pool.execute('INSERT IGNORE INTO operations_state (name,value) VALUES (?,?)',['startedAt',new Date().toISOString()]);
            const [rows]=await pool.execute('SELECT value FROM operations_state WHERE name=?',['startedAt']);
            if(!rows[0]?.value)throw new Error('运营计数启用时间缺失');
            return rows[0].value;
        })().catch(error=>{initialized.delete(pool);throw error;});
        initialized.set(pool,init);
    }
    return initialized.get(pool);
}

export async function recordOperation(env, raw, {trusted=false,now=new Date(),request}={}) {
    if(!enabled(env))return false;
    const counter=P.normalize(raw,trusted);
    await initializeOperations(env);
    await getPool(env).execute(`INSERT INTO operations_daily (day,action,feature,target_id,count,duration_ms)
        VALUES (?,?,?,?,1,?) ON DUPLICATE KEY UPDATE count=count+1,duration_ms=duration_ms+VALUES(duration_ms)`,
        [chinaDay(now),counter.action,counter.feature,counter.targetId,counter.durationMs]);
    try{await recordSource(env,counter,{request,now});}catch{console.warn('[operations] source counter unavailable');}
    return true;
}

export function summarizeOperations(rows, days, startedAt, savedRows=[], isEnabled=true) {
    const startDay=startedAt?chinaDay(startedAt):'';
    const measurable=day=>isEnabled&&!!startDay&&day>=startDay;
    const daily=days.map(day=>({day,available:measurable(day),visitors:null,pageViews:measurable(day)?0:null,
        agentRuns:measurable(day)?0:null,generationFailures:measurable(day)?0:null,
        workbookSaves:measurable(day)?0:null,workbookUses:measurable(day)?0:null,multimodalUses:measurable(day)?0:null,
        existingWorks:0}));
    const byDay=new Map(daily.map(d=>[d.day,d]));
    const totals={visitors:null,loggedUsers:null,pageViews:0,agentRuns:0,generationFailures:0,workbookSaves:0,
        workbookUses:0,multimodalUses:0,existingWorks:0,averageGenerationMs:null};
    const agents=new Map(),cases=new Map(); let duration=0;
    const addRank=(map,id,name,n)=>{const r=map.get(id)||{id,name,count:0};r.count+=n;map.set(id,r);};
    for(const row of rows){
        const day=String(row.day).slice(0,10),d=byDay.get(day);if(!d?.available)continue;
        const n=Number(row.count)||0;
        const keys=[];
        if(row.action==='page_view')keys.push('pageViews');
        if(row.action==='agent_run'){keys.push('agentRuns');duration+=Number(row.duration_ms)||0;addRank(agents,row.target_id,P.agents[row.target_id]||'其他智能体',n);}
        if(row.action==='generation_failed')keys.push('generationFailures');
        if(['workbook_view','workbook_open','workbook_save'].includes(row.action))keys.push('workbookUses');
        if(row.action==='workbook_save')keys.push('workbookSaves');
        if(row.action.startsWith('multimodal_')||(row.action==='page_view'&&row.feature==='multimodal'))keys.push('multimodalUses');
        if(row.action.startsWith('multimodal_'))addRank(cases,row.target_id,P.cases[row.target_id]||'其他案例',n);
        for(const key of keys){d[key]+=n;totals[key]+=n;}
    }
    for(const row of savedRows){const d=byDay.get(row.day);if(d){d.existingWorks+=Number(row.count)||0;totals.existingWorks+=Number(row.count)||0;}}
    const hasCoverage=daily.some(d=>d.available);
    if(!hasCoverage)for(const key of ['pageViews','agentRuns','generationFailures','workbookSaves','workbookUses','multimodalUses'])totals[key]=null;
    if(totals.agentRuns>0)totals.averageGenerationMs=duration/totals.agentRuns;
    const rank=map=>[...map.values()].sort((a,b)=>b.count-a.count).slice(0,8);
    return {mode:'operations',range:{startDay:days[0],endDay:days.at(-1)},coverage:{enabled:isEnabled,startedAt,hasCoverage},
        totals,daily,topAgents:rank(agents),topMultimodal:rank(cases),users:[],recent:[],funnel:[],feedbackReasons:[]};
}

export async function operationsSummary(env,count,now=new Date(),sourceOptions={}) {
    const days=Array.from({length:count},(_,i)=>chinaDay(new Date(now.getTime()-(count-1-i)*86400000)));
    const pool=getPool(env),isEnabled=enabled(env);
    const startedAt=isEnabled?await initializeOperations(env):null;
    const rows=isEnabled?(await pool.execute(`SELECT DATE_FORMAT(day,'%Y-%m-%d') AS day,action,feature,target_id,count,duration_ms
        FROM operations_daily WHERE day BETWEEN ? AND ?`,[days[0],days.at(-1)]))[0]:[];
    // SQL extracts only creation dates. Never load titles,正文, inputs or owners into analytics.
    const dateExpression="COALESCE(JSON_UNQUOTE(JSON_EXTRACT(fields_json,'$.createdAt.stringValue')),JSON_UNQUOTE(JSON_EXTRACT(fields_json,'$.createdAt.timestampValue')))";
    const [saved]=await pool.execute(`SELECT DATE_FORMAT(DATE_ADD(STR_TO_DATE(LEFT(${dateExpression},19),'%Y-%m-%dT%H:%i:%s'),INTERVAL 8 HOUR),'%Y-%m-%d') AS day,COUNT(*) AS count
        FROM firestore_documents WHERE collection_name='works' AND JSON_VALID(fields_json)
        GROUP BY day HAVING day BETWEEN ? AND ?`,[days[0],days.at(-1)]);
    return {...summarizeOperations(rows,days,startedAt,saved,isEnabled),sources:await sourceSummary(env,days,sourceOptions)};
}

export async function handleOperations({request,env,payload}) {
    if(payload.action==='operations-status')return reply(200,{ok:true,enabled:enabled(env),sources:sourcesEnabled(env),research:false});
    if(payload.action==='operations-summary'){
        const session=await localFeatureSession(env,payload.adminIdToken);
        if(!session.user.isAdmin)return reply(403,{ok:false,msg:'当前账号没有管理员权限'});
        const count=[7,14,30,60,90].includes(Number(payload.days))?Number(payload.days):14;
        return reply(200,{ok:true,...await operationsSummary(env,count,new Date(),{filter:payload.sourceFilter,level:payload.sourceLevel})});
    }
    if(payload.action==='operations-track'){
        if(!enabled(env))return reply(200,{ok:true,recorded:false,reason:'operations_disabled'});
        const origin=request.headers.get('origin');
        if(origin&&origin!==new URL(request.url).origin)return reply(403,{ok:false,msg:'统计来源无效'});
        if(request.headers.get('sec-fetch-site')==='cross-site')return reply(403,{ok:false,msg:'统计来源无效'});
        if(Number(request.headers.get('content-length')||0)>2048)return reply(413,{ok:false,msg:'统计请求过大'});
        let counter;
        try{counter=P.normalize(payload.counter);}catch{return reply(400,{ok:false,msg:'不支持的运营计数'});}
        await recordOperation(env,counter,{request});
        return reply(200,{ok:true,recorded:true});
    }
    return null;
}
