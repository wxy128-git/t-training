import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const source = name => readFileSync(new URL(name, root), 'utf8');
let count = 0;
const check = (condition, message) => { assert.ok(condition, message); count++; };
const storage = new Map();
let user = { uid: 'teacher-a' };
const sandbox = {
    window: null, crypto: globalThis.crypto,
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    SiteAuth: { getCurrentUser: () => user }
};
sandbox.window = sandbox;
vm.runInNewContext(source('js/teaching-projects.js'), sandbox);
storage.set('xylaoshiTeachingV1:agent-drafts:guest', JSON.stringify({ 'unassigned::lesson-design': { agentId: 'lesson-design', result: 'legacy-private' } }));
check(sandbox.TeachingProjects.getDraft('lesson-design') === null, '旧共享槽不能自动归属新账号');
sandbox.TeachingProjects.saveDraft('lesson-design', { result: 'A 的教案' });
user = { uid: 'teacher-b' };
check(sandbox.TeachingProjects.getDraft('lesson-design') === null, 'B 不得读 A 的草稿');
sandbox.TeachingProjects.saveDraft('lesson-design', { result: 'B 的教案' });
user = null;
check(sandbox.TeachingProjects.getDraft('lesson-design') === null, '退出后不得读登录用户的草稿');
user = { uid: 'teacher-a' };
check(sandbox.TeachingProjects.getDraft('lesson-design').result === 'A 的教案', '切回 A 应保留其草稿');
vm.runInNewContext(source('js/task-search.js'), sandbox);
check(sandbox.TaskSearch.score({ id: 'class-activity' }, '设计一场小组活动') > 0, '页面示例应匹配课堂活动');
check(sandbox.TaskSearch.score({ id: 'student-comment' }, '帮我写期末评语') > 0, '自然任务表达应匹配评语');
check(sandbox.TaskSearch.score({ id: 'quiz-gen' }, '设计一场小组活动') === 0, '无关任务不应抢占搜索结果');

const realFetch = globalThis.fetch;
const agent = await import('../functions/api/agent.js');
const encode = text => new TextEncoder().encode(text);
const chunk = text => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
const done = 'data: [DONE]\n\n';
let runId = 0;
async function serverResponse(upstream, structured = true) {
    globalThis.fetch = async (url, options) => String(url).includes('accounts:lookup')
        ? Response.json({ users: [{ localId: `reliability-${++runId}`, email: 'teacher@example.invalid', emailVerified: true }] }) : upstream(options);
    const pending = [];
    const response = await agent.onRequestPost({
        request: new Request('https://site.test/api/agent', { method: 'POST', body: JSON.stringify({
            idToken: 'test-only', agentId: 'parent-comm', messages: [{ role: 'user', content: '测试' }],
            ...(structured ? { streamProtocol: 'events-v1' } : {})
        }) }), env: { DEEPSEEK_API_KEY: 'test-only' }, waitUntil: promise => pending.push(promise)
    });
    return { response, pending };
}
try {
    let result = await serverResponse(() => new Response(chunk('完整教案') + done));
    let events = (await result.response.text()).trim().split('\n').map(JSON.parse);
    await Promise.all(result.pending);
    check(events.at(-1).type === 'done' && events[0].text === '完整教案', '正常输出必须有完成标记');
    result = await serverResponse(() => new Response(chunk('只有一半')));
    events = (await result.response.text()).trim().split('\n').map(JSON.parse);
    check(events.at(-1).type === 'error' && events.every(event => event.type !== 'done'), '无完成标记不能标记成功');
    result = await serverResponse(() => new Response(chunk('长度截断') + 'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n' + done));
    events = (await result.response.text()).trim().split('\n').map(JSON.parse);
    check(events.at(-1).type === 'error', '达到 token 上限不能标记成功');
    result = await serverResponse(() => {
        let reads = 0;
        return new Response(new ReadableStream({ pull(controller) {
            if (reads++ === 0) controller.enqueue(encode(chunk('断线前文字')));
            else controller.error(new Error('upstream disconnected'));
        } }));
    });
    events = (await result.response.text()).trim().split('\n').map(JSON.parse);
    check(events[0].text === '断线前文字' && events.at(-1).type === 'error', '断流应保留片段并返回错误');
    result = await serverResponse(() => new Response(chunk('兼容旧客户端') + done), false);
    check(await result.response.text() === '兼容旧客户端', '旧客户端仍可读取完整纯文本结果');

    let upstreamCancelled = false, upstreamSignal;
    result = await serverResponse(options => {
        upstreamSignal = options.signal;
        return new Response(new ReadableStream({
            start(controller) { controller.enqueue(encode(chunk('取消前文字'))); },
            cancel() { upstreamCancelled = true; }
        }));
    });
    const downstream = result.response.body.getReader();
    await downstream.read();
    await downstream.cancel();
    await Promise.all(result.pending);
    check(upstreamCancelled && upstreamSignal.aborted, '用户断开连接后应取消上游读取与请求');

    await import('../js/agent-stream.js');
    const response = events => new Response(events.map(event => JSON.stringify(event)).join('\n') + '\n', { headers: { 'Content-Type': 'application/x-ndjson' } });
    globalThis.fetch = async () => response([{ type: 'delta', text: '文本' }, { type: 'done' }]);
    check(await AgentStream.request({ payload: {} }) === '文本', '客户端应正确读取完整结果');
    globalThis.fetch = async () => response([{ type: 'delta', text: '部分文本' }]);
    await assert.rejects(AgentStream.request({ payload: {} }), error => error.partial === '部分文本' && /提前结束/.test(error.message)); count++;
    globalThis.fetch = async () => response([{ type: 'delta', text: '保留片段' }, { type: 'error', message: '生成超时' }]);
    await assert.rejects(AgentStream.request({ payload: {} }), error => error.partial === '保留片段' && /超时/.test(error.message)); count++;
    globalThis.fetch = async (_url, options) => new Promise((resolve, reject) => {
        if (options.signal.aborted) reject(options.signal.reason);
        else options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    });
    await assert.rejects(AgentStream.request({ payload: {}, firstTimeout: 10 }), /超时/); count++;
    globalThis.fetch = async (_url, options) => new Response(new ReadableStream({ start(controller) {
        controller.enqueue(encode(JSON.stringify({type:'delta',text:'等待中断的文字'}) + '\n'));
        options.signal.addEventListener('abort', () => controller.error(options.signal.reason), {once:true});
    } }), {headers:{'Content-Type':'application/x-ndjson'}});
    await assert.rejects(AgentStream.request({payload:{},idleTimeout:10}), error => /超时/.test(error.message) && error.partial === '等待中断的文字'); count++;
    globalThis.fetch = async (_url, options) => { if(options.signal.aborted) throw options.signal.reason; throw new Error('测试请求未被取消'); };
    const controller = new AbortController();
    controller.abort(new Error('已停止生成'));
    await assert.rejects(AgentStream.request({ payload: {}, signal: controller.signal }), error => error.cancelled && /停止/.test(error.message)); count++;
    console.log(`生成可靠性回归通过：${count} 项断言（合成数据，无外部请求）。`);
} finally { globalThis.fetch = realFetch; }
