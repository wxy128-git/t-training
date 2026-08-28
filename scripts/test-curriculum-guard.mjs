#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = {};
vm.runInNewContext(readFileSync(join(root, 'js/curriculum-guard.js'), 'utf8'), sandbox);
const guard = sandbox.CurriculumGuard;
const failures = [];

function assert(condition, message) {
    if (!condition) failures.push(message);
}

let result = guard.analyze({ subject: '数学', grade: '初中九年级', text: '二次函数的图像与性质' });
assert(result.status === 'aligned' && result.ok, '九年级数学二次函数应当匹配');

result = guard.analyze({ subject: '语文', grade: '小学一年级', text: '二次函数的图像与性质' });
assert(result.status === 'conflict' && !result.ok, '小学语文二次函数应同时识别学科和年级冲突');

result = guard.analyze({ subject: '物理', grade: '小学五年级', text: '简单电路' });
assert(result.status === 'conflict', '小学阶段不应把物理作为独立学科放行');

result = guard.analyze({ grade: '小学五年级', text: '植物的光合作用' });
assert(result.status === 'aligned' && result.detectedSubjects.includes('科学'), '小学光合作用应识别为科学');

result = guard.analyze({ grade: '初中七年级', text: '植物的光合作用' });
assert(result.status === 'aligned' && result.detectedSubjects.includes('生物'), '初中光合作用应识别为生物');

result = guard.analyze({ subject: '数学', grade: '初中七年级', text: '植物的光合作用' });
assert(result.status === 'conflict', '光合作用不应在数学学科下放行');

result = guard.analyze({ subject: '数学', grade: '高中一年级', text: '复习一元一次方程' });
assert(result.status === 'aligned', '高年级复习低年级知识应允许通过');

result = guard.analyze({ grade: '初中七年级', text: '欧姆定律' });
assert(result.status === 'unknown', '没有主学科且处于课程落点空档时不应猜测放行');

result = guard.analyze({ subject: '数学', grade: '初中九年级', text: '比较二次函数和鸦片战争' });
assert(result.status === 'ambiguous' && !result.ok, '同一输入混入多个学科应标为 ambiguous');

result = guard.analyze({ subject: '语文', grade: '小学三年级', text: '本校自编的春日阅读课' });
assert(result.status === 'unknown' && !result.ok, '未收录内容必须返回 unknown，不能默认放行');

result = guard.analyze({ subject: '数学', grade: '', text: '' });
assert(result.status === 'unknown' && !result.ok, '缺少知识点时必须停止而非通过');

assert(guard.gradeLevel('初中七年级') === 7 && guard.gradeLevel('七年级') === 7, '年级标准化应兼容常见写法');
assert(guard.GUARDED_AGENT_IDS.includes('quiz-gen') && guard.GUARDED_AGENT_IDS.includes('lesson-design'), '关键知识型智能体必须纳入硬闸门');

if (failures.length) {
    console.error(`课程匹配守卫测试失败（${failures.length} 项）：`);
    failures.forEach(item => console.error(`- ${item}`));
    process.exit(1);
}

console.log('课程匹配守卫测试通过：13 个核心场景，覆盖匹配、冲突、歧义和未知四种状态。');
