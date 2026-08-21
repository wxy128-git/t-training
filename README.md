# AI 教师培训中心

面向中小学教师的 AI 教学实践网站。主生产环境为
[ai.teachailab.com](https://ai.teachailab.com/)，部署在腾讯云轻量应用服务器，
使用 Nginx + PM2/Node + Firebase Auth / Firestore。原
[Cloudflare Pages 站点](https://xylaoshi.pages.dev/) 在迁移提示期继续可用。

## 本地预览

项目是无构建步骤的静态站，但正式站统一使用 `/agents` 这类无后缀路由，因此请用项目自带服务器预览：

```bash
node scripts/serve.mjs
```

默认地址为 `http://127.0.0.1:8765`。静态预览不模拟 `/api/*` 后端函数。

## 质量检查

```bash
node scripts/check-site.mjs
node scripts/test-functions.mjs
node scripts/test-tencent-server.mjs
node scripts/check-production.mjs https://ai.teachailab.com/
```

GitHub Actions 会在推送和 Pull Request 时自动运行结构、安全约束、函数行为与 JavaScript 语法检查。

## 部署

- 腾讯云主站：按 [`deploy/tencent/README.md`](deploy/tencent/README.md) 生成白名单发布包，
  静态文件由 Nginx 服务，8 个 API 函数经 Node 适配层和 PM2 运行。
- Cloudflare 旧站：推送 `main` 后仍自动部署，用于迁移提示和短期回退。
- Firestore Rules：规则保存在 `firestore.rules`，需在已登录 Firebase CLI 的环境单独执行：

```bash
npx --yes firebase-tools@latest deploy --only firestore:rules
```

服务器与 Cloudflare 中需分别保留 Firebase 服务账号以及智能体模型所需的环境变量。
不要把私钥提交到仓库。
