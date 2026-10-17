import '../js/analytics-policy.js';
import '../js/operations-policy.js';
import {getPool} from './local-auth-store.mjs';
import {locateOperation,unknownGeo} from './operations-geo.mjs';

const P=globalThis.OperationsPolicy,initialized=new WeakMap();
export const sourcesEnabled=env=>env.T_TRAINING_OPERATIONS_ANALYTICS==='1'&&env.T_TRAINING_OPERATIONS_SOURCES==='1';
export async function initializeSources(env){
    const pool=getPool(env);
    if(!initialized.has(pool)){
        const init=(async()=>{
            await pool.execute(`CREATE TABLE IF NOT EXISTS operations_sources_daily (
                day DATE NOT NULL, action VARCHAR(40) NOT NULL, feature VARCHAR(30) NOT NULL,
                target_id VARCHAR(80) NOT NULL DEFAULT '', country VARCHAR(64) NOT NULL,
                region VARCHAR(64) NOT NULL, city VARCHAR(64) NOT NULL, source VARCHAR(32) NOT NULL,
                count BIGINT UNSIGNED NOT NULL DEFAULT 0,
                PRIMARY KEY(day,action,feature,target_id,country,region,city,source)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
            await pool.execute('INSERT IGNORE INTO operations_state (name,value) VALUES (?,?)',['sourcesStartedAt',new Date().toISOString()]);
            const [rows]=await pool.execute('SELECT value FROM operations_state WHERE name=?',['sourcesStartedAt']);
            if(!rows[0]?.value)throw new Error('来源统计启用时间缺失');
            return rows[0].value;
        })().catch(error=>{initialized.delete(pool);throw error;});
        initialized.set(pool,init);
    }
    return initialized.get(pool);
}

export async function recordSource(env,counter,{request,now=new Date()}={}){
    if(!sourcesEnabled(env))return;
    await initializeSources(env);
    // Only the trusted Node adapter supplies this header. Never accept browser geo fields.
    const geo=request?await locateOperation(request.headers.get('CF-Connecting-IP')||''):unknownGeo();
    const source=P.source(request?.headers.get('X-Operations-Source'));
    const day=new Date(now.getTime()+8*3600000).toISOString().slice(0,10);
    await getPool(env).execute(`INSERT INTO operations_sources_daily (day,action,feature,target_id,country,region,city,source,count)
        VALUES (?,?,?,?,?,?,?,?,1) ON DUPLICATE KEY UPDATE count=count+1`,
        [day,counter.action,counter.feature,counter.targetId,geo.country,geo.region,geo.city,source]);
}

export function normalizeSourceFilter(value){
    if(typeof value!=='string'||value==='all')return {value:'all'};
    const [kind,id,...rest]=value.split(':');
    if(rest.length)return {value:'all'};
    if(kind==='feature'&&Object.values(P.pages).includes(id))return {value,feature:id};
    if(kind==='agent'&&Object.hasOwn(P.agents,id))return {value,feature:id.startsWith('research-')?'research':'agents',targetId:id};
    if(kind==='case'&&Object.hasOwn(P.cases,id))return {value,feature:'multimodal',targetId:id};
    if(kind==='classroom'&&Object.hasOwn(P.classroom,id))return {value,feature:'classroom',targetId:id};
    return {value:'all'};
}
const metrics={registrations:['registration'],pageViews:['page_view'],opens:['agent_open','classroom_open','workbook_view','workbook_open','multimodal_case_open','multimodal_video_open','multimodal_audio_play'],generations:['agent_run'],failures:['generation_failed'],saves:['workbook_save']};
const sums=Object.entries(metrics).map(([key,actions])=>`SUM(CASE WHEN action IN (${actions.map(a=>`'${a}'`).join(',')}) THEN count ELSE 0 END) AS ${key}`).join(',');
const values=row=>Object.fromEntries(Object.keys(metrics).map(key=>[key,Number(row[key])||0]));

export async function sourceSummary(env,days,{filter,level}={}){
    const selected=normalizeSourceFilter(filter),geoLevel=['country','region','city'].includes(level)?level:'region';
    if(!sourcesEnabled(env))return {enabled:false,startedAt:null,filter:selected.value,level:geoLevel,regions:[],channels:[],totals:null};
    const startedAt=await initializeSources(env),pool=getPool(env);
    const available=days.at(-1)>=new Date(Date.parse(startedAt)+8*3600000).toISOString().slice(0,10);
    if(!available)return {enabled:true,startedAt,available:false,filter:selected.value,level:geoLevel,totals:null,regions:[],channels:[]};
    const params=[days[0],days.at(-1)],clauses=['day BETWEEN ? AND ?'];
    if(selected.feature){clauses.push('feature=?');params.push(selected.feature);}
    if(selected.targetId){clauses.push('target_id=?');params.push(selected.targetId);}
    const where=clauses.join(' AND '),columns={country:'country',region:'country,region',city:'country,region,city'}[geoLevel];
    const [totalRows]=await pool.execute(`SELECT ${sums} FROM operations_sources_daily WHERE ${where}`,params);
    const [geoRows]=await pool.execute(`SELECT ${columns},${sums},SUM(count) AS total FROM operations_sources_daily WHERE ${where} GROUP BY ${columns} ORDER BY total DESC,${columns} LIMIT 20`,params);
    const [channelRows]=await pool.execute(`SELECT source,${sums} FROM operations_sources_daily WHERE ${where} GROUP BY source ORDER BY SUM(count) DESC,source`,params);
    const totals=values(totalRows[0]||{});
    const regions=geoRows.map(row=>({label:columns.split(',').map(key=>row[key]||'未知').filter((v,i,a)=>i===0||v!==a[i-1]).join(' · '),...values(row)}));
    const rest=Object.fromEntries(Object.keys(metrics).map(key=>[key,totals[key]-regions.reduce((n,r)=>n+r[key],0)]));
    if(Object.values(rest).some(n=>n>0))regions.push({label:'其他地区（合计）',...rest});
    const channels=channelRows.map(row=>({label:P.channels[P.source(row.source)],...values(row)}));
    return {enabled:true,startedAt,available:true,filter:selected.value,level:geoLevel,totals,regions,channels};
}
