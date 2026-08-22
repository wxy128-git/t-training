#!/usr/bin/env node

import { createApiServer } from '../server/tencent-api.mjs';

let passed = 0;
function assert(condition, message) {
    if (!condition) throw new Error(message);
    passed += 1;
}

const server = createApiServer({
    env: {},
    publicOrigin: 'https://ai.teachailab.com'
});

try {
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    const base = `http://127.0.0.1:${address.port}`;

    const health = await fetch(`${base}/healthz`);
    const healthBody = await health.json();
    assert(health.status === 200 && healthBody.service === 't-training-api', '健康检查失败');

    const missing = await fetch(`${base}/api/not-found`);
    assert(missing.status === 404, '未知接口没有返回 404');

    const invalidMethod = await fetch(`${base}/api/tools`, { method: 'POST' });
    assert(invalidMethod.status === 405 && invalidMethod.headers.get('allow')?.includes('GET'), '方法限制异常');

    const authOptions = await fetch(`${base}/api/auth-proxy`, { method: 'OPTIONS' });
    assert(authOptions.status === 204 && authOptions.headers.get('access-control-allow-origin') !== '*', '认证预检响应异常');

    const invalidAuth = await fetch(`${base}/api/auth-proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', email: 'bad', password: '123456' })
    });
    assert(invalidAuth.status === 400, '认证输入校验没有经 Node 适配层生效');

    const invalidContent = await fetch(`${base}/api/content?type=unknown`);
    assert(invalidContent.status === 400, '内容类型校验没有经 Node 适配层生效');

    const blockedRss = await fetch(`${base}/api/rss-proxy?url=http://127.0.0.1:3001/healthz`);
    assert(blockedRss.status === 400, 'RSS 白名单没有经 Node 适配层生效');

    const invalidAgent = await fetch(`${base}/api/agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    });
    assert(invalidAgent.status === 400, '智能体输入校验没有经 Node 适配层生效');

    console.log(`腾讯云 API 适配层通过：${passed} 项断言。`);
} finally {
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
}
