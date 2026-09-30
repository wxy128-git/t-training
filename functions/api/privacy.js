// Firebase compatibility path, not the current Tencent production data source.
import '../../js/privacy-policy.js';
const ROOT = 'https://firestore.googleapis.com/v1/projects/xylaoshi-28f6c/databases/(default)/documents';
async function requestJson(url, token, body) {
    const response = await fetch(url, {method:body ? 'POST':'GET', headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`}, ...(body ? {body:JSON.stringify(body)}:{}), signal:AbortSignal.timeout(6000)});
    if (!response.ok) throw Object.assign(new Error('隐私设置暂时不可用'),{statusCode:response.status === 403 ? 403 : 502});
    return response.json();
}
export async function privacyUser(token) {
    if (!token || typeof token !== 'string') throw Object.assign(new Error('请先登录'),{statusCode:401});
    const response = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=AIzaSyBx7adowufG1syf9ryrsFhywcVMS-sWxWo', {method:'POST', headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token}),signal:AbortSignal.timeout(6000)});
    const user = (await response.json()).users?.[0];
    if (!response.ok || !user?.localId) throw Object.assign(new Error('请先登录'),{statusCode:401});
    return user;
}
export async function readFirebasePrivacy(token, uid) {
    const data = await requestJson(`${ROOT}/users/${encodeURIComponent(uid)}?mask.fieldPaths=privacy`,token);
    const f = data.fields?.privacy?.mapValue?.fields;
    return f ? {version:f.version?.stringValue || '', acceptedAt:f.acceptedAt?.timestampValue || '', research:f.research?.booleanValue === true, researchVersion:f.researchVersion?.stringValue || '',researchUpdatedAt:f.researchUpdatedAt?.timestampValue || ''}:null;
}
export function privacyFields(privacy) {
    return {mapValue:{fields:{version:{stringValue:privacy.version}, acceptedAt:privacy.acceptedAt ? {timestampValue:privacy.acceptedAt} : {nullValue:null},research:{booleanValue:privacy.research},researchVersion:{stringValue:privacy.researchVersion}}}};
}
export async function writeFirebasePrivacy(token, uid, input) {
    const old = await readFirebasePrivacy(token,uid);
    const privacy = globalThis.PrivacyPolicy.update(old,input);
    const transforms = [{fieldPath:'privacy.researchUpdatedAt',setToServerValue:'REQUEST_TIME'}];
    if(input.accepted && !(old?.version===privacy.version && old?.acceptedAt)) transforms.push({fieldPath:'privacy.acceptedAt',setToServerValue:'REQUEST_TIME'});
    await requestJson(`${ROOT}:commit`,token,{writes:[{update:{name:`projects/xylaoshi-28f6c/databases/(default)/documents/users/${uid}`,fields:{privacy:privacyFields(privacy)}},updateMask:{fieldPaths:['privacy']},currentDocument:{exists:true},updateTransforms:transforms}]});
    return readFirebasePrivacy(token,uid);
}
const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export async function onRequestPost({request}) {
    try {
        const p=await request.json();
        const u=await privacyUser(p.idToken);
        if(!['get','save'].includes(p.action)) return reply(400,{ok:false,msg:'未知隐私操作'});
        const privacy=p.action==='save'?await writeFirebasePrivacy(p.idToken,u.localId,p.choice):await readFirebasePrivacy(p.idToken,u.localId);
        return reply(200,{ok:true,privacy,version:globalThis.PrivacyPolicy.VERSION});
    } catch(error){return reply(error.statusCode||500,{ok:false,msg:error.message});}
}
export async function onRequestOptions(){return new Response(null,{status:204});}
