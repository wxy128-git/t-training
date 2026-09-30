import '../js/analytics-policy.js';
import { getPool, publicUser } from './local-auth-store.mjs';
import { localFeatureSession, listDocuments } from './local-firestore-store.mjs';

const CORS_HEADERS = { 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
function response(status, body) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS_HEADERS } }); }
function text(value, max) { return String(value || '').trim().slice(0, max); }
function chinaDay(date) { return new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10); }
function daysRange(count) { const end = chinaDay(new Date()); const out=[]; for(let i=count-1;i>=0;i--){const d=new Date(Date.now()-i*86400000); out.push(chinaDay(d));} return { start: out[0], end, days: out }; }
export function eventFromPayload(raw, user) {
    const now = new Date();
    return { ...globalThis.AnalyticsPolicy.normalize(raw), ts:now.toISOString(), day:chinaDay(now), uid:user?.uid || '' };
}

export async function loadAnalyticsProfiles(env, uids) {
    const profiles = new Map();
    const unique = [...new Set(uids.filter(Boolean))];
    for (let i = 0; i < unique.length; i += 100) {
        const ids = unique.slice(i, i + 100);
        const [rows] = await getPool(env).execute(`
            SELECT a.uid, a.display_name, a.email, p.name, p.phone, p.school
            FROM auth_users a LEFT JOIN user_profiles p ON p.uid = a.uid
            WHERE a.uid IN (${ids.map(() => '?').join(',')})
        `, ids);
        for (const row of rows) {
            const user = publicUser(row);
            profiles.set(row.uid, { name:user.name, account:user.email || user.phone || '', school:user.school });
        }
    }
    return profiles;
}
const missingProfile = { name:'资料已不可用', account:'', school:'' };
function rank(map) { return [...map.values()].sort((a,b)=>b.count-a.count || String(a.name).localeCompare(String(b.name),'zh-CN')).slice(0,8); }
export function summary(events, days, profiles = new Map()) {
    const daily = new Map(days.map(day=>[day,{day,visitors:0,pageViews:0,agentRuns:0,generationFailures:0,teacherReviews:0,workbookSaves:0,workbookUses:0,multimodalUses:0,_visitors:new Set()}]));
    const visitors=new Set(), logged=new Set(), users=new Map(), agents=new Map(), multimedia=new Map(), feedback=new Map(), funnel={opened:new Set(),generated:new Set(),reviewed:new Set(),saved:new Set(),continued:new Set()};
    let pageViews=0,agentRuns=0,generationFailures=0,teacherReviews=0,workbookSaves=0,projectSaves=0,workflowContinues=0,workbookUses=0,multimodalUses=0,totalMs=0,durationCount=0;
    for(const e of events){ const d=daily.get(e.day); const visitor=e.visitorId||e.uid||e.sessionId||''; const session=e.sessionId||e.uid||e.visitorId||''; if(e.action==='page_view'){pageViews++;if(visitor)visitors.add(visitor);if(d){d.pageViews++;if(visitor)d._visitors.add(visitor);}} if(e.uid)logged.add(e.uid);
        if(e.uid){const u=users.get(e.uid)||{uid:e.uid,...(profiles.get(e.uid)||missingProfile),visits:0,agentRuns:0,workbookUses:0,multimodalUses:0,lastAction:'',lastSeen:''}; if(e.action==='page_view')u.visits++; if(String(e.ts||'')>String(u.lastSeen||'')){u.lastSeen=e.ts||'';u.lastAction=e.action;} users.set(e.uid,u);}
        if(e.action==='agent_run'){agentRuns++;if(d)d.agentRuns++;if(users.get(e.uid))users.get(e.uid).agentRuns++;if(session)funnel.generated.add(session);const ms=Number(e.meta?.durationMs||0);if(ms>0&&ms<600000){totalMs+=ms;durationCount++;}const key=e.targetId||e.targetName||'unknown';const item=agents.get(key)||{id:e.targetId||key,name:e.targetName||key,count:0};item.count++;agents.set(key,item);}
        if(e.action==='agent_open'&&session)funnel.opened.add(session); if(e.action==='generation_failed'){generationFailures++;if(d)d.generationFailures++;} if(e.action==='teacher_reviewed'){teacherReviews++;if(d)d.teacherReviews++;if(session)funnel.reviewed.add(session);} if(e.action==='project_saved')projectSaves++; if(e.action==='workflow_continue'){workflowContinues++;if(session)funnel.continued.add(session);} if(e.action==='result_feedback'){const key=text(e.meta?.reason||'unknown',80);feedback.set(key,(feedback.get(key)||0)+1);}
        const isWorkbook=['workbook_save','workbook_open','workbook_view'].includes(e.action);if(isWorkbook){workbookUses++;if(d)d.workbookUses++;if(users.get(e.uid))users.get(e.uid).workbookUses++;}if(e.action==='workbook_save'){workbookSaves++;if(d)d.workbookSaves++;if(session)funnel.saved.add(session);}
        const isMulti=['multimodal_case_open','multimodal_video_open','multimodal_audio_play'].includes(e.action)||(e.action==='page_view'&&e.feature==='multimodal');if(isMulti){multimodalUses++;if(d)d.multimodalUses++;if(users.get(e.uid))users.get(e.uid).multimodalUses++;if(!['page_view'].includes(e.action)){const key=e.targetId||e.targetName||'unknown';const item=multimedia.get(key)||{id:e.targetId||key,name:e.targetName||key,count:0};item.count++;multimedia.set(key,item);}}
    }
    const dailyRows=[...daily.values()].map(({_visitors,...row})=>({...row,visitors:_visitors.size})); const opened=funnel.opened.size; const within=set=>[...set].filter(id=>funnel.opened.has(id)).length;
    return { range:{startDay:days[0],endDay:days.at(-1)}, totals:{visitors:visitors.size,pageViews,loggedUsers:logged.size,agentRuns,generationFailures,teacherReviews,workbookSaves,projectSaves,workflowContinues,averageGenerationMs:durationCount?Math.round(totalMs/durationCount):0,workbookUses,multimodalUses,eventCount:events.length},daily:dailyRows,users:[...users.values()].sort((a,b)=>String(b.lastSeen).localeCompare(String(a.lastSeen))).slice(0,80),topAgents:rank(agents),topMultimodal:rank(multimedia),funnel:[['opened','进入任务',funnel.opened.size],['generated','成功生成',within(funnel.generated)],['reviewed','完成核验',within(funnel.reviewed)],['saved','保存成果',within(funnel.saved)],['continued','继续下一步',within(funnel.continued)]].map(([key,label,count])=>({key,label,count,rate:opened?Math.round(count/opened*100):0})),feedbackReasons:[...feedback.entries()].map(([reason,count])=>({reason,count})).sort((a,b)=>b.count-a.count),recent:events.filter(e=>e.uid).slice(0,40).map(e=>({ts:e.ts,action:e.action,feature:e.feature,targetName:e.targetName,userName:(profiles.get(e.uid)||missingProfile).name,account:(profiles.get(e.uid)||missingProfile).account}))};
}
export async function onRequestOptions(){return new Response(null,{status:204,headers:CORS_HEADERS});}
export async function onRequestPost({ request, env }) {
    let payload;
    try { payload = await request.json(); }
    catch { return response(400, { ok:false, msg:'请求格式不正确' }); }
    try {
        if (payload.action === 'track') {
            return response(200,{ok:true,recorded:false,reason:'research_paused'});
        }
        if (payload.action === 'summary') {
            const session = await localFeatureSession(env, payload.adminIdToken);
            if (!session.user.isAdmin) return response(403, { ok:false, msg:'当前账号没有管理员权限' });
            const n = [7,14,30,60,90].includes(Number(payload.days)) ? Number(payload.days) : 14;
            const range = daysRange(n);
            // Daily preaggregation is deliberately deferred to the approved phase-five plan.
            const events = (await listDocuments(env, 'analytics_events'))
                .filter(e => e.day >= range.start && e.day <= range.end)
                .sort((a,b) => String(b.ts).localeCompare(String(a.ts)))
                .slice(0,6000);
            const profiles = await loadAnalyticsProfiles(env, events.map(e => e.uid));
            const result = summary(events, range.days, profiles);
            result.truncated = events.length >= 6000;
            return response(200, { ok:true, ...result });
        }
        return response(400, { ok:false, msg:'未知统计操作' });
    } catch (error) {
        return response(error.statusCode || 500, { ok:false, msg:error.message || '统计服务暂时不可用', code:error.code });
    }
}
