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

    const emailAction = await fetch(`${base}/api/email-action?mode=verifyEmail&oobCode=AbCdEfGhIjKlMnOpQrStUvWx`);
    const emailActionBody = await emailAction.text();
    assert(emailAction.status === 200 && emailAction.headers.get('content-type')?.includes('text/html'), '本站邮箱操作页未由 Node 适配层提供');
    assert(emailAction.headers.get('cache-control')?.includes('no-store') && emailAction.headers.get('pragma') === 'no-cache', '邮箱操作页未彻底禁用缓存');
    assert(emailAction.headers.get('referrer-policy') === 'no-referrer' && emailAction.headers.get('content-security-policy')?.includes("default-src 'none'"), '邮箱操作页缺少验证码防泄漏响应头');
    assert(emailActionBody.includes('/api/auth-proxy') && emailActionBody.includes('history.replaceState') && emailActionBody.includes('验证邮箱'), '邮箱操作页内容或同源完成链路不完整');
    assert(emailActionBody.includes('id="link-form"') && emailActionBody.includes('在本站完成邮箱操作') && emailActionBody.includes('不需要连接 VPN'), '邮件链接粘贴备用流程未接入');
    const inlineScript = emailActionBody.match(/<script>([\s\S]+)<\/script>/)?.[1] || '';
    assert(inlineScript.length > 0 && (() => { try { new Function(inlineScript); return true; } catch { return false; } })(), '邮箱操作页内联脚本语法错误');

    const emailActionPost = await fetch(`${base}/api/email-action`, { method: 'POST' });
    assert(emailActionPost.status === 405 && emailActionPost.headers.get('allow') === 'GET', '邮箱操作页没有限制为只读 GET 路由');

    console.log(`腾讯云 API 适配层通过：${passed} 项断言。`);
} finally {
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
}
