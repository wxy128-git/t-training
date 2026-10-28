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
    const match = source.match(new RegExp('^function '+name+'\\([^\\n]*\\) \\{\\n[\\s\\S]*?^\\}', 'm'));
    assert.ok(match, name + ': definition exists');
    return match[0];
}
for (const name of ['fingerprintWorkState','workStateFingerprint','restoredWorkbookFingerprint','workInputsWithProject']) {
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
const legacyInputs = {topic:'分数',_sourceWorkId:'parent',_reviewStatus:'reviewed',_reviewChecks:['facts'],_reviewDecisions:{facts:'pass'}};
const beforeInputs = JSON.stringify(legacyInputs);
const cleanInputs = stateCtx.workInputsWithProject(legacyInputs);
check(!('_reviewStatus' in cleanInputs) && !('_reviewChecks' in cleanInputs) && !('_reviewDecisions' in cleanInputs), 'new saves carry no checklist status');
check(cleanInputs.topic === '分数' && cleanInputs._sourceWorkId === 'parent', 'removing checklist metadata keeps task inputs and version lineage');
check(JSON.stringify(legacyInputs) === beforeInputs, 'legacy input records are not mutated');
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
