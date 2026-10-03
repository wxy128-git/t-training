#!/usr/bin/env node
// Default: fully offline. Explicit ADMIN_TEST_* opts into an isolated real DB.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { onRequestPost } from '../server/local-admin-users.mjs';
import { onRequestPost as authPost } from '../server/local-auth-proxy.mjs';
import { findUserByUid, readLocalAccessToken, readAuthActionToken, upsertFirebaseAccount, upsertProfile, getPool } from '../server/local-auth-store.mjs';
import { getDocument, deleteDocument, upsertDocument } from '../server/local-firestore-store.mjs';
const { adminFixture } = await import(process.env.ADMIN_TEST_ALLOW_CREATE === 'yes' ? './fixtures/admin-mariadb.mjs' : './fixtures/admin-store.mjs');
const f = await adminFixture();
f.env.T_TRAINING_REGISTRATION_BACKEND = 'local';
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('测试禁止外部网络请求'); };
let checks = 0;
function check(condition, message) { assert.ok(condition, message); checks++; }
const post = async (body, token = f.token, handler = onRequestPost) => {
    const response = await handler({ env: f.env, request: new Request('http://127.0.0.1/api/test', {
        method: 'POST', body: JSON.stringify({ adminIdToken: token, ...body })
    }) });
    return { status: response.status, ...await response.json() };
};
try {
    await upsertProfile(f.env,'teacher',{name:'演示教师',email:'teacher@example.invalid',phone:'13900000000',school:'演示学校'});
    const admin = (await readLocalAccessToken(f.env, f.token)).user.uid;
    check((await post({action:'previewDeleteUser',uid:'teacher'},f.teacherToken)).status === 403, '普通用户不能预览删除');
    check((await post({action:'deleteUser',uid:'teacher'},f.teacherToken)).status === 403, '普通用户不能删除');
    check((await post({action:'previewDeleteUser',uid:'teacher'},'invalid')).status === 401, '无效登录不能查看删除信息');
    check((await post({action:'previewDeleteUser',uid:admin})).status === 400, '管理员不可删除自己');
    check((await post({action:'deleteUser',uid:admin})).status === 400, '管理员绕过预览也不可删除自己');
    check((await post({action:'previewDeleteUser',uid:'missing'})).status === 404, '不存在账号不显示成功');
    check((await post({action:'deleteUser',uid:'teacher'})).status === 409, '缺少预览凭据不能删除');
    const preview = await post({action:'previewDeleteUser',uid:'teacher'});
    check(preview.ok && !preview.blocked && preview.ticket && preview.confirmation === 'teacher@example.invalid', '空账号预览正确');
    const request = {action:'deleteUser',uid:'teacher',ticket:preview.ticket,confirmation:preview.confirmation};
    check((await post({...request,confirmation:'wrong@example.invalid'})).status === 400, '确认账号输错不能删');
    check((await post({...request,uid:'different'})).status === 409, '确认凭据绑定目标 UID');
    check((await post({...request,ticket:'forged'})).status === 409, '伪造确认凭据无效');
    const data = Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(preview.ticket.split('.')[0],'base64url')),expires:Date.now()-1})).toString('base64url');
    const expired = `${data}.${crypto.createHmac('sha256',f.env.T_TRAINING_AUTH_SECRET).update(data).digest('base64url')}`;
    check((await post({...request,ticket:expired})).status === 409, '过期确认不能删除');
    await upsertProfile(f.env,'teacher',{name:'已修改资料',email:'teacher@example.invalid',phone:'13900000000',school:'演示学校'});
    check((await post(request)).status === 409,'预览后账号资料变化须重新核对');
    request.ticket = (await post({action:'previewDeleteUser',uid:'teacher'})).ticket;
    await f.seed('works','keep',{uid:'teacher',content:'虚构作品'});
    const blocked = await post({action:'previewDeleteUser',uid:'teacher'});
    check(blocked.blocked && blocked.content.works === 1 && !blocked.ticket, '有备课本只展示数量，不给删除凭据');
    check(!JSON.stringify(blocked).includes('虚构作品'), '预览不返回作品正文');
    check((await post(request)).code === 'ACCOUNT_HAS_CONTENT', '预览后新增作品会阻止删除');
    check((await getDocument(f.env,'works','keep')).content === '虚构作品', '被阻止后作品完整');
    await deleteDocument(f.env,'works','keep');
    for (const [collection,field,label] of [['community_prompts','authorId','posts'],['future_owned','userId','other']]) {
        await f.seed(collection,'keep',{[field]:'teacher'});
        const result = await post({action:'previewDeleteUser',uid:'teacher'});
        check(result.blocked && result.content[label] === 1,'投稿或其他关联内容受保护');
        await deleteDocument(f.env,collection,'keep');
    }
    await f.seed('users','teacher',{name:'旧导入资料'});
    await f.seed('contact_messages','history',{userId:'teacher',message:'历史留言'});
    await f.seed('analytics_events','history',{uid:'teacher',action:'page_view'});
    const actionToken = 'a'.repeat(48), actionHash = crypto.createHash('sha256').update(actionToken).digest('hex');
    await f.seedAction(actionHash,'teacher');
    const fresh = await post({action:'previewDeleteUser',uid:'teacher'});
    const deletion = {...request,ticket:fresh.ticket};
    await f.setDeleteFailure(true);
    check((await post(deletion)).status === 500,'删除中途失败返回错误');
    check(await findUserByUid(f.env,'teacher'),'失败后账号还在');
    check(await readLocalAccessToken(f.env,f.teacherToken),'失败后原登录仍可用');
    check(await readAuthActionToken(f.env,actionToken,'verify_email'),'失败后邮件令牌还在');
    check(await getDocument(f.env,'users','teacher'),'失败后导入资料还在');
    check((await getPool(f.env).execute('SELECT uid FROM user_profiles WHERE uid = ?', ['teacher']))[0].length === 1,'失败后个人资料还在');
    await f.setDeleteFailure(false);
    const result = await post(deletion);
    check(result.ok && result.deleted && result.uid === 'teacher','明确确认后删除空账号');
    check(!await findUserByUid(f.env,'teacher'),'腾讯账号已删除');
    check((await getPool(f.env).execute('SELECT uid FROM user_profiles WHERE uid = ?', ['teacher']))[0].length === 0,'个人资料及手机号已清除');
    check(!await readLocalAccessToken(f.env,f.teacherToken),'旧登录立即失效');
    check(!await readAuthActionToken(f.env,actionToken,'verify_email'),'旧邮件操作链接失效');
    check(!await getDocument(f.env,'users','teacher'),'旧导入资料副本已清除');
    check(await getDocument(f.env,'contact_messages','history'),'历史留言按说明保留');
    check(await getDocument(f.env,'analytics_events','history'),'历史事件按说明保留');
    check((await post(deletion)).status === 404,'重复删除不报告虚假成功');
    await assert.rejects(()=>upsertFirebaseAccount(f.env,{localId:'teacher',email:'teacher@example.invalid'}),{code:'ACCOUNT_DELETED'}); checks++;
    await assert.rejects(()=>upsertDocument(f.env,'works','late',{uid:'teacher',content:'延迟保存'}),{code:'INVALID_ID_TOKEN'}); checks++;
    check(!await getDocument(f.env,'works','late'),'已删除账号的在途保存不会产生无主作品');
    // Simulated Firebase replies exercise both migration entry points; no network.
    globalThis.fetch = async url => {
        if(String(url).includes('securetoken.googleapis.com')) return Response.json({id_token:'legacy-token',refresh_token:'legacy-refresh',user_id:'teacher'});
        if(String(url).includes('accounts:lookup')) return Response.json({users:[{localId:'teacher',email:'teacher@example.invalid'}]});
        if(String(url).includes('accounts:signInWithPassword')) return Response.json({localId:'teacher',email:'teacher@example.invalid'});
        throw new Error('未模拟的外部调用');
    };
    check((await post({action:'login',email:'teacher@example.invalid',password:'old-password'},'',authPost)).code === 'ACCOUNT_DELETED','旧密码不能通过 Firebase 恢复账号');
    check((await post({action:'refresh',refreshToken:'legacy-refresh'},'',authPost)).code === 'ACCOUNT_DELETED','旧 Firebase 刷新令牌不能恢复账号');
    globalThis.fetch = async () => { throw new Error('注册和正常登录不得调用 Firebase'); };
    const registered = await post({action:'register',email:'teacher@example.invalid',password:'new-password',profile:{name:'重新注册教师'},consent:{accepted:true,version:globalThis.PrivacyPolicy.VERSION}},'',authPost);
    check(registered.ok && registered.user.uid !== 'teacher','同邮箱重新注册获得新 UID');
    check((await post({action:'login',email:'teacher@example.invalid',password:'new-password'},'',authPost)).ok,'重新注册后正常密码登录');
    check(!(await post({action:'login',email:'teacher@example.invalid',password:'old-password'},'',authPost)).ok,'旧密码不能登录新账号');
    await assert.rejects(()=>upsertFirebaseAccount(f.env,{localId:'teacher',email:'teacher@example.invalid'}),{code:'ACCOUNT_DELETED'}); checks++;
    check((await findUserByUid(f.env,registered.user.uid)).name === '重新注册教师','旧迁移尝试不能覆盖新账号资料');
    globalThis.fetch = async url => {
        if (String(url).includes('accounts:resetPassword') || String(url).includes('accounts:update')) return Response.json({email:'teacher@example.invalid'});
        throw new Error('未模拟的外部调用');
    };
    for (const mode of ['resetPassword','verifyEmail']) {
        const result = await post({action:'complete-email-action',mode,oobCode:'old-link-fixture',newPassword:mode==='resetPassword'?'unsafe-password':''},'',authPost);
        check(result.code === 'INVALID_OOB_CODE','旧 Firebase 邮件链接不能修改同邮箱新账号');
    }
    globalThis.fetch = async () => { throw new Error('禁止外部请求'); };
    check((await post({action:'login',email:'teacher@example.invalid',password:'new-password'},'',authPost)).ok,'旧邮件操作后新账号密码仍有效');
    const legacy = await upsertFirebaseAccount(f.env,{localId:'untouched-legacy',email:'untouched@example.invalid'},{name:'未删除的旧用户'});
    check(legacy.uid === 'untouched-legacy','其他旧账号首次迁移保持可用');
    const concurrentPreview = await post({action:'previewDeleteUser',uid:registered.user.uid});
    const [concurrentDelete, concurrentSave] = await Promise.allSettled([
        post({action:'deleteUser',uid:registered.user.uid,ticket:concurrentPreview.ticket,confirmation:concurrentPreview.confirmation}),
        upsertDocument(f.env,'works','concurrent-work',{uid:registered.user.uid,content:'同时保存的虚构作品'})
    ]);
    check(concurrentDelete.status==='fulfilled' && ((concurrentDelete.value.deleted && concurrentSave.status==='rejected')
        || (concurrentDelete.value.code==='ACCOUNT_HAS_CONTENT' && concurrentSave.status==='fulfilled')), '同时保存与删除只允许安全的一方成功');
    const survivingWork = await getDocument(f.env,'works','concurrent-work');
    check(!survivingWork || await findUserByUid(f.env,registered.user.uid),'并发后没有无主作品');
    check(await readLocalAccessToken(f.env,f.token),'管理员原登录保持可用');
    console.log(`账号删除检查通过：${checks} 项（${f.realDatabase?'独立真实 MariaDB':'模拟数据库'}，无真实邮件或外部模型）。`);
} finally { globalThis.fetch = originalFetch; await f.cleanup?.(); }
