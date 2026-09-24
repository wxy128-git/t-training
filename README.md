# AI 教师培训中心

面向中小学教师的 AI 教学实践网站。主生产环境为
[ai.teachailab.com](https://ai.teachailab.com/)，部署在腾讯云轻量应用服务器，
使用 Nginx + PM2/Node + 腾讯 MariaDB；新注册、登录会话、资料和站内数据均已切到腾讯服务器，Firebase 只保留为旧账号首次登录时的一次性密码校验桥接。原
[Cloudflare Pages 地址](https://xylaoshi.pages.dev/) 现以 302 临时跳转到腾讯云主站，
用于兼容用户保存的旧链接；跳转会保留路径与查询参数。

## 本地预览

项目是无构建步骤的静态站，但正式站统一使用 `/agents` 这类无后缀路由，因此请用项目自带服务器预览：

```bash
node scripts/serve.mjs
```

默认地址为 `http://127.0.0.1:8765`。本地服务器会运行登录所需的认证代理，以及公开内容、工具和 RSS 只读接口；依赖 Cloudflare 密钥的管理接口仍不会在本地启用。页面文案在本地预览时保存到浏览器存储，不会写入线上 Firestore。

## 质量检查

```bash
npm run check
```

包含站点结构与缓存检查、课程匹配、函数行为、邮箱验证、生成中断恢复和腾讯云适配层回归。
回归使用合成数据，不调用付费模型。生产发布后另行执行：

```bash
node scripts/check-production.mjs https://ai.teachailab.com/
```

GitHub Actions 会在推送和 Pull Request 时自动运行结构、安全约束、函数行为与 JavaScript 语法检查。

## 部署

- 腾讯云主站：按 [`deploy/tencent/README.md`](deploy/tencent/README.md) 生成白名单发布包，
  静态文件由 Nginx 服务，8 个 API 函数经 Node 适配层和 PM2 运行。
- Cloudflare 旧地址：推送 `main` 后仍自动部署，当前通过 `_redirects` 以 302
  跳转到腾讯云主站；需要回退时可撤销这两条临时跳转规则。
- Firestore Rules：规则保存在 `firestore.rules`，需在已登录 Firebase CLI 的环境单独执行：

```bash
npx --yes firebase-tools@latest deploy --only firestore:rules
```

服务器与 Cloudflare 中需分别保留 Firebase 服务账号以及智能体模型所需的环境变量。
不要把私钥提交到仓库。

## 2026-09-21 体验优化（2026-09-22 已上线）

修改范围、验收截图与待办见 [实施与验收记录](reports/2026-09-21-implementation/README.md)。
本轮已于 2026-09-22 合并发布；公网 96 项检查通过。

后续三项的实施与真实测试见 [账号恢复、真实账号流程与教学质量验收](reports/2026-09-21-account-quality/README.md)。真实账号测试已清理，模型质量问题和复测边界逐项保留在报告中。人工恢复按用户后续要求暂缓，支持邮箱不再作为本次实施前置条件。

19 个智能体的当前版本后续完成了 42 次真实模型请求，其中组卷助手在追加修正后连续通过两套不同配比的最终复测。逐项结论和原始匿名输出见 [教学质量复测](reports/2026-09-22-teaching-retest/README.md)。相关提示词已于 2026-09-22 发布。

## 2026-09-23 邮箱链接国内网络备用入口（已上线）

邮件按钮在国内网络打不开时，老师无需连接 VPN：在验证弹窗或忘记密码页进入本站邮箱操作页，复制邮件按钮的完整链接并粘贴，本站会完成验证、换绑、恢复或密码重置。Firebase 项目的自定义回调地址仍被管理 API 以 `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED` 拒绝，邮件按钮仍可能先打开 Firebase 默认页面；粘贴入口是当前已上线的可用方案。

本次发布提交为 `cef2e2a`、`d938aac`，共享资源版本 `20260923-email-link-help`，Service Worker `20260923-v24`；本地检查、候选检查和公网 103 项检查均通过。临时配置工具已删除，但服务账号密钥还需要有权限的 Google Cloud / Firebase 管理员手动轮换。

## 2026-09-24 Firebase 迁移核心切换（已上线）

生产登录会话、站内数据和新注册已切到腾讯 MariaDB；新注册只在腾讯服务器创建账号，不再写入 Firebase。已有账号首次登录会由 Firebase 校验一次原密码并迁移为本地 `scrypt` 哈希，以保留原密码和现有用户数据。邮箱验证与密码重置使用腾讯云 SES，链接直接回到 `ai.teachailab.com`。

最终只读快照包含 373 个账号和 11,067 条文档，哈希校验与严格镜像导入均通过。发布提交为 `74a8666`。两封经授权的真实测试邮件均完成操作，服务器确认验证状态、本地密码和两枚单次令牌状态正确；启用本地注册后的生产测试确认 Firebase Auth 数量保持 378 不变，临时腾讯账号已清理且未发送额外邮件。公网生产检查再次通过 103 项。

## 2026-09-22 邮箱必填与验证（已上线）

新注册必须填写邮箱并验证；旧手机号账号登录后补全并验证邮箱，原 UID、作品与草稿保留，之后用邮箱和原密码登录。前端、API 和 Firestore Rules 同步限制未验证的普通账号；原管理员按固定 UID 豁免，不必向占位邮箱发信。65 项邮箱行为断言、30 项数据库模拟器权限断言及桌面 / 手机浏览器流程通过；真实邮件投递仍未实测；管理员换绑邮箱后按原账号编号保留权限。

如果 Firebase 邮件按钮在国内网络无法打开，老师可在验证弹窗或忘记密码页进入本站邮箱操作页，复制并粘贴邮件按钮的完整链接，由腾讯云服务器完成验证或密码重置，不需要连接 VPN。

详见 [邮箱完善实施与验收记录](reports/2026-09-22-email-verification/README.md)。邮箱功能实现提交 `899bb48`，原管理员修复提交 `260dfff`；API、静态文件和数据库规则已同步发布。全局共享资源为 `20260923-email-link-help`，智能体数据脚本为 `20260922-teaching-quality`，Service Worker 为 `20260923-v24`。

智能体的新客户端使用 `streamProtocol: events-v1`，服务端按 NDJSON 发送 `delta / done / error`；只有明确完成才进入核验与保存。发布时先更新兼容旧客户端的 API，再更新静态文件；回滚时先退回静态文件，再回滚 API。

多模态音频预览波形存放在 `assets/audio/campus-science-peaks.json`，为现有音频解码后按 180 段取峰值并归一化得到；首页不再为波形下载整段 MP3。更换原音频后需重新计算峰值、核对 `audio` 路径并更新请求缓存版本。
