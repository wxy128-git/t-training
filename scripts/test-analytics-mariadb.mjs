#!/usr/bin/env node
import {savePrivacy,readPrivacy,onRequestPost as privacyPost} from '../server/local-privacy.mjs';
import {onRequestPost as registerPost} from '../server/local-auth-proxy.mjs';
import {expireAnalytics} from '../server/analytics-retention.mjs';
// Explicit opt-in integration test; never reads production .env files.
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
import { cleanAnalytics, PERSONAL_FIELDS } from './clean-analytics-personal-fields.mjs';
import { getPool, issueLocalSession, upsertProfile } from '../server/local-auth-store.mjs';
import { upsertDocument, listDocuments, encodeFields } from '../server/local-firestore-store.mjs';
import { onRequestPost } from '../server/local-analytics.mjs';

if (process.env.ANALYTICS_TEST_DB_ALLOW_CREATE !== 'yes' || !process.env.ANALYTICS_TEST_DB_PORT || !process.env.ANALYTICS_TEST_DB_USER) {
    throw new Error('仅供独立本机测试数据库：必须显式设置 ANALYTICS_TEST_DB_ALLOW_CREATE=yes、PORT、USER、PASSWORD；不读取生产配置。');
}
const database = `analytics_privacy_test_${randomUUID().replaceAll('-','')}`;
const config = {host:'127.0.0.1',port:Number(process.env.ANALYTICS_TEST_DB_PORT),user:process.env.ANALYTICS_TEST_DB_USER,
    password:process.env.ANALYTICS_TEST_DB_PASSWORD || ''};
const admin = await mysql.createConnection(config);
let pool, env;
const temporary = await mkdtemp(join(tmpdir(),'analytics-privacy-test-'));
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw new Error('测试禁止外部网络请求');};
let checks=0;
function check(value,message){assert.ok(value,message);checks++;}
try {
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    pool=mysql.createPool({...config,database,connectionLimit:2});
    const schema=await readFile(new URL('../migration/schema.sql',import.meta.url),'utf8');
    for(const part of schema.slice(schema.indexOf('CREATE TABLE')).split(';').map(s=>s.trim()).filter(Boolean)) await pool.query(part);
    await pool.query('ALTER TABLE user_profiles DROP COLUMN privacy_json');
    env={T_TRAINING_REGISTRATION_BACKEND:'local',T_TRAINING_EMAIL_BACKEND:'local',T_TRAINING_DB_HOST:'127.0.0.1',T_TRAINING_DB_PORT:config.port,T_TRAINING_DB_NAME:database,
        T_TRAINING_DB_USER:config.user,T_TRAINING_DB_PASSWORD:config.password,T_TRAINING_AUTH_SECRET:'isolated-analytics-test-secret-00000000000000000'};
    const adminUid='MCUSTieySYczODKB9hkERtyvtZG2';
    for (const uid of [adminUid,'teacher']) {
        await pool.execute('INSERT INTO auth_users (uid,email,email_verified,display_name,raw_json) VALUES (?,?,1,?,?)',[uid,`${uid}@example.invalid`,'虚构教师','{}']);
        await pool.execute('INSERT INTO user_profiles (uid,name,school,raw_json) VALUES (?,?,?,?)',[uid,'虚构教师','虚构学校','{}']);
    }
    const [oldProfiles]=await pool.query('SELECT * FROM user_profiles ORDER BY uid');
    const migration=await readFile(new URL('../migration/2026-09-29-privacy.sql',import.meta.url),'utf8');
    await pool.query(migration);
    await pool.query(migration);
    const [migratedProfiles]=await pool.query('SELECT * FROM user_profiles ORDER BY uid');
    check(migratedProfiles.every(row=>row.privacy_json===null),'升级旧表不替旧用户补填同意');
    assert.deepEqual(migratedProfiles.map(({privacy_json,...row})=>row),oldProfiles);checks++;
    const choice={accepted:true,version:globalThis.PrivacyPolicy.VERSION};
    const invoke=async(handler,path,body)=>{
        const response=await handler({env,request:new Request(`http://127.0.0.1/api/${path}`,{method:'POST',body:JSON.stringify(body)})});
        return {status:response.status,body:await response.json()};
    };
    const registration={action:'register',email:'policy-test@example.invalid',password:'local-test-only-12345',profile:{name:'虚构注册教师'}};
    check((await invoke(registerPost,'auth-proxy',registration)).status===400,'未同意不能注册');
    const [[rejected]]=await pool.execute('SELECT COUNT(*) AS n FROM auth_users WHERE email=?',[registration.email]);
    check(rejected.n===0,'被拒注册不创建账号');
    const start=Date.now();
    const registered=await invoke(registerPost,'auth-proxy',{...registration,consent:{...choice,acceptedAt:'1900-01-01'}});
    check(registered.status===200&&registered.body.authBackend==='local','本地注册成功且不调用 Firebase');
    const newUid=registered.body.user.uid,newToken=registered.body.idToken;
    const savedConsent=await readPrivacy(env,newUid);
    check(savedConsent.version===choice.version&&savedConsent.research===false&&Date.parse(savedConsent.acceptedAt)>=start&&Date.parse(savedConsent.acceptedAt)<=Date.now(),'注册同时保存政策版本及服务器时间，研究关闭');
    const privacyCall=body=>invoke(privacyPost,'privacy',body);
    check((await privacyCall({action:'get',idToken:'invalid'})).status===401,'无效凭证不能读取政策记录');
    check((await privacyCall({action:'get',idToken:newToken})).body.privacy.acceptedAt===savedConsent.acceptedAt,'用户可读取自己的确认记录');
    const repeated=await Promise.all([1,2].map(()=>privacyCall({action:'save',idToken:newToken,uid:adminUid,choice:{...choice,acceptedAt:'1900'}})));
    check(repeated.every(result=>result.status===200&&result.body.privacy.acceptedAt===savedConsent.acceptedAt),'并发重复确认保留首次时间');
    check(await readPrivacy(env,adminUid)===null,'伪造他人 UID 不能修改他人记录');
    const beforeRejected=await readPrivacy(env,newUid);
    check((await privacyCall({action:'save',idToken:newToken,choice:{...choice,research:true}})).status===400,'拒绝开启研究采集');
    assert.deepEqual(await readPrivacy(env,newUid),beforeRejected);checks++;
    const beforeProfileUpdate=await readPrivacy(env,newUid);
    await upsertProfile(env,newUid,{name:'修改后的虚构教师',email:registration.email,school:'虚构学校'});
    assert.deepEqual(await readPrivacy(env,newUid),beforeProfileUpdate);checks++;
    await pool.query(`CREATE TRIGGER fail_registration BEFORE INSERT ON user_profiles FOR EACH ROW
        BEGIN IF NEW.email = 'rollback@example.invalid' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'synthetic registration failure'; END IF; END`);
    const failed=await invoke(registerPost,'auth-proxy',{...registration,email:'rollback@example.invalid',consent:choice});
    check(failed.status>=400,'资料写入故障使注册失败');
    const [[rollback]]=await pool.query("SELECT COUNT(*) AS n FROM auth_users WHERE email='rollback@example.invalid'");
    check(rollback.n===0,'资料写入失败时整个账号创建撤回');
    await pool.query('DROP TRIGGER fail_registration');
    await pool.execute('UPDATE user_profiles SET privacy_json=? WHERE uid=?',[JSON.stringify(globalThis.PrivacyPolicy.update(null,{...choice,research:false})),'teacher']);
    const teacherToken=(await issueLocalSession(env,'teacher')).idToken;
    const adminToken=(await issueLocalSession(env,adminUid)).idToken;
    const post=async body => {
        const response=await onRequestPost({env,request:new Request('http://127.0.0.1/api/analytics',{method:'POST',body:JSON.stringify(body)})});
        return {status:response.status,body:await response.json()};
    };
    const raw={action:'agent_run',targetId:'lesson-design',path:'/agents?topic=不要保存',feature:'agents',
        visitorId:`v_${randomUUID()}`,sessionId:`s_${randomUUID()}`,user:{uid:'fake',name:'不要保存',email:'不要保存',phone:'不要保存',school:'不要保存'},
        meta:{durationMs:1200,subject:'不要保存',input:'不要保存',output:'不要保存'}};
    await savePrivacy(env,'teacher',{accepted:false,version:globalThis.PrivacyPolicy.VERSION,research:false});
    check((await post({action:'track',idToken:teacherToken,event:raw})).body.recorded===false,'撤回后真实数据库拒绝采集');
    await savePrivacy(env,'teacher',{accepted:true,version:globalThis.PrivacyPolicy.VERSION,research:false,acceptedAt:'1900'});
    check((await readPrivacy(env,'teacher')).acceptedAt !== '1900','同意时间不接受客户端伪造');
    check((await post({action:'track',idToken:teacherToken,event:raw})).body.recorded===false,'政策确认后仍不新增研究事件');
    check((await listDocuments(env,'analytics_events')).length===0,'真实库事件表保持为空');
    // Explicit historical fixture for the phase-one summary/cleanup regression. Not a track API write.
    await upsertDocument(env,'analytics_events','history-fixture',{action:'agent_run',uid:'teacher',day:new Date(Date.now()+8*3600000).toISOString().slice(0,10),ts:new Date().toISOString()});
    let events=await listDocuments(env,'analytics_events');
    check(events.length===1 && events[0].uid==='teacher' && events[0].action==='agent_run','历史夹具结构与 UID 正确');
    check(!JSON.stringify(events).includes('不要保存')&&PERSONAL_FIELDS.every(key=>!Object.hasOwn(events[0],key)),'个人字段和输入正文不落库');
    check((await post({action:'summary',adminIdToken:teacherToken})).status===403,'教师不能查看汇总');
    check((await post({action:'summary'})).status===401,'未登录不能查看汇总');
    let summary=(await post({action:'summary',adminIdToken:adminToken})).body;
    check(summary.users[0].name==='虚构教师'&&summary.users[0].school==='虚构学校','真实用户表关联');
    await pool.execute('UPDATE user_profiles SET name=?, school=? WHERE uid=?',['修改后的虚构教师','修改后的虚构学校','teacher']);
    summary=(await post({action:'summary',adminIdToken:adminToken})).body;
    check(summary.users[0].name==='修改后的虚构教师'&&summary.recent[0].userName==='修改后的虚构教师','实时资料与近期记录一致');
    const retentionNow=new Date(),retentionCutoff=new Date(retentionNow.getTime()-180*86400000);
    await upsertDocument(env,'analytics_events','expired-local',{ts:new Date(retentionCutoff.getTime()-1).toISOString()});
    await upsertDocument(env,'analytics_events','expired-firebase',{ts:new Date(retentionCutoff.getTime()-1)});
    await upsertDocument(env,'analytics_events','boundary',{ts:retentionCutoff.toISOString()});
    check((await expireAnalytics(pool,{now:retentionNow})).count===2,'真实 SQL 识别两种日期格式且保留恰好 180 天');
    check((await expireAnalytics(pool,{now:retentionNow,dryRun:false})).count===2,'真实 SQL 删除两种过期记录');
    await pool.execute("DELETE FROM firestore_documents WHERE collection_name='analytics_events' AND document_id='boundary'");
    // More than one batch, plus fields present only in raw_json and empty/null fields.
    const now=new Date().toISOString(),day=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
    for(let i=0;i<252;i++) await upsertDocument(env,'analytics_events',`history-${String(i).padStart(4,'0')}`,{
        action:'page_view',uid:'teacher',day,ts:now,visitorId:raw.visitorId,sessionId:raw.sessionId,
        userEmail:'old@example.invalid',userPhone:'虚构电话',userName:i===0?'':'历史虚构教师',userSchool:i===1?null:'历史虚构学校'
    });
    await upsertDocument(env,'analytics_events','raw-only',{action:'page_view',uid:'teacher',day,ts:now},
        {raw:{fields:encodeFields({action:'page_view',uid:'teacher',day,ts:now,userName:''})}});
    await upsertDocument(env,'works','untouched',{uid:'teacher',userName:'不应修改其他集合',content:'虚构备课正文'});
    const [before]=await pool.query('SELECT * FROM firestore_documents ORDER BY collection_name,document_id');
    const beforeSummary=(await post({action:'summary',adminIdToken:adminToken})).body;
    const dry=await cleanAnalytics(pool);
    check(dry.scanned===254&&dry.affected===253&&dry.fields.userName===253&&dry.changed===0,'预检查包含空值及仅原始副本的字段');
    const [afterDry]=await pool.query('SELECT * FROM firestore_documents ORDER BY collection_name,document_id');
    assert.deepEqual(afterDry,before);checks++;
    await assert.rejects(()=>cleanAnalytics(pool,{execute:true}),/备份/);checks++;
    await assert.rejects(()=>cleanAnalytics(pool,{execute:true,backupDir:temporary}),/EEXIST/);checks++;
    await assert.rejects(()=>cleanAnalytics(pool,{execute:true,backupDir:join(process.cwd(),'unsafe-backup')}),/项目目录/);checks++;
    const cliEnv={...process.env,ANALYTICS_CLEANUP_DB_HOST:'127.0.0.1',ANALYTICS_CLEANUP_DB_PORT:String(config.port),
        ANALYTICS_CLEANUP_DB_NAME:database,ANALYTICS_CLEANUP_DB_USER:config.user,ANALYTICS_CLEANUP_DB_PASSWORD:config.password};
    const cli=await run(process.execPath,['scripts/clean-analytics-personal-fields.mjs','--dry-run'],{env:cliEnv});
    check(JSON.parse(cli.stdout).affected===253,'命令行预检查报告正确');
    await assert.rejects(()=>run(process.execPath,['scripts/clean-analytics-personal-fields.mjs','--execute'],{env:cliEnv}));checks++;
    await assert.rejects(()=>run(process.execPath,['scripts/clean-analytics-personal-fields.mjs','--dry-run'],{env:{...cliEnv,ANALYTICS_CLEANUP_DB_HOST:'production.invalid'}}));checks++;
    await pool.query(`CREATE TRIGGER fail_cleanup BEFORE UPDATE ON firestore_documents FOR EACH ROW
        BEGIN IF OLD.document_id = 'history-0002' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'synthetic rollback test'; END IF; END`);
    await assert.rejects(()=>cleanAnalytics(pool,{execute:true,backupDir:join(temporary,'rollback'),database}),/synthetic rollback/);checks++;
    const [rolledBack]=await pool.query('SELECT * FROM firestore_documents ORDER BY collection_name,document_id');
    assert.deepEqual(rolledBack,before);checks++;
    check(JSON.parse(await readFile(join(temporary,'rollback','manifest.json'),'utf8')).status==='backup-verified','首次修改之前已有完整备份');
    await pool.query('DROP TRIGGER fail_cleanup');
    const backup=join(temporary,'verified-backup');
    const cleaned=JSON.parse((await run(process.execPath,['scripts/clean-analytics-personal-fields.mjs','--execute','--backup-dir',backup],{env:cliEnv})).stdout);
    check(cleaned.changed===253&&cleaned.remaining===0,'跨批次真实清理完成');
    const saved=(await readFile(join(backup,'analytics-events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
    assert.deepEqual(saved,before.filter(row=>row.collection_name==='analytics_events').map(row=>JSON.parse(JSON.stringify(row))));checks++;
    check(JSON.parse(await readFile(join(backup,'manifest.json'),'utf8')).status==='backup-verified','备份核验清单完整');
    const [after]=await pool.query('SELECT * FROM firestore_documents ORDER BY collection_name,document_id');
    for(let i=0;i<before.length;i++) {
        const expected={...before[i]};
        if(expected.collection_name==='analytics_events') {
            const fields=JSON.parse(expected.fields_json),rawRecord=JSON.parse(expected.raw_json);
            for(const key of PERSONAL_FIELDS){delete fields[key];delete rawRecord.fields?.[key];}
            expected.fields_json=JSON.stringify(fields);expected.raw_json=JSON.stringify(rawRecord);
        }
        assert.deepEqual(after[i],expected);
    }
    checks++;
    assert.deepEqual((await post({action:'summary',adminIdToken:adminToken})).body,beforeSummary);checks++;
    check((await cleanAnalytics(pool)).affected===0,'再次检查无残留');
    check((await cleanAnalytics(pool,{execute:true,backupDir:join(temporary,'repeat'),database})).changed===0,'重复执行安全');
    // Invalid legacy data aborts without deleting anything.
    await pool.execute("INSERT INTO firestore_documents (collection_name,document_id,document_name,fields_json,raw_json) VALUES ('analytics_events','broken','broken','invalid','{}')");
    await assert.rejects(()=>cleanAnalytics(pool,{execute:true,backupDir:join(temporary,'invalid'),database}),/无效数据/);checks++;
    const [remaining]=await pool.query("SELECT fields_json FROM firestore_documents WHERE collection_name='analytics_events' AND document_id='broken'");
    check(remaining[0].fields_json==='invalid','无效记录保持原样');
    const [version]=await pool.query('SELECT VERSION() AS version');
    console.log(`MariaDB ${version[0].version} 真实数据库验证通过：${checks} 项检查；测试库和虚构备份将在退出前删除。`);
} finally {
    globalThis.fetch=originalFetch;
    if(env) await getPool(env).end();
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await admin.end();
    await rm(temporary,{recursive:true,force:true});
}
