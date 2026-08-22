# 腾讯云生产部署

生产结构：Nginx 直接服务 `/var/www/t-training`，`/api/*` 反向代理到仅监听
`127.0.0.1:3001` 的 `t-training-api`。`https://ai.teachailab.com/` 是主站；
Cloudflare Pages 旧地址通过 `_redirects` 做保留路径的临时 302 跳转，也作为可回退发布源。

## 本地验证

```bash
node scripts/check-site.mjs
node scripts/test-functions.mjs
node scripts/test-tencent-server.mjs
```

用一个新的空目录生成白名单部署包：

```bash
node scripts/build-tencent-package.mjs /tmp/t-training-package
```

部署包只包含用户可访问的静态文件、8 个 API 函数、Node 适配层和运维模板；
被 `.gitignore` 排除的多模态制作源文件不会进入生产包。

## 服务器约定

- 静态发布目录：`/var/www/t-training`
- 静态文件上传暂存：`/home/ubuntu/t-training/www`
- API：`/home/ubuntu/t-training/app`
- 私密环境文件：`/home/ubuntu/.config/t-training.env`（权限 `600`）
- PM2 进程：`t-training-api`，单实例 fork 模式
- 域名：`ai.teachailab.com`

`nginx-ai.teachailab.com.conf` 现在与生产 TLS 配置保持一致，包含 HTTP→HTTPS、
HTTP/2、gzip、静态缓存、安全响应头和 API 反向代理。证书路径由 Certbot 管理：

```bash
sudo certbot --nginx -d ai.teachailab.com --redirect --non-interactive
```

服务器通过 `certbot.timer` 自动续期。`vendor/` 是固定版本的站内依赖，使用一年缓存；
其他带查询版本的静态资源使用 30 天缓存；HTML 和 `sw.js` 不缓存。修改共享 CSS / JS
后必须更新 HTML 查询版本；修改离线清单或策略时同时更新 `sw.js` 的 `VERSION`。

## 无中断发布

不要直接覆盖正在服务的 API 进程。推荐流程：

1. 用 `build-tencent-package.mjs` 生成白名单包并上传到新的 release 目录。
2. 复制现有静态站与 API 到带日期的 backup 目录，保留一个明确回滚点。
3. 先让候选 API 在 `127.0.0.1:3002` 启动并完成 `/healthz`、登录和接口回归。
4. 将 Nginx 上游平滑切到候选端口，再原子更新 `/var/www/t-training` 和正式 API 目录。
5. 在 `3001` 启动正式 PM2 进程，健康检查通过后将 Nginx 切回 `3001`，停止候选进程。
6. 执行 `pm2 save`，确保 `edu-media` 与 `t-training-api` 都写入
   `/home/ubuntu/.pm2/dump.pm2`。

`pm2-ubuntu.service` 必须同时是 `enabled` 和 `active (running)`；只显示 enabled 不代表
PM2 守护进程真的受 systemd 管理。发布后检查 systemd Main PID、PM2 两个应用状态，
并分别验证教师培训站和教育媒体课程站返回 200。

上线前必须先在候选端口完成健康检查和函数回归；切换后验证无后缀路由、登录 / 注册、
智能体流式输出、备课本、管理后台、RSS 白名单、HTTP/2 + gzip 和静态缓存。最后运行
`node scripts/check-production.mjs https://ai.teachailab.com/`，并检查旧站 302 跳转仍保留路径。
