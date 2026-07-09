/* ===================================================================
   智能体后端代理 · Cloudflare Pages Function
   - 前端 agents.html 的 callAgentAPI() 调用本接口（同源 /api/agent）
   - 本函数持有模型密钥（CF 环境变量 DEEPSEEK_API_KEY / ZHIPU_API_KEY，Secret），
     密钥永不下发到浏览器
   - 校验调用者已登录（Firebase idToken），防止接口被匿名盗刷
   - 把上游 SSE 流解析成纯文本增量，流式回传给前端
   配置：在 Cloudflare Pages 项目 → Settings → Environment variables
        新增 DEEPSEEK_API_KEY / ZHIPU_API_KEY（Type: Secret）。
   =================================================================== */

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const ZHIPU_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-v4-flash';        // DeepSeek V4-Flash（旧 deepseek-chat 名 2026/07/24 停用，这是其正式替代）
const ZHIPU_MODEL = 'glm-5.2';
const TEMPERATURE = 0.6;
const MAX_TOKENS = 8192;
// DeepSeek v4-flash 和 GLM-5.2 默认可开「思考模式」（更慢更贵）；起草教学内容用非思考即可。
const THINKING = { type: 'disabled' };
const DEFAULT_ZHIPU_AGENT_IDS = [
    'lesson-design',
    'concept-explainer',
    'quiz-gen',
    'exam-paper',
    'error-diagnosis'
];

const PROVIDERS = {
    deepseek: {
        key: 'deepseek',
        label: 'DeepSeek',
        envKey: 'DEEPSEEK_API_KEY',
        url: DEEPSEEK_URL,
        model: DEEPSEEK_MODEL
    },
    zhipu: {
        key: 'zhipu',
        label: '智谱 GLM-5.2',
        envKey: 'ZHIPU_API_KEY',
        url: ZHIPU_URL,
        model: ZHIPU_MODEL
    }
};

// 复用站点既有的 Firebase 公开配置校验 idToken（与 admin-users.js 一致的轻量方式）
const FIREBASE_API_KEY = 'AIzaSyBx7adowufG1syf9ryrsFhywcVMS-sWxWo';
const FIREBASE_AUTH_LOOKUP = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`;

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Expose-Headers': 'X-Agent-Provider, X-Agent-Model, X-Agent-Fallback-From'
};

function jsonResponse(status, body) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
}

function parseList(value, fallback) {
    if (!value) return fallback;
    return String(value).split(',').map(s => s.trim()).filter(Boolean);
}

function providerBody(provider, messages) {
    return {
        model: provider.model,
        messages: messages.slice(-30),   // 限制上下文长度，控制成本
        stream: true,
        thinking: THINKING,
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS
    };
}

function chooseProvider({ agentId, env }) {
    const zhipuAgents = new Set(parseList(env.ZHIPU_AGENT_IDS, DEFAULT_ZHIPU_AGENT_IDS));
    const defaultProvider = PROVIDERS[env.AGENT_DEFAULT_PROVIDER] || PROVIDERS.deepseek;
    const requested = zhipuAgents.has(agentId) ? PROVIDERS.zhipu : defaultProvider;
    if (env[requested.envKey]) return requested;
    if (env[PROVIDERS.deepseek.envKey]) return PROVIDERS.deepseek;
    if (env[PROVIDERS.zhipu.envKey]) return PROVIDERS.zhipu;
    return requested;
}

async function fetchProvider(provider, env, messages) {
    const apiKey = env[provider.envKey];
    if (!apiKey) {
        const e = new Error(`服务器尚未配置 ${provider.label} 密钥（请在 Cloudflare 设置 ${provider.envKey}）`);
        e.statusCode = 501;
        throw e;
    }
    const upstream = await fetch(provider.url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(providerBody(provider, messages))
    });
    return upstream;
}

async function callProviderWithFallback(provider, env, messages) {
    const fallback = provider.key === 'zhipu' ? PROVIDERS.deepseek : null;
    try {
        const upstream = await fetchProvider(provider, env, messages);
        if (upstream.ok && upstream.body) return { upstream, provider };
        if (fallback && env[fallback.envKey]) {
            const retry = await fetchProvider(fallback, env, messages);
            if (retry.ok && retry.body) return { upstream: retry, provider: fallback, fallbackFrom: provider };
            return { upstream: retry, provider: fallback, fallbackFrom: provider };
        }
        return { upstream, provider };
    } catch (e) {
        if (fallback && env[fallback.envKey]) {
            try {
                const retry = await fetchProvider(fallback, env, messages);
                return { upstream: retry, provider: fallback, fallbackFrom: provider };
            } catch (fallbackError) {
                fallbackError.message = `${provider.label} 与 ${fallback.label} 均无法连接：${fallbackError.message || e.message}`;
                throw fallbackError;
            }
        }
        e.message = `无法连接 ${provider.label}：${e.message}`;
        throw e;
    }
}

async function verifyUser(idToken) {
    if (!idToken) { const e = new Error('请先登录后使用智能体'); e.statusCode = 401; throw e; }
    const r = await fetch(FIREBASE_AUTH_LOOKUP, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.users?.[0]) { const e = new Error('登录状态已过期，请重新登录'); e.statusCode = 401; throw e; }
    return d.users[0];
}

/* ---- 轻量限流：同一登录用户在短时间内问太多次就拦下 ----
   作用：挡住"手滑狂点 / 脚本刷接口"，顺带控成本。
   说明：Cloudflare 函数无持久状态，这里用「单实例内存」做软限流——
        能稳稳挡住最常见的"短时间猛点"；Cloudflare 有多台服务器、跨服务器
        非 100% 精确，但对登录后的培训场景足够，且零配置、不花钱、不占额度。
        若以后要"每人每天封顶"等硬性额度，再升级到 KV/Durable Objects。 */
const RATE_WINDOW_MS = 60 * 1000;   // 时间窗口：60 秒
const RATE_MAX = 12;                // 每个用户 60 秒内最多 12 次（≈ 每 5 秒一次，正常用绰绰有余）
const _rateMap = new Map();         // uid -> 最近请求的时间戳数组

function checkRate(uid) {
    const now = Date.now();
    const recent = (_rateMap.get(uid) || []).filter(t => now - t < RATE_WINDOW_MS);
    if (recent.length >= RATE_MAX) {
        const retry = Math.max(1, Math.ceil((RATE_WINDOW_MS - (now - recent[0])) / 1000));
        return { ok: false, retry };
    }
    recent.push(now);
    _rateMap.set(uid, recent);
    // 顺手清理过期用户，防内存无限增长
    if (_rateMap.size > 5000) {
        for (const [k, v] of _rateMap) {
            const alive = v.filter(t => now - t < RATE_WINDOW_MS);
            if (alive.length) _rateMap.set(k, alive); else _rateMap.delete(k);
        }
    }
    return { ok: true };
}

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost({ request, env, waitUntil }) {
    let payload;
    try { payload = await request.json(); }
    catch { return jsonResponse(400, { ok: false, msg: '请求格式不正确' }); }

    const { messages, idToken, agentId } = payload || {};
    if (!Array.isArray(messages) || !messages.length) {
        return jsonResponse(400, { ok: false, msg: '缺少对话内容' });
    }

    // 登录校验（防盗刷）
    let user;
    try {
        user = await verifyUser(idToken);
    } catch (e) {
        return jsonResponse(e.statusCode || 401, { ok: false, msg: e.message });
    }

    // 限流：同一用户问太频繁就拦下（防手滑狂点 / 刷接口、控成本）
    const rate = checkRate(user.localId);
    if (!rate.ok) {
        return jsonResponse(429, { ok: false, msg: `提问太频繁啦，请约 ${rate.retry} 秒后再试～` });
    }

    // 调用模型供应商（流式）：默认 DeepSeek，部分智能体可由 GLM-5.2 承担，失败时尽量回退 DeepSeek。
    const selectedProvider = chooseProvider({ agentId, env });
    let upstream;
    let activeProvider = selectedProvider;
    let fallbackFrom = null;
    try {
        const result = await callProviderWithFallback(selectedProvider, env, messages);
        upstream = result.upstream;
        activeProvider = result.provider;
        fallbackFrom = result.fallbackFrom || null;
    } catch (e) {
        return jsonResponse(e.statusCode || 502, { ok: false, msg: e.message });
    }

    if (!upstream.ok || !upstream.body) {
        const errText = await upstream.text().catch(() => '');
        let msg = `${activeProvider.label} 调用失败（${upstream.status}）`;
        try { msg = JSON.parse(errText)?.error?.message || msg; } catch {}
        return jsonResponse(upstream.status || 502, { ok: false, msg });
    }

    // 解析上游 SSE → 纯文本增量，用 TransformStream 管道流式回传
    // （在 Cloudflare Workers 上比手写 ReadableStream.pull 更可靠）
    const encoder = new TextEncoder();
    const { readable, writable } = new TransformStream();

    const pump = (async () => {
        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        const writer = writable.getWriter();
        let buffer = '';
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();   // 末尾可能是半行，留到下次
                for (const line of lines) {
                    const t = line.trim();
                    if (!t.startsWith('data:')) continue;
                    const data = t.slice(5).trim();
                    if (data === '[DONE]') { buffer = ''; break; }
                    try {
                        const delta = JSON.parse(data)?.choices?.[0]?.delta?.content;
                        if (delta) await writer.write(encoder.encode(delta));
                    } catch { /* 忽略心跳/空行 */ }
                }
            }
        } catch { /* 上游中断，下面照常收尾 */ }
        try { await writer.close(); } catch {}
    })();

    if (typeof waitUntil === 'function') waitUntil(pump);

    return new Response(readable, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'X-Agent-Provider': activeProvider.key,
            'X-Agent-Model': activeProvider.model,
            ...(fallbackFrom ? { 'X-Agent-Fallback-From': fallbackFrom.key } : {}),
            ...CORS_HEADERS
        }
    });
}
