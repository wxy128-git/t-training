# AI 教师培训中心

面向中小学教师的 AI 教学实践网站。生产环境为 [xylaoshi.pages.dev](https://xylaoshi.pages.dev/)，使用 Cloudflare Pages + Firebase Auth / Firestore。

## 本地预览

项目是无构建步骤的静态站，但正式站统一使用 `/agents` 这类无后缀路由，因此请用项目自带服务器预览：

```bash
node scripts/serve.mjs
```

默认地址为 `http://127.0.0.1:8765`。静态预览不模拟 `/api/*` Cloudflare Pages Functions。

## 质量检查

```bash
node scripts/check-site.mjs
node scripts/test-functions.mjs
node scripts/check-production.mjs
```

GitHub Actions 会在推送和 Pull Request 时自动运行结构、安全约束、函数行为与 JavaScript 语法检查。

## 部署

- 网站与 Pages Functions：推送 `main` 后由 Cloudflare Pages 自动部署。
- Firestore Rules：规则保存在 `firestore.rules`，需在已登录 Firebase CLI 的环境单独执行：

```bash
npx --yes firebase-tools@latest deploy --only firestore:rules
```

Cloudflare 中需继续保留 Firebase 服务账号以及智能体模型所需的环境变量。不要把私钥提交到仓库。
