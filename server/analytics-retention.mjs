import '../js/privacy-policy.js';
import {getPool} from './local-auth-store.mjs';
// Historical events have either Firestore timestampValue or local stringValue.
// Malformed/missing timestamps fall back to the row's insertion time, never a guessed user time zone.
const AGE = `COALESCE(
 NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(fields_json,'$.ts.timestampValue')), 'null'), ''),
 NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(fields_json,'$.ts.stringValue')), 'null'), ''),
 NULLIF(create_time_iso,''), DATE_FORMAT(imported_at,'%Y-%m-%dT%H:%i:%s.000Z'))`;
export async function expireAnalytics(pool, {dryRun=true, now=new Date()}={}) {
    const cutoff=new Date(now.getTime()-globalThis.PrivacyPolicy.RETENTION_DAYS*86400000).toISOString();
    const params=['analytics_events',cutoff];
    if(dryRun){const [rows]=await pool.execute(`SELECT COUNT(*) AS count FROM firestore_documents WHERE collection_name=? AND ${AGE} < ?`,params);return {cutoff,count:Number(rows[0].count),dryRun:true};}
    let count=0,affected;
    do {const [result]=await pool.execute(`DELETE FROM firestore_documents WHERE collection_name=? AND ${AGE} < ? LIMIT 1000`,params);affected=result.affectedRows;count+=affected;} while(affected===1000);
    return {cutoff,count,dryRun:false};
}
export function startAnalyticsRetention(env, server) {
    // Explicit deployment switch: never silently execute deletion on an existing installation.
    if(env.T_TRAINING_ANALYTICS_RETENTION_ENABLED!=='1') return;
    let busy=false;
    const run=async()=>{if(busy)return;busy=true;try{const result=await expireAnalytics(getPool(env),{dryRun:false});console.log(`[analytics-retention] removed=${result.count} cutoff=${result.cutoff}`);}catch{console.error('[analytics-retention] cleanup failed; check database and retention configuration');}finally{busy=false;}};
    run();const timer=setInterval(run,3600000);timer.unref();server.once('close',()=>clearInterval(timer));
}
