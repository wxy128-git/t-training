# 腾讯云并行部署

生产结构：Nginx 直接服务 `www/`，`/api/*` 反向代理到仅监听
`127.0.0.1:3001` 的 `t-training-api`。现有 Cloudflare Pages 站点在迁移验收期间继续在线。

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

`nginx-ai.teachailab.com.conf` 是首次签发证书前的 HTTP 配置。DNS 指向服务器、
HTTP 健康检查通过后，使用 Certbot 原地加入 TLS 和 301 跳转：

```bash
sudo certbot --nginx -d ai.teachailab.com --redirect --non-interactive
```

服务器通过 `certbot.timer` 自动续期。PM2 发布后必须执行 `pm2 save`，确保
`edu-media` 与 `t-training-api` 都写入 `/home/ubuntu/.pm2/dump.pm2`；
`pm2-ubuntu.service` 保持 enabled，服务器开机时从该清单恢复。

上线前必须先在并行域名完成健康检查、无后缀路由、登录、智能体流式输出、
备课本和管理后台验证。旧站只在新站验证完成后显示迁移提示，不立即下线。
