#!/usr/bin/env node
import assert from 'node:assert/strict';
const { adminFixture } = await import(process.env.ADMIN_TEST_ALLOW_CREATE === 'yes' ? './fixtures/admin-mariadb.mjs' : './fixtures/admin-store.mjs');
import { onRequestGet, onRequestPost } from '../server/local-content.mjs';
import { onRequestPost as usersPost } from '../server/local-admin-users.mjs';
import { getDocument, listDocuments } from '../server/local-firestore-store.mjs';
const f = await adminFixture();
globalThis.window = globalThis;
await import('../js/site-copy.js');
const researchDefaults = SiteCopy.defaults('research');
globalThis.fetch = async () => { throw new Error('禁止外部请求'); };
let checks = 0;
function check(value, message) { assert.ok(value, message); checks++; }
const get = async (type, scope = 'admin', token = f.token) => {
    const response = await onRequestGet({ env: f.env, request: new Request(`http://localhost/api/content?type=${type}&scope=${scope}`, { headers: { Authorization: `Bearer ${token}` } }) });
    return { status: response.status, headers: response.headers, ...await response.json() };
};
const post = async (body, token = f.token, handler = onRequestPost) => {
    const response = await handler({ env: f.env, request: new Request('http://localhost/api/content', { method: 'POST', body: JSON.stringify({ idToken: token, adminIdToken: token, ...body }) }) });
    return { status: response.status, ...await response.json() };
};
try {
const researchCopy = async () => {
    const response = await onRequestGet({ env: f.env, request: new Request('http://localhost/api/content?type=pageCopy&id=research') });
    return { status: response.status, headers: response.headers, ...await response.json() };
};
check((await researchCopy()).item === null, '科研文案尚未初始化可读取默认状态');
check((await post({ action: 'savePageCopy', id: 'research', fields: { heroTitle: '虚构科研标题' } }, f.teacherToken)).status === 403, '普通教师不能修改科研文案');
check((await post({ action: 'savePageCopy', id: 'research', fields: {} }, 'invalid')).status === 401, '未登录不能修改科研文案');
check((await post({ action: 'savePageCopy', id: 'unknown', fields: {} })).status === 400, '未知页面编号不能保存');
check((await post({ action: 'savePageCopy', id: 'research', fields: { ...researchDefaults, heroTitle: '虚构科研标题', funnelRole: '问题伙伴' } })).ok, '管理员可保存科研文案');
let copy = await researchCopy();
check(copy.status === 200 && copy.item.fields.heroTitle === '虚构科研标题' && copy.item.fields.funnelRole === '问题伙伴', '保存后的科研文案可公开读取');
check(Object.keys(copy.item.fields).length === 40 && copy.item.fields.generateAction === researchDefaults.generateAction, '科研 40 项字段完整保存，没有截断');
check(copy.headers.get('cache-control') === 'no-store', '科研文案禁止旧缓存');
check((await post({ action: 'savePageCopy', id: 'research', fields: { heroTitle: '修改后的虚构标题' } })).ok && (await researchCopy()).item.fields.heroTitle === '修改后的虚构标题', '再次保存后立即读取最新文案');
await f.seed('contact_messages', 'm', { message: '虚构留言原文', contact: 'fixture@example.invalid', name: '演示', createdAt: '2026-01-01', handled: false });
await f.seed('announcements', 'a', { title: '旧公告', content: '内容', createdAt: '2026-01-01' });
check((await post({ action: 'updateMessage', id: 'm', data: { handled: true, message: '不应写入' } })).ok, '可以标记留言');
let item = await getDocument(f.env, 'contact_messages', 'm');
check(item.handled && item.message === '虚构留言原文' && item.contact === 'fixture@example.invalid', '只改状态，原文和联系方式保留');
check((await post({ action: 'updateMessage', id: 'm', data: { handled: 'true' } })).status === 400, '无效状态拒绝');
check((await post({ action: 'updateMessage', id: 'missing', data: { handled: true } })).status === 404, '不存在的留言不重新创建');
await post({ action: 'updateAnnouncement', id: 'a', title: '新公告', content: '新内容' });
check((await getDocument(f.env, 'announcements', 'a')).createdAt === '2026-01-01', '公告保留发布时间');
let baseline = await get('tools');
const items = Array.from({ length: 301 }, (_, i) => ({ id: `tool-${i}`, name: `工具${i}`, order: i }));
let saved = await post({ action: 'replaceCollection', type: 'tools', items, revision: baseline.revision });
check(saved.ok && (await listDocuments(f.env, 'tools')).length === 301, '301 条完整保存');
check((await post({ action: 'replaceCollection', type: 'tools', items: [], revision: baseline.revision })).status === 409, '旧版本拒绝覆盖');
check((await post({ action: 'replaceCollection', type: 'tools', items: [] })).status === 409, '缺少版本拒绝写入');
for (const invalid of [undefined, [{ id: 'bad/id' }], [{ id: 'x' }, { id: 'x' }], Array(2001).fill({ id: 'x' })]) {
    check((await post({ action: 'replaceCollection', type: 'tools', items: invalid, revision: saved.revision })).status === 400, '非法列表整批拒绝');
}
check((await listDocuments(f.env, 'tools')).length === 301, '非法保存未删除已有数据');
await f.setWriteFailure('broken');
check((await post({ action: 'replaceCollection', type: 'tools', items: [{ id: 'new' }, { id: 'broken' }], revision: saved.revision })).status === 500, '中途写入失败上报');
check(!(await getDocument(f.env, 'tools', 'new')) && (await listDocuments(f.env, 'tools')).length === 301, '失败全部回滚');
await f.setWriteFailure('');
const concurrent = await Promise.all(['one', 'two'].map(id => post({ action: 'replaceCollection', type: 'tools', items: [{ id }], revision: saved.revision })));
check(concurrent.filter(r => r.ok).length === 1 && concurrent.some(r => r.status === 409), '同时保存只有一个成功，另一个提示冲突');
await f.seed('resource_categories', 'cat', { title: '分类', items: Array.from({ length: 101 }, (_, i) => ({ name: `素材${i}` })) });
baseline = await get('resources');
check((await post({ action: 'saveResourceCategory', category: baseline.items[0], revision: baseline.revision })).ok, '素材分类保存');
check((await getDocument(f.env, 'resource_categories', 'cat')).items.length === 101, '分类内 101 条不被编码器截断');
check((await post({ action: 'deleteResourceCategory', id: 'cat', revision: 'old' })).status === 409, '分类删除也检查版本');
check((await get('messages', '', f.token)).headers.get('cache-control') === 'no-store', '私人数据禁止缓存');
await f.seed('community_prompts', 'p1', { authorId: 'teacher', status: 'pending' });
await f.seed('community_prompts', 'p2', { authorId: 'other', status: 'approved' });
check((await get('communityPrompts', 'mine', f.teacherToken)).items.length === 1, '个人列表只含本人');
check((await get('communityPrompts', '', f.token)).items.every(i => i.status === 'approved'), '公开列表不受个人缓存污染');
check((await get('messages', 'admin', f.teacherToken)).status === 403, '普通用户不能读后台');
check((await post({ action: 'updateAnnouncement', id: 'a', title: '越权' }, f.teacherToken)).status === 403, '普通用户不能修改');
check((await get('tools', 'admin', 'invalid')).status === 401, '无效登录拒绝');
check((await post({ action: 'listUsers' }, f.token, usersPost)).users.length === 2, '用户列表来自腾讯账号表');
check((await post({ action: 'deleteUser', uid: 'teacher' }, f.token, usersPost)).status === 409, '缺少预览确认不能删除账号');
await f.setReadFailure('tools');
check((await get('tools')).status === 503, '数据库错误不返回假空列表');
await f.setReadFailure('');
if (f.testLock) { await f.testLock(); check(true, '真实数据库命名锁阻止另一个连接并在完成后释放'); }
else check(f.state.commits > 0 && f.state.rollbacks > 0, '提交和回滚均已覆盖');
console.log(`腾讯后台行为检查通过：${checks} 项（${f.realDatabase ? '独立真实 MariaDB 测试库' : '模拟 SQL'}）。`);
} finally { await f.cleanup?.(); }
