#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = { window: {} };
vm.runInNewContext(readFileSync(join(root, 'js/textbook-catalog.js'), 'utf8'), sandbox);
const catalog = sandbox.window.TextbookCatalog;
const failures = [];

function assert(condition, message) {
    if (!condition) failures.push(message);
}

let result = catalog.analyze({ subject: '物理', grade: '小学一年级', text: '声音的产生', mode: 'custom' });
assert(!result.ok && result.status === 'conflict', '小学一年级物理应当被拦截');

result = catalog.analyze({ subject: '数学', grade: '小学一年级', text: '二次函数', mode: 'custom' });
assert(!result.ok && result.status === 'conflict', '小学一年级二次函数应当被拦截');

result = catalog.analyze({ subject: '语文', grade: '初中九年级', text: '化学方程式', mode: 'custom' });
assert(!result.ok && result.status === 'conflict', '语文学科与化学方程式应当被拦截');

result = catalog.analyze({ subject: '数学', grade: '初中九年级', text: '比较二次函数与化学方程式', mode: 'custom' });
assert(!result.ok && result.status === 'conflict', '同一输入中混入其他学科内容也应当被拦截');

result = catalog.analyze({ subject: '化学', grade: '初中九年级', text: '化学方程式', mode: 'textbook', edition: 'renjiao', volume: '上册' });
assert(result.ok && result.status === 'aligned', '九年级人教版化学方程式应对齐课程范围');

result = catalog.analyze({ subject: '语文', grade: '小学三年级', text: '某校本阅读课', mode: 'textbook', edition: 'tongbian-renjiao', volume: '上册' });
assert(!result.ok && result.status === 'needs_confirmation', '未收录课题在教材模式下应要求人工确认');

result = catalog.analyze({ subject: '语文', grade: '小学三年级', text: '某校本阅读课', mode: 'textbook', edition: 'tongbian-renjiao', volume: '上册', confirmed: true });
assert(result.ok && result.status === 'confirmed', '人工确认后应当允许继续');

result = catalog.analyze({ subject: '语文', grade: '小学三年级', text: '校本阅读课', mode: 'custom' });
assert(result.ok && result.status === 'custom', '非教材主题应当允许未收录的合理主题');

const mathEditions = catalog.getEditions('数学', '小学三年级').map(item => item.label);
const chemistryEditions = catalog.getEditions('化学', '初中九年级').map(item => item.label);
assert(mathEditions.includes('北师大版') && chemistryEditions.includes('科粤版'), '学科与学段应返回不同教材版本');

if (failures.length) {
    console.error(`教材校验测试失败（${failures.length} 项）：`);
    failures.forEach(item => console.error(`- ${item}`));
    process.exit(1);
}

console.log(`教材校验测试通过：8 个核心场景，数学 ${mathEditions.length} 个版本，化学 ${chemistryEditions.length} 个版本。`);
