#!/usr/bin/env node
// Offline behavioral checks for task selection, form disclosure and contextual help.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
let passed = 0;
function check(value, message) { assert.ok(value, message); passed++; }

const ctx = vm.createContext({console});
ctx.window = ctx;
vm.runInContext(read('js/agents-data.js'), ctx);
vm.runInContext(read('js/task-search.js'), ctx);
for (const agent of ctx.AGENTS) {
    check(ctx.TaskSearch.tasks[agent.id]?.title && ctx.TaskSearch.tasks[agent.id]?.output, agent.id + ': task and deliverable exist');
    check(ctx.TaskSearch.score(agent, agent.name) > 0, agent.id + ': original role name remains searchable');
}
check(ctx.TaskSearch.score({id:'lesson-design',name:'教学设计助手',tagline:'完整教案'}, '备一节课') === 0, 'library search does not add workspace-only task headings');
const page = read('agents.html');
vm.runInContext(page.slice(page.indexOf('function hasDraftInput('), page.indexOf('function persistCurrentDraft')), ctx);
const lesson = ctx.AGENTS.find(a=>a.id==='lesson-design');
check(!ctx.hasDraftInput(lesson,{subject:'语文',grade:'小学一年级',periods:'1 课时'}), 'browsing with default settings is not an unfinished task');
check(ctx.hasDraftInput(lesson,{topic:'识字'}), 'a partially entered topic remains a recoverable draft');
check(ctx.hasDraftInput(ctx.AGENTS.find(a=>a.id==='quiz-gen'),{types:['选择题']}), 'a selected question type counts as entered task content');
vm.runInContext(page.slice(page.indexOf('const AGENT_BRIEF_PRIMARY_KEYS'), page.indexOf('function agentRunLabel')), ctx);
for (const agent of ctx.AGENTS.filter(a => a.type === 'form')) {
    const groups = ctx.briefFieldGroups(agent);
    const shown = [...groups.primary, ...groups.context];
    check(agent.fields.filter(f => f.required).every(f => shown.includes(f)), agent.id + ': all required inputs are visible');
    check(groups.extra.every(f => !f.required), agent.id + ': optional disclosure contains no required inputs');
}
// Future forms with more than three context fields must also keep required fields visible.
check(ctx.briefFieldGroups({id:'future',fields:['periods','duration','time','grade'].map(key=>({key,required:key==='grade'}))}).context.some(f=>f.key==='grade'), 'later required context is never hidden');
ctx.escapeHtml = value => String(value).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
ctx.UiNotes = {button: () => '<button type="button">Help</button>'};
vm.runInContext(page.slice(page.indexOf('function renderField('), page.indexOf('function collectInputs')), ctx);
const input = ctx.renderField('test', {key:'topic',label:'课题',type:'text',required:true,placeholder:'"><img src=x onerror=alert(1)>'});
check(!input.includes('<img'), 'placeholder HTML cannot create markup');
check(input.includes('aria-required="true"') && input.includes('for="agent-test-topic"'), 'required input has a programmatic label');
const select = ctx.renderField('test', {key:'grade',label:'年级',type:'select',required:true,options:['小学一年级']});
check(select.includes('value="" disabled selected'), 'required select asks for an explicit choice');

// Retiring checklist UI must preserve saved content and never invent a completed review.
const stateCtx = vm.createContext({
    console, _lastResult: '已保存的教案', _resultFeedback: '', _lastInputs: null,
    liveInputs: {topic:'分数'}, document: {getElementById: id => id === 'agent-form' ? {} : null}
});
stateCtx.window = stateCtx;
stateCtx.collectInputs = () => stateCtx.liveInputs;
stateCtx.TeachingProjects = {getActiveProject: () => null};
function sourceFunction(source, name) {
    const match = source.match(new RegExp('^(?:async )?function '+name+'\\([^\\n]*\\) \\{\\n[\\s\\S]*?^\\}', 'm'));
    assert.ok(match, name + ': definition exists');
    return match[0];
}

// Retired teaching backgrounds and old drafts must not replace a fresh task.
const cachedDraft = {inputs:{topic:'上次的课题'},result:'上次生成的内容',projectId:'existing-project'};
const project = {id:'existing-project',subject:'数学',grade:'小学三年级'};
const freshInputs = {};
const restored = [];
const freshCtx = vm.createContext({
    URLSearchParams, location:{search:''}, _workflowCarryInputs:null,
    TeachingProjects:{getProfile:()=>({subject:'语文'}),getActiveProject:()=>project,getDraft:()=>cachedDraft},
    applyInputValues:(_agent,inputs)=>Object.assign(freshInputs,inputs),
    restoreAgentDraft:(_agent,draft)=>restored.push(draft),
    document:{getElementById:()=>null}, updateBriefSummary(){}
});
freshCtx.window = freshCtx;
vm.runInContext(sourceFunction(page, 'initAgentForm'), freshCtx);
for (const agent of ctx.AGENTS.filter(a=>a.type==='form')) freshCtx.initAgentForm(agent);
check(restored.length === 0 && !freshInputs.topic, 'reopening any form starts without the previous inputs or generated text');
check(!freshInputs.subject && !freshInputs.grade, 'fresh tasks ignore stored teaching projects and default profiles');
freshCtx._workflowCarryInputs = {topic:'本次交接的课题'};
freshCtx.initAgentForm(lesson);
check(freshInputs.topic === '本次交接的课题' && freshCtx._workflowCarryInputs === null, 'explicit workflow handoff retains the current inputs once');
check(cachedDraft.result === '上次生成的内容', 'starting fresh does not delete stored legacy data');

// Explicitly choosing a workbook item still loads that item into the workbench.
const chosenWork = {id:'chosen-work',agentId:lesson.id,title:'所选教案',inputs:{topic:'所选课题'},content:'所选作品正文'};
const nodes = {};
Object.assign(freshCtx, {
    location:{search:'?work=chosen-work'}, _sourceWork:null, _workImportSequence:0, _wsAgent:lesson,
    currentAuthUid:()=> 'teacher-test', DB:{getMyWorks:async()=>[chosenWork]},
    document:{getElementById:id=>(nodes[id] ||= {classList:{add(){}}})}, persistCurrentDraft(){},
    showToast:message=>{throw new Error(message);}
});
vm.runInContext(sourceFunction(page, 'loadRequestedWork'), freshCtx);
await freshCtx.loadRequestedWork({uid:'teacher-test'});
check(restored.length === 1 && restored[0].result === chosenWork.content && restored[0].inputs.topic === chosenWork.inputs.topic, 'workbook entry loads only the explicitly chosen content and inputs');
check(freshCtx._sourceWork.id === chosenWork.id && nodes['run-btn'].disabled === false, 'explicit workbook entry preserves version lineage and enables generation');

for (const name of ['fingerprintWorkState','workStateFingerprint','restoredWorkbookFingerprint','workbookInputs']) {
    vm.runInContext(sourceFunction(page, name), stateCtx);
}
const storedDraft = {result:'已保存的教案',review:{alignment:'pass',facts:'pass'},feedback:'',workbookId:'saved-work'};
storedDraft.workbookFingerprint = stateCtx.fingerprintWorkState({agentId:lesson.id,inputs:stateCtx.liveInputs,result:storedDraft.result,review:storedDraft.review,feedback:''}, 'v1');
check(stateCtx.restoredWorkbookFingerprint(lesson, storedDraft) === stateCtx.workStateFingerprint(lesson), 'unchanged legacy draft keeps its saved marker');
check(stateCtx.workStateFingerprint(lesson).startsWith('v2:'), 'new fingerprints use content and feedback only');
check(!stateCtx.restoredWorkbookFingerprint(lesson, {...storedDraft,result:'尚未保存的修改'}), 'changed legacy content is not falsely marked saved');
stateCtx.liveInputs = {topic:'小数'};
check(!stateCtx.restoredWorkbookFingerprint(lesson, storedDraft), 'changed legacy inputs are not falsely marked saved');
stateCtx.liveInputs = {topic:'分数'};
check(!stateCtx.restoredWorkbookFingerprint(lesson, {...storedDraft,workbookId:''}), 'missing saved work identity is not treated as saved');
const current = stateCtx.workStateFingerprint(lesson);
check(stateCtx.restoredWorkbookFingerprint(lesson, {workbookFingerprint:current}) === current, 'current saved fingerprints restore unchanged');
const legacyInputs = {topic:'分数',_sourceWorkId:'parent',_reviewStatus:'reviewed',_reviewChecks:['facts'],_reviewDecisions:{facts:'pass'},_projectId:'old-project',_projectTitle:'旧背景',_projectSubject:'数学',_projectGrade:'小学三年级'};
const beforeInputs = JSON.stringify(legacyInputs);
const cleanInputs = stateCtx.workbookInputs(legacyInputs);
check(!('_reviewStatus' in cleanInputs) && !('_reviewChecks' in cleanInputs) && !('_reviewDecisions' in cleanInputs), 'new saves carry no checklist status');
check(!Object.keys(cleanInputs).some(key=>key.startsWith('_project')), 'new saves carry no retired project metadata');
check(cleanInputs.topic === '分数' && cleanInputs._sourceWorkId === 'parent', 'removing checklist metadata keeps task inputs and version lineage');
check(JSON.stringify(legacyInputs) === beforeInputs, 'legacy input records are not mutated');

// Both chat and form requests use only their task system prompt, despite old local context.
const payloads = [];
const apiCtx = vm.createContext({
    TeachingProjects:{contextLines:()=>['旧项目背景不得发送']},
    Auth:{getIdToken:async()=> 'synthetic-token'},
    AgentStream:{request:async options=>{payloads.push(options.payload);return '合成结果';}},
    buildUserPrompt:(_agent,inputs)=>inputs.topic,
    curriculumContext:()=>null, _sourceWork:null
});
apiCtx.window=apiCtx;
vm.runInContext(sourceFunction(page,'callAgentAPI'),apiCtx);
for (const type of ['form','chat']) {
    await apiCtx.callAgentAPI({agent:{id:'synthetic',type,system:'当前任务提示'},inputs:{topic:'本次课题'},history:[{role:'user',content:'本次对话'}]});
    const messages=payloads.at(-1).messages;
    check(messages[0].content==='当前任务提示' && !JSON.stringify(messages).includes('旧项目背景'), type+': stored background never enters the model request');
    check(messages[1].content===(type==='form'?'本次课题':'本次对话'), type+': current task content is preserved');
}
const workbook = read('workspace.html');
stateCtx.workType = () => 'draft';
stateCtx.workTypeLabel = () => '生成文稿';
vm.runInContext(sourceFunction(workbook, 'workDirectoryState'), stateCtx);
for (const status of ['draft','needs_revision','reviewed']) {
    const work = {inputs:{_reviewStatus:status},content:'原始内容'};
    const original = JSON.stringify(work);
    check(stateCtx.workDirectoryState(work).label === '生成文稿', status + ': legacy checklist does not create a workbook badge');
    check(JSON.stringify(work) === original, status + ': reading an old work preserves it');
}

// The library must distinguish loading, failures, no saved works and no search matches.
const libraryNodes = {};
const node = id => libraryNodes[id] ||= {style:{},dataset:{},textContent:'',innerHTML:'',value:'',hidden:false,classList:{toggle(){}},setAttribute(k,v){this[k]=v;}};
const libraryCtx = vm.createContext({
    console, workspacePageCopy:{filterAll:'全部',filterDraft:'生成文稿',filterChat:'对话记录',projectFilterAll:'全部教学项目',agentFilterAll:'全部智能体',moreActions:'更多操作'},
    _worksLoading:false,_wbError:'',_wbState:{q:'',type:'all',project:'all',agent:'all',sort:'updated-desc',view:'list'},
    _works:[
        {id:'quoted-"id',title:'分数 <img src=x onerror=1>',agentId:'lesson',agentName:'教学设计助手',content:'# 标题\n平均分的课堂活动',workType:'draft',inputs:{_projectId:'math',_projectTitle:'数学单元'},createdAt:'2026-11-01T00:00:00Z'},
        {id:'chat',title:'分数讨论',agentId:'chat',agentName:'对话助手',content:'同伴讨论',workType:'chat',inputs:{_projectId:'math',_projectTitle:'数学单元'},createdAt:'2026-11-02T00:00:00Z'},
        {id:'reading',title:'阅读活动',agentId:'lesson',agentName:'教学设计助手',content:'共同阅读',workType:'draft',inputs:{},createdAt:'2026-11-03T00:00:00Z'}
    ],
    document:{getElementById:node,querySelectorAll:()=>[],querySelector:()=>node('library')}
});
vm.runInContext(workbook.slice(workbook.indexOf('function fmtDate('),workbook.indexOf('function updateWorkbookState(')),libraryCtx);
for (const name of ['renderFilterControls','filteredWorks','renderWorks']) vm.runInContext(sourceFunction(workbook,name),libraryCtx);
libraryCtx._worksLoading = true;
libraryCtx.renderWorks();
check(node('wb-loading').style.display==='flex' && node('wb-empty').style.display==='none' && node('wb-total-metric').textContent==='—', 'reading works does not show an empty library or pretend to know the total');
libraryCtx._worksLoading = false;
libraryCtx.renderWorks();
check(node('wb-grid').innerHTML.includes('&lt;img') && !node('wb-grid').innerHTML.includes('<img') && node('wb-grid').innerHTML.includes('quoted-\\&quot;id'), 'titles and quoted work identifiers render without creating markup or breaking actions');
check(node('wb-total-metric').textContent===3 && node('wb-draft-metric').textContent===2 && node('wb-chat-metric').textContent===1, 'type counts reflect saved content');
Object.assign(libraryCtx._wbState,{q:'课堂',type:'draft',project:'math',agent:'lesson'});
libraryCtx.renderWorks();
check(libraryCtx.filteredWorks().length===1 && node('wb-statline').textContent==='找到 1 份成果' && !node('wb-clear').hidden, 'search, project, type and agent filters combine and offer a reset');
libraryCtx._wbState.q='不存在的关键词';
libraryCtx.renderWorks();
check(node('wb-filter-empty').style.display==='grid' && node('wb-empty').style.display==='none', 'zero search matches do not claim that saved works are missing');
libraryCtx._works=[];
libraryCtx.renderWorks();
check(node('wb-empty').style.display==='grid' && node('wb-grid').innerHTML==='', 'an empty library clears stale rendered content');
libraryCtx._wbError='读取失败 <example>';
libraryCtx.renderWorks();
check(node('wb-error').style.display==='grid' && node('wb-error-msg').textContent==='读取失败 <example>' && node('wb-empty').style.display==='none', 'a read failure is displayed as an error with text-safe details');
check(libraryCtx.previewText('# 重复标题\n课堂正文')==='课堂正文', 'list previews begin with content instead of repeating the document title');

// Small DOM fixture for the note event lifecycle; no browser, storage or external requests.
class Element {
    constructor(tag = 'div') { this.tag = tag; this.attrs = {}; this.dataset = {}; this.children = []; this.style = {}; this.listeners = {}; this.isConnected = true; this.rect = {left:370,top:620,bottom:652,width:32}; }
    setAttribute(k,v) { this.attrs[k] = String(v); }
    getAttribute(k) { return this.attrs[k] ?? null; }
    removeAttribute(k) { delete this.attrs[k]; }
    append(node) { node.parent = this; this.children.push(node); }
    remove() { this.isConnected = false; this.parent.children = this.parent.children.filter(n=>n!==this); }
    addEventListener(k,fn) { (this.listeners[k] ||= []).push(fn); }
    contains(n) { return n === this || this.children.some(child=>child.contains(n)); }
    closest(selector) {
        if (selector.includes('data-ui-note') && (this.dataset.uiNote !== undefined || this.dataset.noteSource)) return this;
        if (selector === '.ui-note-popover' && this.className === 'ui-note-popover') return this;
        if (selector === 'dialog' && this.tag === 'dialog') return this;
        return this.parent?.closest(selector) || null;
    }
    getBoundingClientRect() { return this.className === 'ui-note-popover' ? {width:300,height:140} : this.rect; }
}
const document = {listeners:{},body:new Element('body'),documentElement:{classList:{add(){}}},activeElement:null,createElement:tag=>new Element(tag),getElementById:id=>sources[id],addEventListener(k,fn){(this.listeners[k] ||= []).push(fn);}};
const sources = {editable:{textContent:'后台自定义说明'}};
const win = {listeners:{},addEventListener(k,fn){(this.listeners[k] ||= []).push(fn);}};
const notesCtx = vm.createContext({document,window:win,innerWidth:390,innerHeight:700,setTimeout,clearTimeout});
vm.runInContext(read('js/ui-notes.js'), notesCtx);
const b = new Element('button'); b.dataset.noteSource = 'editable'; b.setAttribute('aria-describedby','existing-help');
document.body.append(b);
function event(name, target = b, extra = {}) {
    const e = {target,relatedTarget:null,pointerType:'mouse',preventDefault(){this.prevented=true;},stopPropagation(){},...extra};
    for (const fn of document.listeners[name] || []) fn(e);
    return e;
}
function tooltip() { return document.body.children.find(n=>n.className==='ui-note-popover'); }
event('pointerover');
check(tooltip()?.textContent === '后台自定义说明', 'hover reads the current editable source');
check(b.getAttribute('aria-describedby').startsWith('existing-help ui-note-'), 'existing descriptions are preserved while open');
check(parseFloat(tooltip().style.left) >= 12 && parseFloat(tooltip().style.left) + 300 <= 378, 'help fits the mobile viewport');
check(parseFloat(tooltip().style.top) < b.rect.top, 'help flips above the trigger near the viewport bottom');
document.activeElement=b;
event('keydown',b,{key:'Escape'});
check(!tooltip() && b.getAttribute('aria-describedby') === 'existing-help', 'Escape closes and restores the previous description');
document.activeElement=b; event('focusin');
check(!tooltip(), 'Escape dismissal does not immediately reopen on the same focused trigger');
event('focusout'); document.activeElement=null;
event('focusin');
check(!!tooltip(), 'keyboard focus opens help after returning to the trigger');
notesCtx.UiNotes.close();
document.activeElement=null; event('pointerover'); event('keydown',b,{key:'Escape'});
document.activeElement=b; event('focusin');
check(!!tooltip(), 'keyboard focus opens after an unfocused hover was dismissed');
notesCtx.UiNotes.close();
event('pointerover',b,{pointerType:'touch'});
check(!tooltip(), 'touch hover is ignored');
event('click');
check(!!tooltip() && b.getAttribute('aria-expanded')==='true', 'touch/click opens a pinned note');
event('click');
check(!tooltip() && b.getAttribute('aria-expanded')==='false', 'clicking again closes a pinned note');
event('click'); event('click',document.body);
check(!tooltip(), 'outside click dismisses help');
sources.editable.textContent='刚刚更新的说明'; event('click');
check(tooltip()?.textContent==='刚刚更新的说明', 'notes use updated admin copy rather than a stale snapshot');
b.isConnected=false; for (const fn of win.listeners.scroll) fn();
check(!tooltip(), 'detached triggers cannot leave an orphaned tooltip');
check(!notesCtx.UiNotes.button('<script>','"').includes('<script>'), 'dynamic note text is escaped');
console.log(`易用性回归通过：${passed} 项断言（任务、必填项与备注生命周期；离线合成数据）。`);
