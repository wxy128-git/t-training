// Offline integration checks: no real accounts, model requests or production writes.
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import vm from 'node:vm';
const read = path => readFileSync(new URL('../'+path, import.meta.url), 'utf8');
let passed = 0;
const check = (value, message) => { assert.ok(value, message); passed++; };
const ctx = vm.createContext({console, Date});
ctx.window = ctx;
for (const file of ['agents-data','task-search','site-copy','curriculum-guard','analytics-policy','operations-policy']) {
    vm.runInContext(read(`js/${file}.js`), ctx);
}
const agent = ctx.AGENTS.find(a => a.id === 'preschool-story');
check(agent?.type === 'form' && ctx.AGENT_CATS.some(c => c.key === agent.cat), 'story is a discoverable form in an existing department');
check(ctx.AGENTS.length === new Set(ctx.AGENTS.map(a => a.id)).size, 'agent identifiers remain unique');
check(agent.fields.filter(f => f.required).map(f => f.key).join(',') === 'grade,elements', 'only age group and story elements are required');
check(!agent.system.includes('未提供的信息写“尚不清楚”'), 'fictional stories do not inherit the real-classroom evidence rule');
check(ctx.AGENTS.find(a => a.id === 'lesson-design').system.includes('不得补造学生表现'), 'evidence rule still applies to existing teaching agents');
for (const word of ['幼儿故事','小班','中班','大班','落叶','小熊','绘本','故事配图']) {
    check(ctx.TaskSearch.score(agent, word) > 0, `search finds story by ${word}`);
}
check(existsSync(new URL('../assets/agent-portraits/preschool-story.jpg', import.meta.url)), 'dedicated portrait exists');
const page = read('agents.html');
const sourceFunction = (source, name) => {
    const result = source.match(new RegExp('^(?:async )?function '+name+'\\([^\\n]*\\) \\{\\n[\\s\\S]*?^\\}', 'm'));
    assert.ok(result, `function ${name} exists`);
    return result[0];
};
vm.runInContext(page.slice(page.indexOf('const CURRICULUM_VALIDATION'), page.indexOf('const HANDWRITING_ASSIST')), ctx);
for (const name of ['curriculumGuard','buildUserPrompt','curriculumContext','cleanWorkTitlePart','pickInput','markdownHeading','compactWorkTitle','buildWorkTitle','workbookInputs','callAgentAPI']) {
    vm.runInContext(sourceFunction(page, name), ctx);
}
vm.runInContext(page.slice(page.indexOf('const AGENT_BRIEF_PRIMARY_KEYS'), page.indexOf('function agentRunLabel')), ctx);
check(ctx.briefFieldGroups(agent).primary.map(f => f.key).join(',') === 'grade,elements', 'age and elements are visible together at the start');
check(ctx.briefFieldGroups(agent).extra.every(f => !f.required), 'all optional fields can stay collapsed');
ctx._resultFeedback = '';
ctx._sourceWork = null;
const payloads = [];
ctx.Auth = {getIdToken: async () => 'offline-teacher-token'};
ctx.AgentStream = {request: async ({payload}) => {payloads.push(payload); return '# 叶子的小床\n\n故事正文';}};
for (const [index, grade] of agent.fields.find(f => f.key === 'grade').options.entries()) {
    const inputs = {grade, elements: index === 0 ? '落叶' : '落叶、小熊\n小雨滴', meaning:'接纳变化', style:'柔和彩铅绘本'};
    const prompt = ctx.buildUserPrompt(agent, inputs);
    check(prompt.includes(grade) && prompt.includes(inputs.elements) && prompt.includes(inputs.style), `${grade}: prompt retains age, all elements and style`);
    check(!prompt.includes('中小学教学实际') && !ctx.curriculumContext(agent, inputs), `${grade}: preschool creation avoids the K–12 classifier`);
    check(prompt.includes('小班4幅、中班5幅、大班6幅'), `${grade}: storyboard count contract is included`);
    const result = await ctx.callAgentAPI({agent, inputs, onToken(){}});
    const payload = payloads.at(-1);
    check(result.includes('叶子的小床') && payload.agentId === agent.id && payload.curriculum === null, `${grade}: existing generation pipeline carries the new agent`);
    check(payload.messages[0].content === agent.system && payload.messages[1].content === prompt, `${grade}: system and task reach the request intact`);
    const title = ctx.buildWorkTitle(agent, inputs, '# 叶子的小床\n\n故事正文');
    check(title.includes(ctx.cleanWorkTitlePart(grade)) && title.includes('叶子的小床') && title.includes('幼儿故事'), `${grade}: workbook title includes audience and story name`);
    const saved = ctx.workbookInputs(inputs);
    check(saved.grade === grade && saved.elements === inputs.elements && saved.style === inputs.style, `${grade}: workbook retains creation inputs`);
    const resumed = ctx.buildUserPrompt(agent, saved);
    check(resumed.includes(grade) && resumed.includes(inputs.elements), `${grade}: workbook inputs can be reused for an explicit revision`);
}
for (const action of ['agent_open','agent_run','generation_failed','workbook_save']) {
    const normalized = ctx.OperationsPolicy.normalize({action, targetId:agent.id, meta:{input:'私密故事要素',durationMs:100}}, true);
    check(normalized.targetId === agent.id && !JSON.stringify(normalized).includes('私密故事要素'), `${action}: fixed counter supports story without recording text`);
}
const oldCopy = ctx.SiteCopy.normalize('agents', {teamIndexSummary:'5 个教研部门 · 19 位成员可协作',allMembersAction:'查看全部 19 位成员'});
check(oldCopy.teamIndexSummary.includes('20') && oldCopy.allMembersAction.includes('20'), 'untouched member counts migrate');
const customCopy = ctx.SiteCopy.normalize('agents', {teamIndexSummary:'园本教研团队',allMembersAction:'浏览我们的伙伴'});
check(customCopy.teamIndexSummary === '园本教研团队' && customCopy.allMembersAction === '浏览我们的伙伴', 'administrator custom copy remains unchanged');
vm.runInContext(sourceFunction(page, 'copyStoryImagePrompt'), ctx);
let copied = '', notice = '';
ctx._activeGeneration = null;
ctx.navigator = {clipboard:{writeText:async text=>{copied=text;}}};
ctx.showToast = text => {notice=text;};
const promptButton = {closest:()=>({querySelector:()=>({textContent:'  本幅完整的角色与动作描述  '})})};
await ctx.copyStoryImagePrompt(promptButton);
check(copied === '本幅完整的角色与动作描述', 'individual copy contains only that image prompt');
ctx._activeGeneration = {};
copied = '';
await ctx.copyStoryImagePrompt(promptButton);
check(!copied && notice.includes('等待生成完成'), 'unfinished image prompts cannot be copied as complete');
ctx._activeGeneration = null;
ctx.navigator.clipboard.writeText = async()=>{throw new Error('clipboard unavailable');};
await ctx.copyStoryImagePrompt(promptButton);
check(notice.includes('手动复制'), 'clipboard failure has a usable fallback');
ctx.navigator.clipboard.writeText = async()=>{throw new Error('must not copy an empty prompt');};
notice = '';
await ctx.copyStoryImagePrompt({closest:()=>null});
check(!notice, 'missing prompt block is ignored safely');
console.log(`幼儿故事离线集成检查通过：${passed} 项。真实模型内容质量需另行验收。`);
