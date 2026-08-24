# AGENTS.md

## Project Snapshot

- Project: `t-training`, a teacher-facing AI training site (AI agents, AI tools, prompts, learning paths, articles, design resources, classroom tools, contact feedback).
- Local path: `/Users/wangxingyu/C-C/t-training`
- Production: `https://ai.teachailab.com/`（腾讯云轻量应用服务器，Nginx + PM2/Node）
- Transitional Cloudflare URL: `https://xylaoshi.pages.dev/` returns a path-preserving temporary 302 redirect to the Tencent production origin; the Pages deployment remains available as a rollback source after reverting `_redirects`.
- Legacy Netlify URL: `https://xylaoshi.netlify.app/` is no longer production. If it still updates, Netlify is still connected to the GitHub repo and auto-deploying `main`.
- GitHub remote: `git@github.com:wxy128-git/t-training.git`
- Local SSH: `ssh tencent-teachailab` or `ssh 43.129.232.226`; `/Users/wangxingyu/.ssh/config` binds this host to `en0`, so SSH remains direct while ClashX Pro enhanced/TUN mode stays enabled.
- Primary deployment: follow `deploy/tencent/README.md`; Nginx serves static files and `t-training-api` adapts the eight `functions/api/` modules to Node on `127.0.0.1:3001`.
- Transitional deployment: push to `main` still updates Cloudflare Pages. The old URL currently redirects to Tencent via `_redirects`; reverting those rules restores the Pages site for rollback.
- Backend services: Firebase Auth (email/password) and Cloud Firestore.

## Deployment Documentation Rule

- **每次生产部署确认成功后，必须在结束任务前立即更新本文件。** 不得让已经上线的功能继续标记为“本地待上线”。
- 至少记录：上线日期、主要变更、发布提交、缓存 / 配置版本（如适用）以及生产验证结果。
- 上线后的文档修正必须提交并推送到远端，确保本地、GitHub 与生产事实一致。仅更新部署记录所触发的后续文档部署，不重复新增一条部署历史，避免递归记录。

## Architecture

- Plain HTML/CSS/JS, no bundler. Pages render skeletons (or in-code defaults), then JS pulls data from Firestore via the global `DB` object in `js/data.js`.
- Eight Cloudflare Pages Functions under `functions/api/`:
  - `auth-proxy.js` — server-side Firebase Auth proxy. **Login and registration both use this first** so users in mainland networks can authenticate without waiting for the browser Firebase SDK to time out; after proxy success, `js/auth.js` starts a background Firebase SDK sign-in to restore `auth.currentUser` when the network allows. Proxy registration returns immediately after server-side `signUp` and must never be followed by browser-side `createUser`; on an ambiguous timeout/network/5xx response, the UI asks the user to try logging in before retrying, avoiding duplicate-account confusion. The proxy derives admin status only from Firebase's authenticated email, never from a client profile field. Firebase Auth / Firestore upstream requests have a 6-second timeout; registration performs the display-name update and Firestore profile write in parallel. The proxy ID token + refresh token use `sessionStorage` when「记住我」is unchecked and `localStorage` only when it is checked; action `refresh` exchanges the refresh token for a new idToken when the proxy session expires.
  - `admin-users.js` — admin-only full deletion of a user (both Authentication account and Firestore profile). Requires a Firebase service account configured via Cloudflare environment variables.
  - `rss-proxy.js` — news-page RSS fetcher with a fixed server-side source allowlist. The browser sends a source key, not an arbitrary URL; redirects are rejected, responses are capped at 1 MiB and validated as RSS / Atom. It keeps a 30-minute in-memory cache plus a 24-hour stale fallback. Do not restore browser fallbacks to public CORS / RSS conversion services or accept arbitrary upstream URLs, otherwise SSRF and domestic-network reliability regress.
  - `agent.js` — 智能体后端代理（2026-06-09；2026-07-09 加多模型路由）：持 `DEEPSEEK_API_KEY` 转发到 DeepSeek（model `deepseek-v4-flash` + `thinking:{type:'disabled'}` 非思考模式；旧名 `deepseek-chat` 于 2026/07/24 停用，已于 2026-06-29 迁移），也可持 `ZHIPU_API_KEY` 转发到智谱 GLM-5.2（model `glm-5.2`）。用 `accounts:lookup` 校验 Firebase idToken 防盗刷，把上游 SSE 解析成纯文本增量流式回传。前端 `agents.html` 的 `callAgentAPI()` POST `{ messages, idToken, agentId }` 调用它。默认 DeepSeek；`DEFAULT_ZHIPU_AGENT_IDS` 内的高推理/结构化智能体在配置 `ZHIPU_API_KEY` 后优先走 GLM-5.2，GLM 失败且 DeepSeek 可用时自动回退。响应头 `X-Agent-Provider / X-Agent-Model / X-Agent-Fallback-From` 供前端显示实际模型，header 值必须保持 ASCII key。**限流 (2026-06-29)**：`checkRate(uid)` 软限流——同一登录用户 60 秒内最多 `RATE_MAX=12` 次，超出返回 429 `{ok:false,msg:"提问太频繁啦，请约 N 秒后再试～"}`（前端 `callAgentAPI` 的 `!res.ok` 分支已会显示该 msg，无需改前端）。实现是**单实例内存** `Map`（uid→时间戳数组，>5000 条时清理过期），零配置、不占额度，挡"手滑狂点/刷接口"；Cloudflare 多实例跨服务器非 100% 精确，要"每人每天硬封顶"再升级 KV/Durable Objects。调阈值改 `RATE_WINDOW_MS`/`RATE_MAX` 两常量即可。
  - `analytics.js` — 站内统计接口（2026-07-07）：`POST {action:'track'}` 写入 Firestore `analytics_events`，`POST {action:'summary'}` 仅管理员可读聚合结果。写入/读取都走 Firebase service account，前端不需要也不应开放 `analytics_events` 的匿名写规则。事件只记录访问和功能动作（page_view / agent_run / workbook_* / multimodal_*），不记录智能体输入、生成正文、备课本内容、IP、userAgent 或屏幕指纹信息。
  - `works.js` — 我的备课本代理（2026-07-09）：`POST {action:'list'|'create'|'rename'|'delete', idToken, ...}`，先用 Firebase `accounts:lookup` 校验登录用户，再用 Firebase service account 访问 Firestore `works`，并强制只能读写当前 uid 的内容。前端 `DB.saveWork/getMyWorks/renameWork/deleteWork` 优先走 `/api/works`，失败时才退回浏览器 Firestore SDK；解决不连 VPN 时备课本能进页面但内容加载不出来的问题。
  - `tools.js` — 公开工具清单同源代理（2026-07-16）：`GET /api/tools` 由服务端读取 Firestore `tools`，只返回卡片所需字段并按 `order` 排序；腾讯云单进程内使用 5 分钟内存缓存，刷新失败时最多回退 1 小时旧缓存。前端 `DB.getTools()` 在普通页面按“同源代理 → 浏览器 Firestore → 本地 19 项”回退；管理后台仍直接读 Firestore，避免编辑后命中公开接口缓存。
  - `content.js` — 公开内容同源代理（2026-07-19；2026-08-23 加页面文案）：`GET /api/content?type=announcements|articles|paths|prompts|resources` 由服务端读取公开 Firestore 内容；`type=pageCopy&id=<pageId>` 只允许 12 个固定页面 id，并以 `no-store` 返回对应 `page_copy` 文档，不进入旧缓存。腾讯云单进程内对原有公开列表使用 5 分钟内存缓存，刷新失败时最多回退 1 小时旧缓存。普通页面优先使用它，解决国内网络下浏览器 Firestore 不稳定的问题。文章列表使用带 `status == published` 条件的结构化查询，与 Firestore Rules 的“公开只读已发布文章”约束一致；文章详情支持 `id`，草稿统一返回 404。管理后台仍直接连接 Firestore。
- Frontend always calls these via `/api/...` paths.

## Deployment History

- **2026-08-24（数字成员个人工作台，本地待上线）**:
  - `agents.html` 的 17 个表单型数字成员工作台从“参数面板”重构为“任务简报 → 成员处理 → 教师核验”：工作台顶部持续显示成员肖像、在岗状态和三阶段进度，左侧由成员用第一人称了解任务，右侧明确标注为该成员的交付区；对话型成员保持原有对话流程。
  - 每位成员只把最关键的 1–2 项作为主简报，学科、年级、课时等背景压缩为一行，其余既有参数收进“展开全部参数”；所有原字段、草稿保存、必填校验、项目背景复用、模型调用、结果编辑与备课本保存逻辑继续保留。教学设计助手使用“任务已说清，开始起草”，交付区持续提示 AI 仅提交初稿、需由教师核验。
  - 已按选定设计稿完成 1440×1024 桌面视觉对照和 390×844 真实手机视口检查，手机页面宽度与滚动宽度均为 390px；参数展开、任务摘要同步及三阶段切换通过浏览器交互验证。Service Worker → `VERSION=20260824-v16`；尚未部署生产。

- **2026-08-24（智能体目录渐进展示，本地待上线）**:
  - `agents.html` 默认页从“19 人连续陈列”改为“4 位推荐成员 + 5 个教研部门入口”：只让推荐成员使用大幅肖像，部门目录以职责说明、成员数量和少量头像预览建立团队索引；点击部门后只展示该部门 2–5 位成员，搜索仍直接返回匹配成员，另保留次要的“查看全部 19 位成员”入口。
  - 首屏右侧取消 5 张重复的“今日在席”人脸，改为纯文字团队索引；部门筛选、`?cat=` 深链、19 个智能体、工作台、模型调用和备课本流程均未改动。手机 390×844 默认页、部门视图、全部成员和搜索视图均无横向溢出。
  - 页面文案新增团队索引、团队总览与部门目录字段；`js/site-copy.js` 缓存版本 → `20260824-agent-directory`，Service Worker → `VERSION=20260824-v15`。本地站点、函数与腾讯云适配检查分别通过 13 页、48 项和 8 项断言；尚未部署生产。

- **2026-08-23（全站文案后台化、数字教研团队与真实活页备课本，已上线）**:
  - 第一阶段页面精简覆盖首页、多模态工作坊、智能体空间、课堂工具、AI 资源精选、课件素材、AI 资讯、学习路径、文章列表与详情、提示词库和备课本。新增 `js/site-copy.js`，以固定字段定义、长度限制和本地默认值管理 12 个页面的关键文案；普通页面经 `/api/content?type=pageCopy&id=...` 读取，管理员在后台「页面文案」面板编辑。`page_copy` Firestore 规则已单独编译并发布；本地预览使用浏览器隔离存储，不会误写线上 Firestore。
  - 智能体空间把 19 个功能卡重构为具有真实人物肖像、身份、分工和开场表达的「数字教研团队」，保留搜索、分类、推荐、深链、工作台和全部模型调用逻辑。19 张发布 JPG 共约 2.4 MB，单张均低于 240 KB。
  - `workspace.html` 从圆角卡片工作台升级为现代 A4 活页备课夹：藏蓝布纹书脊、金属环、打孔纸、页边与章节签形成真实装订关系；默认目录视图支持全部 / 文稿 / 对话 / 核验，原卡片视图保留为横线散页，复制、PDF、Word、Markdown、重命名和删除收进页侧菜单，查看成果时以抽出完整活页的方式打开。桌面 1440px 与手机 390×844 均无横向溢出。
  - 本地预览服务器新增认证与公开内容代理，解决本地登录时「认证代理请求失败」；后台页面预览、文案本地保存与全站默认回退已验证。缓存版本：`css/style.css` / `js/auth.js` → `20260823-content-team-workbook`；`js/data.js` / `js/site-copy.js` → `20260823-page-copy`；Service Worker → `VERSION=20260823-v14`。
  - 实现提交：`a5eb5c5`（`上线全站文案管理与数字教研工作台`）；生产验收脚本提交：`aa8d25b`（`更新本轮生产验收断言`）。腾讯云发布目录 `/home/ubuntu/t-training/releases/20260823-content-team-a5eb5c5`，回滚备份 `/home/ubuntu/t-training/backups/20260823-pre-content-team-a5eb5c5`。
  - 发布采用 3002 候选 API + Nginx 热切换，候选通过健康、工具、认证守卫和备课本守卫检查后，正式 API 回到 3001；服务器 101 个静态文件、10 个 API 文件与发布清单 SHA-256 零差异。公网生产检查 86 项通过，GitHub `Site quality` 为 passing，Cloudflare 旧地址继续保留路径与查询参数 302，`pm2-ubuntu` enabled/active，`edu-media` / `t-training-api` 均 online 且零重启，两个站点均返回 200。

- **2026-08-22（修复普通用户登录成功后的整屏闪烁，已上线）**:
  - 根因：第一阶段把登录成功全屏欢迎层缩短到约 420ms，但该层自身仍有 0.32s 入场动画，刚出现就退出；退出前的 `settling` 状态还会把背景从深色瞬间切成接近不透明的浅色。两者叠加后，用户感知为点击登录后“整页闪一下”，并非页面重新加载或登录失败。
  - 高频登录不再使用全屏欢迎层：认证成功后立即原地刷新账户界面并派发 `authRefresh`，以持续约 2.2 秒的底部非阻塞提示显示“登录成功，欢迎回来”，备课本继续原地加载。低频注册仍保留欢迎层，但改为立即提供稳定遮罩、约 900ms 可读停留后淡出，删除整屏浅色切换；全局 reduced-motion 规则继续生效。
  - 实现提交：`33f7313`（`修复登录成功后的页面闪烁`）。静态发布目录 `/home/ubuntu/t-training/releases/20260822-login-transition-33f7313`，回滚备份 `/home/ubuntu/t-training/backups/20260822-pre-login-transition/www`。缓存版本：`css/style.css` / `js/auth.js` → `20260822-auth-transition`，Service Worker → `VERSION=20260822-v9`。
  - 本地 390×844 隔离 Chrome 逐帧检查确认：登录弹层关闭后不存在全屏欢迎层，成功提示保持可见、无横向溢出；注册层全程保持同一深色遮罩并平滑淡出。站点、函数、腾讯云适配测试继续通过；公网检查 79 项通过，旧 Cloudflare URL 保留路径 302 正常，`pm2-ubuntu` active，`edu-media` / `t-training-api` 均 online，教育媒体课程站返回 200。

- **2026-08-22（腾讯云第一阶段性能、安全与登录优化，已上线）**:
  - 新闻 RSS 改为六个固定源的服务端白名单，并加入重定向拒绝、响应体上限、RSS / Atom 校验、30 分钟缓存和 24 小时旧缓存；任意 URL 与内网地址现在返回 400，浏览器不再依赖第三方 CORS / RSS 转换服务。`/api/content` 和 `/api/tools` 增加 5 分钟进程内缓存及 1 小时失败回退。
  - 登录与注册仍优先走同源代理，但服务端上游请求最长 6 秒、注册资料并行保存；前端 8 秒超时后会恢复按钮并给出明确提示。登录成功欢迎层在代理确认后约 420ms 收起，最慢 900ms 兜底。「记住我」现覆盖代理令牌、Firebase persistence 和乐观用户快照：不勾只保留当前标签会话，勾选才跨浏览器会话保存。公开内容页不再误弹登录框，备课本和后台继续强制登录。
  - Firebase compat、Marked 和 Phosphor 图标字体全部固定版本并改为站内 `/vendor/` 资源；移除运行期 Google Fonts，改用系统 UI / 等宽字体栈。Nginx 已开启 HTTP/2、gzip、静态资源 30 天缓存和带版本 vendor 1 年缓存；HTML 与 Service Worker 保持不缓存。缓存版本：共享 CSS / JS 查询参数 `20260822-phase1`，Service Worker `VERSION=20260822-v8`。
  - 通过候选 API 端口和 Nginx 热切换完成无中断发布；PM2 的 systemd 进程树已修复为 `active (running)`，同机 `edu-media` 与 `t-training-api` 均在线。发布目录 `/home/ubuntu/t-training/releases/20260822-phase1-34c206a`，回滚备份 `/home/ubuntu/t-training/backups/20260822-pre-phase1`。
  - 实现提交：`34c206a`（`实施腾讯云第一阶段性能与登录优化`）。本地站点、函数和腾讯云适配测试分别通过 11/13、17、8 项断言；公网检查 76 项通过。干净 Chrome 实测首页冷加载约 1.51 秒（优化前审计约 3.04 秒），工具、资讯、备课本和后台无脚本错误或横向溢出；CSS 经 HTTP/2 + gzip 返回，vendor 长缓存命中，六个 RSS 源均可用，SSRF 测试返回 400；教育媒体课程站保持 200。

- **2026-08-21（Cloudflare 旧地址启用 302 临时跳转）**:
  - `https://xylaoshi.pages.dev/` 已通过 Pages `_redirects` 临时跳转到 `https://ai.teachailab.com/`；`/*` 使用 `:splat` 保留原路径，查询参数由 Cloudflare 原样传递，旧 `/main` 直接跳到新站 `/resources`，避免多一次跳转。
  - 当前使用 302 而非 301，便于观察期内快速回退；撤销 `_redirects` 两条规则并重新部署即可恢复 Cloudflare 站点。已有旧站登录态与新域名不共享，用户首次到达新域名时可能需要重新登录一次。
  - 发布提交：`5561d11`（`将Cloudflare旧站临时跳转到腾讯云`）。本地站点、12 项函数回归和 7 项腾讯云适配测试通过；线上实测旧站首页、`/agents?from=old` 与 `/main` 最终分别到达新站对应地址且返回 200，新站首页保持 200。

- **2026-08-21（腾讯云上线后修复管理员用户列表）**:
  - 根因：管理员登录已走 `/api/auth-proxy`，但后台首页统计和“用户列表”仍通过浏览器 Firebase SDK 直连 Firestore；国内网络失败时 `DB.getUsers()` 静默返回空数组，误显示“暂无注册用户”。数据没有丢失。
  - `functions/api/admin-users.js` 新增管理员专用 `listUsers` 动作：先用 Firebase idToken 校验 `admin@xylaoshi.com`，再以 service account 分页读取 Firestore `users`，只返回用户资料白名单字段；单页 300、最多 20 页，并防重复分页令牌。`admin.html` 的首页统计和列表统一改走该同源接口，失败时显示真实错误，不再伪装成零用户。
  - 发布提交：`aaef06b`（`修复管理员用户列表加载`）。函数回归增至 12 项，腾讯云适配 7 项，公网生产检查 67 项全部通过；服务器发布清单 SHA-256 零差异，只读实测 Firestore `users` 共 231 条，未输出任何用户资料。

- **2026-08-21（迁移腾讯云主站，已上线）**:
  - 新主站 `https://ai.teachailab.com/` 部署到与教育媒体课程站共用的腾讯云轻量应用服务器；静态发布目录 `/var/www/t-training`，API 目录 `/home/ubuntu/t-training/app`，PM2 进程 `t-training-api` 仅监听 `127.0.0.1:3001`。现有 `edu-media` 进程和课程站 Nginx server block 未改动。
  - 新增 `server/tencent-api.mjs`，把 8 个 Cloudflare Pages Function 的 Web Request/Response 适配到 Node 22；新增白名单部署包脚本、PM2/Nginx/环境变量模板、适配层回归测试和 CI 检查。Firebase service account 已以权限 `600` 的服务器环境变量配置并通过 OAuth + Firestore 只读验证；DeepSeek 密钥从同服务器现有安全配置复用。腾讯云当前未配置不可回读的 Cloudflare `ZHIPU_API_KEY`，相关智能体按既有代码自动回退 DeepSeek。
  - DNS `ai.teachailab.com A 43.129.232.226` 已生效；Let's Encrypt ECDSA 证书已签发并启用 HTTP→HTTPS，证书到期日 `2026-11-19`，`certbot.timer` enabled/active 自动续期。PM2 dump 包含 `edu-media,t-training-api`，`pm2-ubuntu.service` enabled 供开机恢复。
  - 主域名 canonical / OG / sitemap / robots 已切到腾讯云；Cloudflare 与 Netlify 旧地址显示迁移提示但不强制跳转。缓存版本：`js/assistant.js?v=20260821-tencent`，`sw.js VERSION=20260821-v7`。
  - 发布提交：`e9b9942`（`迁移教师培训网站至腾讯云`）。本地站点、函数与腾讯云适配回归全部通过；服务器发布清单核对 65 个静态文件、10 个 API 文件且 SHA-256 零差异；公网 `scripts/check-production.mjs` 67 项断言通过；并发 40、400 请求测试全部成功；腾讯云新站、Cloudflare 旧站和教育媒体课程站均返回 200。

- **2026-07-19（全站第一轮安全、国内网络与质量改造）**:
  - 新增 `js/safe-render.js`，所有 Firestore、社区、RSS、用户资料与 Markdown 输出统一经过转义、URL 校验或 HTML 白名单清洗；管理后台、文章、提示词、资源、路径、工具、资讯、智能体和备课本的危险渲染点已收口。
  - `auth-proxy.js` 新增同源密码重置、服务端资料字段清洗、管理员身份服务端推导和登录/注册/重置/刷新软限流；普通页面的公开内容改走 `/api/content` 同源代理。认证接口不再返回通配 CORS。
  - 新增根目录 `firestore.rules`、`firebase.json`、`.firebaserc`，规则按管理员、用户本人、公开已发布内容、社区投稿、备课本和统计集合分权。规则不会随 Cloudflare Pages 自动发布，修改后必须单独运行 `npx --yes firebase-tools@latest deploy --only firestore:rules`。
  - 全站内部链接和 canonical 改为无 `.html` 路由；`main.html` 保留兼容跳转，`/main` 由 `_redirects` 301 到 `/resources`。新增 `robots.txt`、`sitemap.xml`、首页 WebSite 结构化数据和文章动态 Article 元数据。
  - 多模态工作坊首屏图片换成 1200px Web JPEG，初始图片约从 8 MB 降到 0.7 MB；大 PNG/GIF 源素材继续保留，详情按需加载。
  - 登录、抽屉、投稿、案例、备课本和联系弹窗补充 dialog 语义、焦点回收、Tab 锁定与 Esc 关闭。新增全局安全响应头、`scripts/serve.mjs`、`scripts/check-site.mjs`、`scripts/test-functions.mjs` 和 GitHub Actions 质量检查。

- **2026-05-30**: Migrated off Netlify after the team credit limit was exceeded; rewrote the three Netlify Functions as Cloudflare Pages Functions (Node `crypto`/`Buffer` swapped for Web Crypto API + `atob`/`TextEncoder`).
- **2026-05-31**: Removed the legacy `netlify/functions/` directory once CF was stable; configured `FIREBASE_SERVICE_ACCOUNT` on CF so admin user deletion works. Editorial visual redesign + four classroom tools shipped.
- **2026-06-01**: Hamburger drawer replaces 1080px-and-below horizontal scroll nav. Four more classroom tools added (groups / seating / applause / whiteboard). Paths and articles split into warm-vs-cool color families. Admin gets a 设计资源 management panel; resources migrate to Firestore.
- **2026-06-02**: Firestore rules updated to include `resource_categories`. Path gradients enforced at render time by slug, bypassing any legacy data in Firestore.
- **2026-06-04**: Per-page OG share cards shipped (10 editorial 1200×630 JPGs under `assets/og/`, generated from `assets/og/template.html` via headless screenshots — see "SEO / OG"). Added `twitter:card`/`twitter:image` + `og:image:width/height` to all content pages; added missing `canonical` to `index.html`. CSS got a self-contained "Refinement layer" at the end of `style.css` (softer card motion, springy button press, more editorial spacing, CSS-only scroll-reveal). `style.css` is now cache-busted with `?v=YYYYMMDD` on every page — bump it whenever the stylesheet changes.
- **2026-06-09**: 新增「智能体空间」(`agents.html` + `js/agents-data.js`) — 19 个面向中小学教师的 AI 智能体，分备课设计 / 课堂教学 / 作业评价 / 班级家校 / 教师发展五类，含生成式（填参数）与对话式两种工作台。模型调用统一收口在前端 `callAgentAPI()` → 后端 `functions/api/agent.js`。已加入主导航（`renderNav` 的 `agents` 项）、页脚与首页功能卡；OG 卡 `assets/og/agents.jpg` 已按 `template.html` 流程生成。智能体清单纯前端维护，未进 Firestore/admin。
- **2026-06-09（下午）**: 智能体空间接入 **DeepSeek**。新增 `functions/api/agent.js` 后端代理（初期 model `deepseek-chat`/V3，**2026-06-29 迁移为 `deepseek-v4-flash` 非思考模式**），前端 `callAgentAPI()` 从演示 mock 改为真实流式调用。需在 Cloudflare 配 `DEEPSEEK_API_KEY`（Secret），配后需重新部署一次才生效。智能体的角色设定取自 `js/agents-data.js` 各项的 `system` 字段；表单输入由前端 `buildUserPrompt()` 拼成 user 消息。**更新 (2026-06-19)**：19 个 `system` 已从一句话角色**扩写为结构化提示词**（角色 + 任务 + 输出结构〔复用各自 `sample` 章节〕+ 约束〔对齐《2022 课标》/大陆语境/可操作〕+ 语气，约 180–250 字），「复制提示词」复制的因此是完整可用提示词；`agents-data.js?v=20260619-prompts`（index.html + agents.html 同步）。同日**全站文案改"人机协同"口径**：去「完全免费」「一键生成」「即出结果」，统一为「AI 起草初稿 / 教师修改定稿」（首页价值条 →「人机协同 · AI 起草，你来定稿」、how-to「30 秒出初稿」、卡片 chip「AI 起草」等，index.html + agents.html）。
- **2026-06-09（接入后修两个上线 bug）**: ① 后端流式转发必须用 `TransformStream`+`waitUntil`——最初用 `ReadableStream.pull` 在 CF Workers 上返回 200 但 body 全空（前端表现为「转一下没内容」）。② 生成按钮 form 的 `onsubmit` 必须写成 `runForm(...); return false`——`runForm` 是 async，返回 Promise（恒 truthy），若写 `return runForm(...)` 无法阻止表单默认提交，会导致每次点「开始生成」**整页重载**、登录态闪断、输出被刷掉（症状：闪一下、右上角登录→用户名、第二次起无输出）。**勿改回。**
- **2026-06-10（智能体空间 UI 优化）**: ① 工作台：form 左参数栏 `sticky` 吸顶（缓解与右侧长结果的高度差）；结果区加「编辑」按钮 `toggleEdit`（渲染态 ↔ 原始 Markdown 文本框，可改后重渲染）；chat 改为独立聊天窗口（固定高度 `min(66vh,600px)`），流式输出仅在 `chat-stream` 内部 `scrollTop` 滚动，**不再带动整页与底部 footer**（修「生成时页面抖动」）。② 导航：`renderNav` 中 `agents` 项 label 改为「智能体空间」，加 `nav-feature` class + 闪光图标引导点击（桌面实心朱砂药丸 + 脉冲动效；抽屉内 `brand-soft` 轻量样式）；因改 `auth.js`/`style.css`，全站 HTML 缓存版本号已 bump 到 `auth.js?v=20260610-navfeature` / `style.css?v=20260610`。③ 卡片墙从 19 卡平铺改为 `renderHome`（精选 + 5 类分区），降低选择过载；筛选/搜索走 `renderFiltered` 单层网格。
- **2026-06-15（修登录闪烁 + 删案例展示 + 首页 Hero 改版）**: 三项一并上线。
  - ① **修登录态闪烁**：Firebase 登录态异步从 IndexedDB 恢复，页面首帧 `_currentUser` 还是 `null` → 先按「未登录」渲染再回填，导致切页时右上角「登录」闪一下又变回用户名、管理后台先闪登录页再自动进入。修法：`js/firebase-config.js` 同步缓存「上次已确认登录用户」到 `localStorage`（key `window.LAST_AUTH_USER_KEY`，读写经 `rememberLastAuthUser` / `getLastAuthUser`），`_currentUser` 初值改为 `getLastAuthUser() || getProxyAuthUser()` 做**乐观渲染**；`onAuthStateChanged` / 代理登录 / 注册后写回，退出时清除。`admin.html` 加乐观门禁：已是 admin 的会话首帧直接进后台外壳，`initAdmin()` 数据加载仍留在 `onAuthReady` 里（确保 Firestore 请求带认证态）。**勿把 `_currentUser` 改回初值 `null`，否则闪烁回归。**
  - ② **移除「案例展示」功能**：删 `showcase.html` + `assets/og/showcase.jpg`；清掉导航/页脚链接、`PROTECTED_PAGE_NAMES` 条目、首页功能卡 + 预览区 + 数据加载、admin「案例审核」面板 + 概览「待审案例」统计、`js/data.js` 的 `getShowcases/submitShowcase/approveShowcase/deleteShowcase`。Firestore `showcases` 集合与历史数据**保留未删**（仅前端下线）。注意：文章的「教学案例」分类（`case`）与此功能无关，未动。
  - ③ **首页 Hero 改两栏**（`<section class="hero hero-split">`）：左文案 `.hero-text` + 右「本周精选 · 智能体空间」推荐卡 `.hero-card`，填补右侧大块空白；删掉写死的「8+ 提示词 / 14+ 工具」数字统计（旧 `.hero-highlights`，会过时且数小显单薄），改为价值标签 `.hero-values`「完全免费 / 持续更新 / 一线教师实测」；顺带修复删案例展示后该行「两项占三列」的失衡。删除从不显示却一直 `preload` 的 `hero-teacher-workspace.jpg`。新样式在 `style.css`（`.hero-split` / `.hero-values` / `.hero-card`）。
  - 缓存版本：`auth.js` / `data.js` → `?v=20260615-rmshowcase`，`css/style.css` → `?v=20260615-herocard`。
- **2026-06-16（设计「加浓」+ 工具页分组 + 首页任务入口）**: 一批前端设计优化，针对「整体偏平、寡淡」和「工具页选择过载 / 首页功能导航与顶部导航重复」。
  - ① **「加浓」增强层**：`style.css` 末尾新增一块「2026-06-16 · 加浓增强层」，自成一段、可整体删除回退。内容：所有卡片（`.card/.feature-card/.tool-card/.news-card`）描边更实、阴影更明显、hover 抬升更大（治「平」）；功能卡图标块做大做实、上**饱和色 + 白图标**（配色由各卡内联 `--c` 决定，原 `.feature-tools/.feature-paths…` 淡色类已不再使用）；功能卡标题加粗、说明文字由 `--muted` 加深为 `--text`。
  - ② **工具卡图标实心化 + 配色收敛**：`.tool-card-icon` 由「淡底 `bg-X-50` + 彩色图标」改为「实心底 + 白图标」，并把原亮色 Tailwind-500 **重映射到一组暖而克制的编辑色**（藏蓝 #2c5282 / 赭石 #b08642 / 墨绿 #2d6a4f / 黛青 #356b66 / 深青 #2f6a72 / 砖玫 #a23a3a / 酒玫 #9d4e63 / 黛紫 #6a4a6b / 深靛 #3a466e），避免亮色彩虹感、贴合纸墨风。覆盖规则在加浓层里按 `.tool-card-icon.bg-*` 写。
  - ③ **工具页改「分组陈列」**（`tools.html`，治选择过载）：默认「全部」不再平铺 17 张，`renderTools()` 改为按分类分段渲染到 `#tools-grouped`（每段小标题 + 数量）；**搜索或选了具体分类**时切回单层 `#tools-grid`。筛选栏改由 `buildFilterBar()` 按「数据里实际存在的分类」动态生成（`CAT_ORDER` / `CAT_LABELS` 为准），补回了以前漏列的分类。
  - ④ **首页「功能导航」→「按教学任务进入」**（治与顶部导航重复）：8 张「栏目镜像」卡改为 **6 张任务卡**（备课与教学设计 / 课件与素材 / 课堂上课 / 作业与评价 / 家校沟通 / 入门与进阶），3 列 2×3（`.feature-grid.cols-3`），分别链向 agents / tools / classroom-tools / agents / prompts / paths——按「想做的事」而非「网站栏目」，与顶部导航错位互补。
  - 缓存版本：`css/style.css` → `?v=20260616-tasksgroup`（全站 12 个 HTML 同步）。
- **2026-06-16（导航改名 + 「我的备课本」MVP）**:
  - 导航改名：`AI工具`→`AI资源精选`、`全球资讯`→`AI 资讯`、`设计资源`→`课件素材`（nav/footer/页面标题/面包屑/kicker/admin/assistant 全对齐；nav key 不变）。
  - **「我的备课本」（saved works）MVP**：智能体「表单类」结果区新增「保存到备课本」按钮（`saveToWorkbook()` in `agents.html`，存到 Firestore `works`）。新页面 `workspace.html`（登录门 + 卡片墙 + 查看弹层 + 复制 / 导出 Word(.doc) / 导出 Markdown / 重命名 / 删除）。入口在 `renderNav` 登录态的用户名旁（`workbookLink`，桌面显示「备课本」、手机进抽屉）。`js/data.js` 加 `saveWork/getMyWorks/renameWork/deleteWork`（`getMyWorks` 用 `where uid==` + 前端排序，免复合索引）。Markdown 用 marked@9 渲染；Word 导出 = HTML blob 套 Office 命名空间存 `.doc`。
  - **依赖（必须手动做一次）**：Firebase Console → Firestore → Rules 加 `works` 集合规则（owner-only），否则保存/读取被拒。规则见本文件「Firestore Rule for works」。
  - 缓存版本：`data.js` / `auth.js` → `?v=20260616-workbook`（保存范围 MVP 初期仅 form 类；chat 类已于 2026-06-30 补上，PPT 导出留待二期）。
- **2026-06-16（卡片精修：全站统一卡片规范）**: 把各页"各写各的"卡片统一成一套「简约精美」规范（方向 A：极淡描边 + 分层柔影）。
  - 规范：圆角 **16px**、内距 **22px**、静止 = `1px solid rgba(26,22,18,0.08)` 描边 + 极淡微影 `0 1px 2px rgba(26,22,18,0.05)`（近乎贴纸）、hover = `translateY(-3px)` + **分层柔影**（`0 2px 4px… , 0 10px 20px -10px… , 0 22px 44px -20px rgba(26,22,18,0.16)`）+ 中性描边；图标块去掉彩色辉光、内圆角 12px、hover 仅 `scale(1.04)`（去旋转）。
  - 落点：`style.css` 加浓层的卡片块改成此规范（组里加入 `.resource-card`）；`.agent-card`（agents.html）、`.wb-card`（workspace.html）在各自 `<style>` 同步到同一组值（**这三类卡片样式在页面内联，改色/改卡需到对应文件**）。深色渐变卡（path-card / 文章封面）不在范围、保持原样。
  - 缓存版本：`css/style.css` → `?v=20260616-cards`（全站 12 个 HTML 同步）。
- **2026-06-17（首页改版：以智能体为主）**: 把网站重心从「资源聚合」移到「智能体平台」（定位级，第一层）。
  - **Hero 重定位**（保留原 H1「让 AI 真正走进你的课堂」）：副标题/价值条/CTA 全指向智能体，主按钮 = 进入智能体空间；右侧 spotlight 改为「试试这个智能体 · 教学设计助手」(→ `agents.html#lesson-design`)。徽标改「AI 智能体平台」；meta/og 描述同步。
  - **首页主体 = 智能体橱窗**：`index.html` 现加载 `js/agents-data.js`，用 `window.AGENTS / AGENT_CATS` 渲染「精选 4 个（`#feat-agents`，FEATURED=lesson-design/quiz-gen/homework-grader/parent-comm）+ 按教学场景 5 类（`#cat-agents`）」。删除原「按教学任务」任务卡 + 学习路径/工具/提示词/文章四个预览区（及其 Firestore 拉取与 `copyText`）；公告改为单独 `DB.getAnnouncements()`。
  - **外链与学习内容下沉**：合并为底部「配套资源」`#supp`（6 张 `.mini` 卡：学习路径/提示词库/精选文章/AI资源精选/课件素材/AI 资讯），保留不删、不再抢戏。
  - **`.agent-card` 样式迁移**：从 agents.html 内联**移到 `css/style.css`**（共享给首页橱窗 + agents.html）；agents.html 仅保留 `.agent-grid/.agent-section/.featured-grid` 等页面布局。新增 `.home-feat-grid/.home-cat-grid/.mini/.cat-sub` 等首页橱窗样式。
  - 导航分组（第二层「资源 ▾ 下拉」）尚未做，待定。缓存版本：`css/style.css` → `?v=20260617-agentfirst`（全站 14 处同步）。
  - **微调（同日）**：① 「AI 智能体」副标题去掉自我标榜的「这是本站的核心」→「按真实教学场景设计，填好参数就出结果。」；② hero 右侧 spotlight 卡（吆喝感重、与下方重复）改为安静的 **「AI 智能体 · 5 大场景」面板**（`.hc-scenes`，`#hero-scenes` 由首页脚本按 AGENT_CATS + 计数渲染，整行可点）；③ **修首页 hero→首区「幽灵间距」**：`#announcements-section:empty{display:none}`（空公告不再占 flex gap）+ `.home-main` 顶部内距 88→48。缓存版本：`css/style.css` → `?v=20260617-herob`。
  - **签名视觉（红笔/印章，克制·更轻）**：一套「教师」母题，整页只点几处。① **手绘红笔下划线**：`.hero h1 .underline::after` 改为内嵌 SVG 笔触（data-URI，朱砂、细），用于首页 H1「你的课堂」。② **印章徽记** `.seal`（朱砂双线、微旋转）盖在智能体卡右上角 `.card-seal`。③ **红笔对勾**（已于 2026-06-17 回滚——观感不佳，hero 价值条恢复 Phosphor 图标；`.rp-check` 样式已删）。母题样式在 style.css「签名视觉」块。**更新 (2026-06-19)**：首页改版后用的是**实心朱印**（`.hp-seal*`，朱砂阴文楷体）；为与首页统一，**agents.html 在自己的内联 `<style>` 里把 `.seal` 覆盖成同款实心朱印**（`.seal` 仅 agents.html 在用，安全），「常用推荐」精选卡盖「精选」印（`cardHtml(a,false,true)`），分区卡仍按用量盖「热门」印。**更新 (2026-07-08)**：页眉独立「甄选」印已移除，勿恢复 `agents-head-seal`。另：**全站轻量一致层**——`style.css` 加了 `body::before` 稿纸纹理（固定·极淡·顶部加重），并清除了子页残留冷色（Tailwind 石板灰/靛蓝→编辑式暖调）；`css/style.css?v=20260619-texture`。
  - **印章改为「热门」按使用频率（2026-06-17）**：原固定 4 个「精选」印 → 改为**全站使用频率最高的 2 个**盖「热门」印，自动顶替。计数：智能体每次「生成/对话」成功后 `DB.bumpAgentUsage(id)` 写 Firestore `agent_usage/{id}.count`（`FieldValue.increment`）；`DB.getTopAgents(2)` 读出 Top-2。`window.TOP_AGENTS` 先用种子 `['lesson-design','quiz-gen']`，数据返回后覆盖并重渲染。**显示去重**：homepage 在 `#feat-agents` 盖；agents.html 在**分区卡**盖、**「常用推荐」行传 `cardHtml(a,false)` 不盖**（避免同一智能体出现两次被盖两个印）。无 `agent_usage` 规则/数据时回退到种子，不报错。缓存版本：`data.js`/`css/style.css` → `?v=20260617-hot`。

- **2026-06-17（提示词并入智能体 + 悬浮助手重绘）**:
  - **撤「提示词库」栏目，并入智能体**：从导航 (`renderNav`)、页脚、首页「配套资源」移除「提示词库」入口；智能体工作台头部新增 **「复制提示词」** 按钮（`copyAgentPrompt()`，复制当前智能体的 `a.system`，供老师拿到别处用）；`openAgent` 里记 `window._wsAgent`。**`prompts.html` 文件保留**（直链可达、admin 社区提示词面板仍在），只是退出主 IA——如要彻底删页/删 community_prompts 再单独定。
  - **悬浮助手重绘 + 改定位**（`js/assistant.js` + style.css）：卡通吉祥物 → **克制小药丸**「🧭 需要帮忙？」；面板从「AI 教学助教」改为 **「网站向导」**（帮你找智能体/工具/路径）；答案改为**优先引导到对应智能体**（备课→`#lesson-design`、出题→`#quiz-gen`、家校→`#parent-comm`），清掉对已撤提示词库的引用；**去掉打开/提问的登录门槛**（找功能不需登录；联系我们仍需登录）。删除全部 `.assistant-mascot/.mascot-*/.assistant-mini-*` 吉祥物 CSS。`assistant.js` 首次加上缓存版本号 `?v=20260617-guide`（全 13 页）。
  - 缓存版本：`css/style.css` / `js/auth.js` / `js/assistant.js` → `?v=20260617-guide`。

- **2026-06-30（备课本闭环 + 资源导航分组）**:
  - `agents.html` 的 chat 工作台新增「保存到备课本 / 复制对话 / 清空」操作条；保存时把 `_chatHistory` 整理成 Markdown 对话稿，继续写 Firestore `works`，不新增集合或规则。修正聊天历史里的 assistant 消息：从 `target.textContent` 改为保存 `callAgentAPI()` 流式返回的原始 Markdown，避免后续上下文和保存稿丢失标题、列表、表格标记。
  - 表单类保存补充 `workType:'draft'`、`agentType`、`inputs`；对话类保存补充 `workType:'chat'`、`agentType:'chat'`，标题优先取首条用户消息片段，便于在备课本里检索。
  - `workspace.html` 升级为可管理的「我的备课本」：关键词搜索、按内容类型（全部 / 生成文稿 / 对话记录）筛选、按智能体筛选、排序（最近更新 / 最近保存 / 标题 / 智能体名称）、筛选空状态；查看弹层底部新增「继续用该智能体」以及复制 / PDF / Word / MD 快捷操作。
  - 共享导航 `renderNav()` 改为「首页 / 智能体空间 / 课堂工具 / 我的备课本 / 资源 ▾ / 联系我们」；资源下拉收纳 AI资源精选、课件素材、AI 资讯、学习路径、精选文章、提示词库（`prompts.html` 从主导航退出后重新作为二级资源入口保留）。移动端抽屉同步分「导航 / 资源 / 其他」。
  - 缓存版本：`css/style.css` → `?v=20260630-workbook-nav`，`js/auth.js` → `?v=20260630-nav`（全站 HTML 同步）。

- **2026-07-02（多模态工作坊上线）**:
  - 新增 `multimodal.html`，导航中放在「智能体空间」后面，定位为本站自有功能页；首版只展示案例、生成流程和提示词，不在站内调用图片/视频/音频生成 API，避免消耗平台成本。
  - 新增 `media-player.html` 作为受限本地媒体播放器，只允许加载 `多模态素材/` 下的相对素材路径，供案例弹窗内播放本地视频。
  - `多模态素材/` 中发布优化后的静态素材：古诗意境图、英语情景对话动画 web 版、科学实验三帧 PNG、科学实验 web MP4 和 GIF 预览。源图、分段视频、原始大文件等中间素材由 `.gitignore` 排除，避免误发布大体积工作文件。
  - 科学实验案例采用「关键帧 1/2/3 + 可灵 1→2、2→3 首尾帧」流程；页面内用 GIF 做 16:9 轻量预览，按钮打开压缩后的 MP4 原视频。弹窗视频区域固定 `aspect-ratio:16/9`，避免被右侧长提示词拉高形成黑屏感。
  - 本次同时保留登录闪烁优化：`js/auth.js?v=20260701-authsmooth` 继续通过欢迎层、`authChanged` 和原地刷新减少登录完成时的整页闪动。

- **2026-07-02（多模态工作坊案例补充）**:
  - 「数学概念动效脚本」改为页面内 CSS 动效案例（不新增外部媒体）：`demo:'fraction'` 触发 `fractionDemoMarkup()`，用 4 步循环展示“整体 → 平均分成 4 份 → 取 1 份 → 1/4”。详情区加 `has-demo` 并固定 16:9；遵守 `prefers-reduced-motion`，降级为静态最终帧。
  - 「班会主题海报」新增发布素材 `多模态素材/class-meeting-cooperation.png`，作为“学会合作”班会封面背景。案例强调“AI 只生成无字背景图，中文标题/班级/日期由教师后期添加”，避免模型直接生成中文文字和真实学生肖像。
  - 「历史情境观察图」新增发布素材 `多模态素材/history-market-observation.png`，用于学生观察陶器、布匹、谷物、农具、衡器、服饰和市集环境。案例明确该图是 AI 情境观察材料，不能替代真实史料；课堂结论要回到教材、文献或真实图像资料中验证。
  - 横版教学素材可设置 `imageFit:'contain'`，详情弹窗会加 `.wide-image`，用完整 16:9 展示，避免裁掉海报留白或历史观察细节。

- **2026-07-07（站内数据看板，本地开发未上线）**:
  - 新增 `js/analytics.js`，挂到正式用户页面（不挂 `admin.html`），自动记录 `page_view`；智能体生成成功记录 `agent_run`，进入智能体记录 `agent_open`；备课本记录 `workbook_view/open/save`；多模态记录 `multimodal_case_open/video_open`。
  - 新增 `functions/api/analytics.js`，使用 Cloudflare Pages Function + Firebase service account 写入/汇总 `analytics_events`。管理员看板通过 `Auth.getIdToken()` 调 `/api/analytics` 的 `summary` 动作；非管理员不可读汇总。
  - `admin.html` 新增「数据看板」侧栏面板：近 7/14/30/60/90 天筛选，显示新增用户、唯一访客、页面浏览、登录用户活跃、智能体生成、备课本使用、多模态使用；包含每日趋势、热门智能体、热门多模态案例和登录用户使用明细。
  - 统计口径：访客以浏览器本地随机 visitorId 去重；新增用户来自 `users.joinedAt`；不保存 IP、userAgent、屏幕尺寸、时区，不保存智能体输入/输出正文，不读取备课本正文。若访问量超过当前 6000 条事件查询上限，应升级为每日预聚合集合或 KV/Durable Objects。

- **2026-07-08（智能体课程适配校验 + 账号切换清理）**:
  - `agents.html` 为涉及学科/学段的智能体新增分层课程适配预检：先校验独立学科是否适合该年级（如物理不早于初中八年级、化学不早于初中九年级、史地生不用于小学独立学科），再校验输入内容的学科归属和学段难度。覆盖：教学设计、课件大纲、微课脚本、情境导入、分层提问、概念解释、课堂活动、智能出题、作业批改、作文评改、单元组卷、错题诊断、主题班会。对明显不匹配的组合先拦截，不调用模型，例如“语文 / 小学一年级 / 一元一次方程”“小学一年级 / 函数”“物理 / 小学一年级”“小学一年级 / 新高考选科”。维护时：年级顺序改 `GRADE_LEVEL`；独立学科开设年级改 `SUBJECT_GRADE_RULES`；知识点/主题归属和最低学段改 `KNOWLEDGE_COMPATIBILITY_RULES`；某个智能体是否接入、扫描哪些字段改 `CURRICULUM_VALIDATION`。
  - `js/agents-data.js` 强化所有相关智能体的 system 提示词：生成前必须先在内部判断学科、年级/学段、课题/知识点/材料是否符合现行中小学课程体系和学生认知基础；明显不匹配时先输出“参数需要调整”和修改建议，不硬生成。`buildUserPrompt()` 也对所有接入 `CURRICULUM_VALIDATION` 的智能体追加同类校验要求作为兜底；对话式「苏格拉底助手」则要求缺学段时先追问，学段不匹配时降到前置经验。**输出约束 (2026-07-09)**：如果输入匹配，模型不得输出适配判断过程或通过性说明，必须直接进入正文；输出中避免地域政治表述，统一使用“现行课程标准 / 教材要求 / 教学实际”等中性说法。
  - `agents.html` 的智能体工作台现在监听 `authChanged` / `authRefresh`。退出、登录态变空、或已知用户切换为另一个 uid 时，会中止旧的流式回调、清空 `_lastResult/_lastInputs/_chatHistory` 和输出 DOM，并返回智能体列表，避免 A 用户生成内容在 B 用户登录后仍显示。首次打开深链且登录态刚恢复时，如果没有旧内容，不会误关空白工作台。
  - 「智能出题」知识点 placeholder 改为随学科动态切换，默认不再用“一元一次方程”作为通用示例。
  - 作业批改助手、作文评改、错题诊断新增轻量“手写作业转文字”辅助条：提示先用手机/微信/QQ/WPS/扫描工具 OCR，再遮挡姓名、校对后粘贴；提供“插入粘贴模板 / 只填空白项”按钮，分别填入题目/学生作答/作文正文/错题摘录等结构化模板。站内不接入图片识别 API，不产生多模态识别成本。
  - `js/agents-data.js` 同步调整三个批改类智能体的 placeholder / intro / system，明确输入可能来自 OCR；遇到缺字、乱码、`□` 或“疑似”标注时先提醒教师核对，不把识别错误当成学生错误。
  - 移除 `agents.html` 页眉右上角独立「甄选」印（`agents-head-seal`），避免在导航/用户名区域附近出现多余圆角矩形；卡片内「精选/热门」印保留。
- **2026-07-09（导航分层 + 多模态提示文案）**:
  - 共享导航 `renderNav()` 不再把「我的备课本」和「智能体空间 / 多模态工作坊」并列放在主导航。主导航保留站点级功能：首页、智能体空间、多模态工作坊、课堂工具、资源、联系我们；「备课本」作为登录后的个人入口放在用户名区域，移动端抽屉单独放入「我的」分组。以后不要把个人工作台入口重新放回主导航。
  - `multimodal.html` 顶部成本提示保留“不提供站内图片/视频生成接口”，去掉“也不会消耗你的智能体额度”。
  - 缓存版本：`css/style.css` / `js/auth.js` → `?v=20260709-navpersonal`（全站 HTML 同步）。
- **2026-07-09（工具页 / 备课本视觉与标题优化）**:
  - `tools.html` 从普通工具卡片目录升级为「教师 AI 工具选型台」：顶部选型页眉 + 搜索卡、任务筛选、条件筛选（免费 / 部分免费 / 中文 / 海外）、分类说明、工具适用场景。远程 `DB.getTools()` 若返回空数组或失败，保留本地 `DEFAULT_TOOLS`，避免页面变空。
  - `workspace.html` 升级为个人备课工作台：顶部统计（全部内容 / 生成文稿 / 对话记录）、卡片 / 列表视图切换、文稿式卡片、查看弹窗 meta 标签。卡片不再用左侧/顶部彩色线条；以后工具卡和备课本卡片保持干净纸张风格，分类颜色只放在分区图标、小标签等轻量元素上。
  - `agents.html` 保存到备课本前弹出标题确认框；表单类保存标题由 `buildWorkTitle()` 按学科、年级、课题/知识点/主题等字段生成，避免继续保存成「智能体名称 · 日期」。聊天类也进入同一确认流程。`workspace.html` 对旧的泛化标题做 `displayWorkTitle()` 推断显示，并把推断标题纳入搜索和导出文件名。
- **2026-07-09（智能体工作台重构 + GLM-5.2 路由）**:
  - `agents.html` 移除工作台右上角「复制提示词」按钮与 `copyAgentPrompt()`，避免把教师工作流引回提示词搬运；`window._wsAgent` 仍用于当前智能体状态。
  - 表单类工作台改为「任务参数 + 文稿工作区」：左侧参数面板独立滚动，生成后可折叠为摘要；右侧文稿区固定高度并内部滚动，顶部操作栏固定在文稿面板内。`.ws-top` 必须保持普通文档流（`position: static`），不要再设 sticky/fixed，否则滚动时会浮在工作区上方；全站只保留 `.site-header` 吸顶。移动端操作按钮用两列网格，避免文字被挤成竖排。
  - 前端 `callAgentAPI()` 现在提交 `agentId`，读取 `X-Agent-Provider / X-Agent-Model / X-Agent-Fallback-From` 显示实际模型。供应商显示名只在前端 `PROVIDER_LABELS` 映射，后端响应头用 `deepseek` / `zhipu` 这类 ASCII key。
  - `functions/api/agent.js` 新增智谱 GLM-5.2 路由：`ZHIPU_API_KEY` + `glm-5.2` + `thinking:{type:'disabled'}` + `max_tokens:8192`。默认优先 GLM 的智能体：`lesson-design`、`concept-explainer`、`quiz-gen`、`exam-paper`、`error-diagnosis`；可用 Cloudflare env `ZHIPU_AGENT_IDS` 覆盖（逗号分隔），也可用 `AGENT_DEFAULT_PROVIDER` 调整默认供应商。未配置 `ZHIPU_API_KEY` 时仍走 DeepSeek；GLM 调用失败时回退 DeepSeek。
- **2026-07-09（Netlify 旧域名迁移通知）**:
  - 旧 Netlify 地址仍然有效并随 GitHub 更新，说明 Netlify 后台还绑定同一个 repo/branch；这不是代码里仍有 Netlify Functions 或 `netlify.toml`。当前代码已无 Netlify 部署配置。
  - `js/assistant.js` 增加旧域名专用迁移悬浮通知：仅当 `location.hostname === 'xylaoshi.netlify.app'` 时显示，提示新地址 `https://xylaoshi.pages.dev/`，并提供“前往新地址 / 复制新地址”。Cloudflare 正式站不会显示该通知。通知标题保持中性“本网站已迁移”，不要使用站长姓名或昵称。
  - 退场流程：先把迁移通知发布到旧域名；确认旧域名可见后，在 Netlify 后台关闭自动部署或断开 GitHub 绑定，避免继续同步；需要留提示期就保留最后一次 deploy，准备彻底停用时再 delete site / unpublish site。不要先删除站点，否则访问者看不到迁移通知。
- **2026-07-12（现代教研工作台视觉重构，已上线）**:
  - 首页从“AI 教研周刊 / 头条 / 要闻 / 朱印”的展示型结构改为任务型工作台，全部首页专属类改用 `.th-*` 命名。结构现为：平台状态条 → 任务主张 + “备一节课”教学循环示例 → 6 个真实任务入口 → 人机协同工作协议与使用前检查 → 动态专业能力索引 → 配套资源。首页不展示虚构 KPI 或模型健康状态。
  - `css/style.css` 末尾新增“2026-07-12 · 现代教研工作台视觉基础层”：全站基调从米黄稿纸转为冷灰白 `#f3f6f8`、深墨蓝 `#17212b`；结构、数据、链接和流程状态使用教研蓝 `#245b78`，品牌、Logo、主操作与少量关键强调使用克制朱砂 `#b64235`，校验成功使用青绿 `#287a68`。关闭 `body::before` 稿纸纹理，收紧圆角、阴影和悬浮幅度。不要重新加回全站稿纸纹理，也不要把蓝色扩成泛 AI 的蓝紫渐变。
  - `agents.html` 同步为理性工作台：卡片从 `div onclick` 改成原生 `button`，朱印改为“建议起点 / 常用”状态标签；动态表单补齐 label/id、required，chips 改为可键盘操作的 `button[aria-pressed]`；支持 `agents.html?cat=<key>` 分类深链。分类颜色在 `js/agents-data.js` 收敛为蓝 / 青绿 / 砖红 / 琥珀 / 蓝灰。
  - `workspace.html` 同步减少纸张色、粗边和柔影，控制条、筛选、成果卡与弹层采用工作台规范。共享导航新增“跳到主要内容”链接，英文副标改为 `Teacher AI Practice Hub`。
  - 缓存版本：`css/style.css?v=20260712-balanced`；`js/auth.js` / `js/agents-data.js` → `?v=20260712-workbench`（相关 HTML 已同步）。
- **2026-07-12（教学项目闭环与可用性优化，已上线）**:
  - 新增 `js/teaching-projects.js`：按登录用户在当前设备保存“当前教学项目”、默认教学背景和最多 8 份“项目 × 智能体”草稿。表单输入与生成结果可恢复；单份结果在本地最多保留 8 万字符。该模块不把草稿正文上传到统计接口。
  - `agents.html` 新增教学项目条与编辑弹层（学科 / 年级 / 教材 / 课题 / 班级人数 / 学情 / 目标），表单自动带入项目背景并把相关背景传给智能体；必填错误改为字段旁文字提示。生成中、失败和重试状态明确区分，网络失败时保留输入。
  - 生成结果新增四项“教师核验清单”、结构化可用性反馈和后续任务入口；教学设计 → 练习 / 课件、错题诊断 → 针对性练习 / 反思等流程会携带当前参数。保存成果时在 `inputs` 内写入 `_projectId / _projectTitle / _reviewStatus` 等归类元数据，不新增 Firestore collection，也不要求规则迁移。
  - `workspace.html` 新增教学项目筛选、按项目排序、项目标签和“教师已核验”状态；从已保存成果继续使用智能体时，会把相应项目恢复成当前项目。首页在本机存在项目或未完成草稿时显示“继续项目 / 恢复草稿”。
  - 统计新增 `project_saved / draft_restored / generation_failed / teacher_reviewed / result_feedback / workflow_continue` 事件，只记录动作、耗时与反馈分类，不记录输入/输出正文。管理员数据看板新增按会话去重的任务漏斗、生成失败、平均耗时、教师核验与成果保存指标。
  - 窄屏导航在 ≤560px 时隐藏独立“注册”按钮（仍可在登录弹层内切换注册），优先保证登录和菜单入口完整可见。缓存版本：`css/style.css?v=20260712-usability`；`js/teaching-projects.js?v=20260712-project-flow`。
- **2026-07-13（跨智能体返回与教师核验语义，已上线；2026-08-23 全量发布再次确认）**:
  - `agents.html` 的后续任务入口不再直接切换智能体：当前版本尚未存入备课本时，先提供“保存并继续 / 暂不保存，继续 / 取消”。本机自动草稿与云端备课本状态明确区分；保存成功后用轻量指纹记录当前版本，输入、正文、核验或反馈发生变化后会重新视为未保存版本。
  - 跨智能体使用 `history.pushState` 保留工作步骤，目标工作台显示来源条；浏览器返回、顶部返回按钮和“返回上一成果”都会恢复上一智能体的项目草稿、生成正文与核验状态。普通卡片打开与深链仍使用当前 hash 路由。
  - “教师核验清单”从四个布尔复选框升级为每项“符合 / 需修改”判断，带文字状态、图标、进度条和完成结果，不以颜色作为唯一反馈。旧草稿的 `review: string[]` 会兼容为全部“符合”；新草稿保存 `review: Record<key,'pass'|'revise'>`。
  - 保存成果新增 `_reviewDecisions`，`_reviewStatus` 支持 `draft / reviewed / needs_revision`；`workspace.html` 相应显示“待核验 / 已核验 / 待修改”标签。仍复用 `works.inputs`，不新增 collection，也不要求 Firestore 规则迁移。
- **2026-07-15（PWA 基础版，已上线）**:
  - 新增根级 `manifest.webmanifest`、`sw.js`、`offline.html`、Cloudflare Pages `_headers`，以及 `assets/pwa/` 的 192 / 512 / maskable / Apple Touch 图标。应用名为「AI 教师培训中心」，短名称「AI 教研」，提供智能体工作台、我的备课本和课堂工具三个系统快捷入口。
  - 12 个正式用户页面接入 `css/pwa.css?v=20260715-pwa2` 与 `js/pwa.js?v=20260715-pwa2`；桌面导航新增可见的「安装应用」，移动端抽屉与共享页脚提供「安装到设备」，全站 `auth.js` 缓存版本同步为 `?v=20260715-pwa2`。支持 Chrome / Edge 原生安装提示、iOS“添加到主屏幕”和 macOS Safari“添加到程序坞”说明。自动安装提示只在首页等低干扰入口延迟出现，工作台页面不会主动打断编辑。
  - Service Worker 对导航使用网络优先 + 离线回退，对同源静态资源使用 stale-while-revalidate；页面缓存最多 24 项、静态缓存最多 80 项。`/api/`、授权头、Range 请求、管理页、Functions 路径及音视频全部绕过缓存，不缓存登录凭证、备课本正文或 AI 接口响应。
  - 更新不自动 `skipWaiting`：检测到新版本时提示教师先保存成果，再由用户点击“立即更新”刷新；`sw.js` 通过 `_headers` 禁止中间缓存。以后修改离线资源或缓存策略时必须同步 bump `sw.js` 的 `VERSION`；修改安装交互时同步 bump 全站 `pwa.css` / `pwa.js` 查询版本。
- **2026-08-01（PWA 安装态 App 壳层，已上线）**:
  - 手机以 standalone 模式启动时启用专属 App 壳层：适配状态栏与 Home Indicator 安全区，顶部改为紧凑页面标题，底部提供「首页 / 开始 / 备课本 / 课堂 / 更多」五栏主导航；网站普通浏览模式保持原样。
  - 安装态首页不再展示营销型长首页，改为「今日教学任务」面板：常用任务、未完成项目 / 草稿续接、教学工具入口与教师核验提醒。底部「开始」作为品牌主动作直达智能体工作台。
  - 移动端抽屉在安装态改为底部菜单，登录、联系、项目、成果等常用弹层改为底部 sheet；页脚隐藏，筛选条支持横向触控，输入字号固定为 16px 防止 iOS 自动缩放。顶部头像可打开账户菜单，登录用户在菜单内可退出。
  - `offline.html` 同步接入 App 壳层；PWA 导航图标使用内联 SVG，不依赖离线时可能不可用的外部图标字体。本地可在 `http://127.0.0.1:8765/?app-preview=1` 预览安装态，`?app-preview=0` 退出预览。
  - 缓存版本：`css/pwa.css` / `js/pwa.js` / `js/auth.js` → `?v=20260801-appshell`；`sw.js` → `VERSION = 20260801-v4`。已安装设备会先提示更新，用户确认后才切换新版本。
  - 发布提交：`1ee9893`（`优化 PWA 移动端应用体验`），推送 `main` 后由 Cloudflare Pages 自动上线；生产环境确认返回新页面缓存标记和 Service Worker 版本，`scripts/check-production.mjs` 47 项断言通过。
- **2026-08-05（PWA App 壳层第二轮改造，已上线）**:
  - 底部主导航按原生 App 信息架构重排为「首页 / 备课本 / 开始 / 课堂 / 更多」，朱砂色「开始」回到真正的中央主操作；点击后不再直接跳页，而是打开任务启动底部 sheet，可继续当前项目 / 本机草稿，或直接启动备课、练习、批改、课堂活动，并保留“全部智能体”入口。
  - 次级页面新增统一返回按钮和动态页面标题；应用栏滚动后强化层级，离线时常驻显示精简状态徽标，网络提示不再长期遮挡安装态内容。安装态隐藏与主导航竞争的悬浮助手，联系与其他功能仍可从「更多」进入。
  - 视觉验收发现外部 Phosphor 图标字体断网时会让应用栏品牌标、「更多」菜单和智能体工作台关键操作留白；安装态壳层现会把品牌、返回、关闭、菜单及工作台关键图标替换为内联 SVG，不依赖外网字体。所有 PWA 页面补充标准 `mobile-web-app-capable=yes`。
  - 新任务启动层使用原生 `dialog`、44px 触控目标、焦点语义、背景点击 / Esc 关闭、底部安全区和 reduced-motion 降级；任务点击新增仅记录任务 id 的 `pwa_task_started` 统计，不记录教师输入或成果正文。
  - Manifest 新增 `launch_handler`，优先复用已打开的应用窗口，避免重复创建多个 PWA 实例；继续保持 `standalone`、任意方向和私有数据不缓存策略。
  - 缓存版本：`css/pwa.css` / `js/pwa.js` → `?v=20260805-appshell2`；`sw.js` → `VERSION = 20260805-v5`。发布提交：`4207b30`（`优化 PWA 应用壳层与离线体验`），推送 `main` 后由 Cloudflare Pages 自动上线；生产环境确认新版页面缓存标记、中心任务启动层、底部导航顺序、Manifest `launch_handler` 与 Service Worker 版本均已生效，`scripts/check-production.mjs` 56 项断言通过。
- **2026-08-06（全站任务化与学习闭环优化，已上线）**:
  - 移动端首页改为任务优先的紧凑信息架构，常用任务两列展示，工作方法与配套资源默认收起并可渐进展开；安装提示在手机上改为页内卡片，显示时会避让悬浮向导。
  - 学习路径按登录用户在当前设备记录步骤进度，支持“继续上次学习”、单步完成标记和练习入口；不改变现有登录政策，也不新增云端用户数据。
  - 课堂工具的 9 张入口卡片全部改为原生按钮，补齐键盘焦点、退出后焦点返回、工具打开时隐藏悬浮向导及“演示模式”说明；安装态“更多”菜单仅高亮当前页，不再同时高亮“智能体”。
  - 智能体精选项不再在分类列表重复出现，19 个智能体保持唯一；工具页补齐差异化适用说明、审核日期和隐私提醒，全站“订阅”改为更准确的“内容更新登记”，页脚年份改为动态生成。
  - Service Worker 新增首页、智能体和课堂工具核心页预缓存。缓存版本：`css/style.css` / `css/pwa.css` / `js/auth.js` / `js/assistant.js` / `js/pwa.js` → `?v=20260806-ux2`；`sw.js` → `VERSION = 20260806-v6`。发布提交：`9478315`（`优化移动任务流程与学习闭环`）；生产环境 `scripts/check-production.mjs` 66 项断言通过。
- **2026-07-16（工具清单 14 / 19 不一致修复，已上线）**:
  - 根因：线上 Firestore 已有 19 项，但 `js/data.js` 的 `DEFAULT_TOOLS` 仍只有 14 项；部分用户直连 Firestore 失败或超时时会无提示落到旧兜底，因此固定只看到 14 项。
  - 本地兜底补齐可灵AI、讯飞智文、Flowin、WorkBuddy、Trae，和线上顺序一致；`tools.html` 为 Trae 补充平台分类及免费/中文标签。
  - 新增 `/api/tools` 同源代理，普通用户优先经 Cloudflare 读取公开清单，失败才尝试浏览器 Firestore，最后回到完整的本地 19 项。`data.js` 缓存版本全站同步为 `?v=20260716-tools19`。
- **2026-07-17（多模态音频案例补全，已上线；2026-08-23 全量发布再次确认）**:
  - 「校园活动开场音乐」收窄为具体的「校园科技节开场音乐」，新增发布素材 `多模态素材/校园科创序曲.mp3`。成品为 20.04 秒、MP3、256 kbps、44.1 kHz、双声道；教师已完成无人声、结尾自然和整体听感核验。
  - `multimodal.html` 新增音频案例渲染分支：卡片和详情弹层展示浏览器从真实 MP3 解码得到的振幅波形，详情使用原生音频控件且不自动播放；关闭弹层会暂停并归零。界面只展示实际核实的参数，不把提示词里的 BPM 当成测量值。
  - 新增 `multimodal_audio_play` 统计事件，单次页面会话内同一案例只记首次播放；后端允许并聚合该事件，后台明细显示为「播放多模态音频」。事件不记录音频内容或用户输入。

## Auth Lesson (Important)

**Old lesson from migration**: proxy-only login stashes an ID token in browser storage but does not immediately populate `firebase.auth().currentUser`; direct Firestore SDK calls then look unauthenticated. The storage is now `sessionStorage` unless the user explicitly checks「记住我」.

**Current fix (2026-07-09)**: login intentionally uses `/api/auth-proxy` first for speed in no-VPN mainland networks, then starts a background Firebase SDK sign-in. Features that must work without VPN should not depend only on browser Firestore SDK. The main example is「我的备课本」: `js/data.js` work methods now call `/api/works` first, and `/api/works` enforces ownership server-side with the user idToken + service account. `Auth.getIdToken()` also prefers a valid proxy token before asking Firebase SDK, and uses `/api/auth-proxy` action `refresh` to refresh an expired proxy token before falling back to Firebase SDK.

To verify full SDK auth is healthy when network allows: in DevTools console, `firebase.auth().currentUser` should eventually be non-null after login. To verify no-VPN workbook support, check `/api/works` responses instead of Firestore SDK state.

## Auth & Admin

- Admin email: `admin@xylaoshi.com`. Password is **not** in the repo — reset via Firebase Authentication if forgotten. Client UI and Pages Functions derive admin status from the authenticated Firebase email, never from a profile field.
- **Firebase Console follow-up required:** `users/{uid}` is self-writable, so Firestore rules must not grant admin rights via `get(.../users/$(request.auth.uid)).data.isAdmin == true`. Use `request.auth.token.email == 'admin@xylaoshi.com'` (or a Firebase custom claim) for every admin-only rule, then remove any rule that trusts a user-writable `isAdmin` document field.
- "Forgot password" flow not yet implemented.
- Cloudflare env var `DEEPSEEK_API_KEY` (Type: Secret) — 智能体空间（`/api/agent`）调用 DeepSeek 所需。未配置任何模型密钥时 `/api/agent` 返回 501 并提示。**改动 env 后必须重新部署一次才生效。**
- Cloudflare env var `ZHIPU_API_KEY` (Type: Secret) — 智能体空间调用智谱 GLM-5.2 所需。配置后 `lesson-design`、`concept-explainer`、`quiz-gen`、`exam-paper`、`error-diagnosis` 默认优先走 GLM-5.2；失败会回退 DeepSeek。可选 env：`ZHIPU_AGENT_IDS`（逗号分隔覆盖 GLM 智能体清单）、`AGENT_DEFAULT_PROVIDER`（`deepseek` 或 `zhipu`）。
- Cloudflare env var `FIREBASE_SERVICE_ACCOUNT` (Type: Secret) holds the full Firebase Admin SDK JSON. Watch for **leading whitespace in the variable Name** — CF does not auto-trim and it silently breaks reads. Accepted alternate names: `FIREBASE_ADMIN_CREDENTIALS`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_CREDENTIALS`, or `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`.

## Firestore Collections

| Collection | Purpose | Who can write |
|---|---|---|
| `users` | profile per uid | self or admin |
| `tools` | AI tool entries | admin only |
| `prompts` | curated prompts | admin only |
| `paths` | structured learning paths | admin only |
| `announcements` | site announcements | admin only |
| `articles` | featured articles | admin only |
| `resource_categories` | design resource categories with embedded items array (added 2026-06-01) | admin only |
| `page_copy` | 12 个固定页面的关键文案；字段、默认值与长度限制由 `js/site-copy.js` 定义 | public read；admin only create/update/delete |
| `community_prompts` | user-submitted prompts | logged-in users (create), author or admin (update) |
| `showcases` | **(retired 2026-06-15)** teacher case studies — all frontend/admin UI removed; collection + existing docs kept, no longer read or written | — |
| `tool_ratings` | per-tool 5-star ratings (not currently shown in UI) | logged-in users |
| `subscribers` | newsletter sign-ups | anyone (create), admin (read/delete) |
| `agent_usage` | 智能体使用计数（doc/agentId，`count`），驱动首页/智能体空间「热门」印章（added 2026-06-17） | read public；write 任意登录用户（`FieldValue.increment`） |
| `works` | **「我的备课本」** saved agent outputs (added 2026-06-16; expanded 2026-06-30) — `{uid, agentId, agentName, agentType, workType, title, content, inputs?, createdAt, updatedAt}` | owner only (uid == request.auth.uid) |
| `contact_messages` | contact-form submissions | logged-in users (create), admin (read/update/delete) |

Rules live in root `firestore.rules` and are deployed separately with `npx --yes firebase-tools@latest deploy --only firestore:rules`; the checked-in file is the maintenance source of truth. Rule changes do not ride along with a static or Tencent release.

**Firestore Rule for `works`**（已纳入并发布；下方仅作权限语义速查，精确约束以根目录规则文件为准）：

```
match /works/{workId} {
  allow create: if request.auth != null && request.resource.data.uid == request.auth.uid;
  allow read, update, delete: if request.auth != null && resource.data.uid == request.auth.uid;
}
```

**Firestore Rule for `agent_usage`**（已纳入并发布；智能体使用计数驱动「热门」印章）：

```
match /agent_usage/{agentId} {
  allow read: if true;
  allow write: if request.auth != null;
}
```

## Pages

| File | Purpose |
|---|---|
| `index.html` | Homepage — **现代教研工作台**。首页 CSS 继续内联并全部使用 `.th-*` 命名，避免污染子页；颜色令牌限定在 `.th-root`。2026-08-23 为减轻首屏重心移除右侧四步 / 五步流程与装饰性阶段编号，当前结构为单列任务主张 → 6 个真实任务入口 → 可折叠的 4 项使用前核验 → 6 个学习与配套资源入口；登录用户可在首屏恢复教学项目或草稿。任务卡从 `window.AGENTS` 读取真实说明并链接到对应智能体。保留：`renderNav` / `renderFooter`、公告、联系反馈、订阅、悬浮向导与分析埋点。 |
| `agents.html` | **智能体空间** — 19 人数字教研团队 + agent workspace。默认团队总览只让 `FEATURED` 4 位成员使用大幅肖像，其余能力收进 5 个教研部门目录；部门行显示职责、成员数量和少量头像预览，点击后才展示该部门 2–5 位完整人物，另有搜索与次要“查看全部 19 位成员”入口。首屏不再叠加“今日在席”人脸墙。人物入口和部门入口均保持原生 `<button>` 语义；分类筛选、`?cat=<key>` 与 hash 深链 `#agent-id` 保持兼容。Two workspace types: **form**（「任务简报 + 成员交付」；顶部显示成员肖像、在岗状态与“了解任务 → 起草初稿 → 教师核验”三阶段，左侧前置 1–2 个关键任务字段并把其余原参数收进“展开全部参数”，右侧同步任务摘要、流式接收成员初稿，继续支持草稿保存、项目背景复用、必填校验、结果编辑、复制、重新生成与保存到备课本；`.ws-top` 是普通文档流，勿设 sticky/fixed）和 **chat**（独立聊天窗口，**仅 `chat-stream` 内部滚动**、不带动整页避免抖动）。Login enforced on *use* (`openAgent` / run / send), not on browsing。Model calls funnel through `callAgentAPI()` → `functions/api/agent.js`（DeepSeek + 可选 GLM-5.2，前端显示实际 provider/model）。保存表单类和聊天类成果前均确认标题；表单类用 `buildWorkTitle()` 从输入字段生成具体标题。 |
| `multimodal.html` | **多模态工作坊** — static case gallery for image/video/audio/avatar/courseware generation workflows. It is an owned site feature placed after 智能体空间 in nav, but does **not** call paid generation APIs. Cases live inline in `CASES`; publish-ready assets live in `多模态素材/`. Video case thumbnails use static poster images; detail modals use `media-player.html` or GIF preview + MP4 link. |
| `media-player.html` | Minimal same-origin video player used by `multimodal.html`; validates `src`/`poster` params so only `多模态素材/` paths without `..` can load. Keep it static and dependency-free. |
| `tools.html` | Curated directory of **external** third-party AI products (cards link out). User-facing name **「AI资源精选」** (renamed 2026-06-16; nav key stays `tools`). Renders the complete 19-item `DEFAULT_TOOLS` synchronously first; `DB.getTools()` then uses `/api/tools` → browser Firestore → local defaults, so Firebase-unreachable users no longer drop to 14 items. Default "全部" = **grouped by category** (`#tools-grouped`); search/specific category → flat `#tools-grid`; task pills + tag pills from `buildFilterBar()`. **「教师 AI 工具选型台」改版 (2026-07-09)** — all CSS in an **inline `<style>` in tools.html** (not style.css): ① editorial chooser header (`.tt-hero`) + search card. ② Task-oriented categories: `plan` 备课·出题·检索 / `make` 课件·演示·动画 / `media` 图像·音视频·数字人 / `platform` 教研·AI 平台 (+ `more` 更多工具 fallback), each with `CAT_DESCS`/`CAT_ICONS`/`CAT_FITS`. ③ **Category + per-tool tags come from LOCAL `TOOL_META` keyed by tool NAME (NOT Firestore)**; admin 新增工具若未登记进 `TOOL_META` 会落进「更多工具」且无标签。④ Card tags: 免费 / 部分免费 / 付费 / 中文 / 海外 (`.tt-tag` variants; values are estimates and need manual audit). ⑤ Grid override: `#tools-grid, #tools-grouped .cards-grid` use `repeat(auto-fit, minmax(224px,268px))`. Design rule: do not add colored top/side bars to cards; keep category color on section icons / small tags only. |
| `classroom-tools.html` | Eight self-contained classroom widgets (see below) |
| `paths.html` | Full learning-path detail page |
| `prompts.html` | Prompt library (official + community submissions) |
| `news.html` | RSS-aggregated industry news. Nav display name **「AI 资讯」** (renamed 2026-06-16 from "全球资讯"; key stays `news`) |
| `articles.html` + `article.html` | Featured article list + detail |
| `resources.html` | Curated **external** free-asset sites (images/PNG/icons/AIGC), Firestore-backed, falls back to `DEFAULT_RESOURCES`. Nav display name **「课件素材」** (renamed 2026-06-16 from "设计资源" to avoid "资源" clash with AI资源精选; key stays `resources`) |
| `admin.html` | Admin dashboard: dashboard, **数据看板**, announcements, **页面文案**, community prompts, subscribers, **联系留言**, articles, tools, prompts, paths, **设计资源**, users。「页面文案」以 `js/site-copy.js` 的固定字段呈现 12 个页面，支持预览、保存和恢复本地默认值；生产写入 `page_copy`，本地预览写入隔离的浏览器存储。数据看板从 `/api/analytics` 拉取汇总，新增用户仍用 Firestore `users.joinedAt` 在前端按天聚合。 |
| `workspace.html` | **「我的备课本」** — per-user saved agent outputs。Self-gated；logged-in desktop entry lives in the username area，mobile drawer has a separate「我的」group。2026-08-23 使用现代 A4 活页备课夹作为页面结构：藏蓝布纹书脊、金属环、打孔纸、页边和章节签形成真实装订关系；默认成果目录视图支持全部 / 文稿 / 对话 / 核验，原卡片视图保留为横线散页。搜索、教学项目 / 智能体筛选、排序和顶部统计保留；查看、复制、PDF、Word、Markdown、重命名、删除收在页侧菜单，查看成果以“抽出完整活页”的 modal 打开。项目标签与教师核验状态保存在 work 的 `inputs._project*`；reads `works` where `uid == current user`。旧泛化标题继续由 `displayWorkTitle()` / `inferredWorkTitle()` 从 `inputs` 或正文首个 Markdown 标题推断，并用于搜索与导出文件名。 |

## Key JS Files

- `js/data.js` — `DEFAULT_TOOLS / DEFAULT_PROMPTS / DEFAULT_PATHS / DEFAULT_ARTICLES / DEFAULT_RESOURCES` are used as fallbacks/seeds; `DB` object wraps Firestore reads/writes. `getTools` prefers `/api/tools` on user pages, then browser Firestore, then the complete 19-item static list; admin stays on direct Firestore. Work-book methods (`saveWork/getMyWorks/renameWork/deleteWork`) prefer `/api/works` and fall back to direct Firestore only for local/dev or temporary API failure.
- `js/site-copy.js` — 12 个页面的可编辑关键文案注册表。每个页面只接受显式字段，包含中文后台标签、长度上限和代码默认值；`load()` 生产优先读取 `/api/content?type=pageCopy&id=...`，本地预览读取隔离存储，失败时静默回退默认值。普通页面用 `applyToDocument()` 更新带 `data-site-copy*` 标记的文本；新增或改字段时必须同步这里、页面标记、后台表单和 `firestore.rules`。
- `js/firebase-config.js` — initializes Firebase, exposes `auth` and `db`, defines `_currentUser`, `onAuthReady`, dispatches `authChanged` events.
- `js/auth.js` — `Auth` object (login/register/logout, getIdToken, **`sendPasswordReset`**), `renderNav` / `renderFooter` (every page calls these), `requireLogin`, `showAuthModal`, `showWelcomeOverlay`, **hamburger drawer state** (`openNavDrawer` / `closeNavDrawer`). The auth modal has **three views** toggled by `switchAuthTab('login'|'register'|'forgot')`: login (`#form-li`, with a 「忘记密码？」link), register (`#form-rg`), and **forgot-password (`#form-fp`, added 2026-06-17)**. Forgot flow: `handleForgotPassword()` → `Auth.sendPasswordReset(identifier)` → Firebase `auth.sendPasswordResetEmail`. **Phone-number accounts are rejected client-side** (their `tel_…@xylaoshi.tel` address can't receive mail — they must contact admin). Result shows in `#fp-msg` styled `.form-success` (green) or `.form-error` (red). The Firebase project has **email-enumeration protection ON**, so a reset for an *unregistered* email also returns success (no account leak) — only real accounts actually receive mail. Reset link lands on Firebase's own hosted reset page (no custom page needed).
- `js/analytics.js` — front-end event tracker for the admin data dashboard. Creates a random local visitor id, waits for `onAuthReady` when available, then POSTs to `/api/analytics`. Keep it non-blocking: all failures are swallowed so analytics never affects learning pages.
- `js/teaching-projects.js` — local-first teaching context and recovery layer. Stores the active project, default subject/grade profile, and up to 8 project-scoped agent drafts per logged-in user in `localStorage`. It never sends prompt/output text to analytics; saved workbook items receive only project/review metadata inside `inputs`.
- `js/assistant.js` — floating AI-assistant launcher + the contact-feedback modal that writes to `contact_messages`; also contains the Netlify legacy-domain migration notice gated to `xylaoshi.netlify.app`.

## Design Language

**Typography** — one sans family across the whole site, with no runtime web-font dependency:
- Sans: the operating-system UI stack (`-apple-system` / BlinkMacSystemFont / Segoe UI / PingFang SC / Microsoft YaHei / Noto Sans CJK fallbacks).
- Mono (digits, timestamps, kicker labels): `ui-monospace` / SFMono-Regular / Menlo / Consolas fallbacks.
- `--font-display` is aliased to `--font-sans`; hierarchy comes from weight (700–800 for display, 500 for labels) and size, not font family.

**Base color tokens** (the active values are defined in the final “2026-07-12 · 现代教研工作台视觉基础层” inside `css/style.css`):
- Background: cool laboratory gray `--soft #f3f6f8`; primary surfaces stay white.
- Ink: deep blue-black `--ink #17212b`; body text `--text #3d4a57`.
- Brand: restrained cinnabar `--brand #b64235` for the logo, primary actions and a few decisive accents. Research blue `#245b78` carries structure, links, data and workflow state; validation/success uses teal `#287a68`; warning uses amber `#a76f18`.
- Avoid generic AI-design tropes: no purple-to-pink gradients, no neon glow, no fake KPI panels, and no decorative “system healthy” indicators that are not backed by a real health check.

**Two card-color families** (introduced 2026-06-02 to give homepage sections distinct identities while staying within the editorial palette):

- **Warm "growth" family — used by learning paths** (path-card-head + path-nav-card + path-detail-head):
  - starter: `#2d4a3a → #1a3528` (deep emerald)
  - teacher: `#4a3625 → #2c1f15` (deep walnut)
  - creator: `#7a2e28 → #4d1812` (deep burgundy)
- **Cool "knowledge" family — used by article covers** (six gradients cycled by `id` hash):
  - indigo `#1f2f4a → #101a2e`
  - petrol `#1f3a3e → #102225`
  - violet `#332945 → #1c1530`
  - slate `#2c2f3a → #181a22`
  - dark plum-rose `#3d242a → #231016`
  - charcoal `#252830 → #14171d`

Both families are enforced at render time, **not** trusted from Firestore. Path renders look the gradient up from a `PATH_PALETTE[slug]` map in `paths.html`; article rendering ignores `coverColor` and hashes `id → COVER_GRADIENTS`. This means legacy Firestore values don't need to be migrated — they're simply overridden.

**Component conventions**:
- Radius scale 7 / 9 / 12 / 16 px; reserve larger radii for true overlays or large contained workspaces.
- Cards: 1px `--line` border, near-flat rest state, and at most `translateY(-1px)` on hover. Scientific rigor comes from alignment, labels, state and hierarchy—not depth effects.
- Use numbered markers only for real sequences (for example a learning path), never as decorative section counters.
- Homepage signature is now the restrained single-column task launcher; the former teaching-cycle rail was deliberately removed on 2026-08-23 to restore visual balance. Red-pen or document styling may remain in exported teaching documents, but not as the global application shell. The personal `workspace.html` is the deliberate exception: its selected A4 ring-binder metaphor may use paper, punched holes, rings and one signature “pull sheet” transition because the subject itself is a 备课本；do not spread that skeuomorphic treatment to unrelated pages.

**登录 / 注册成功反馈 (2026-08-22)**: 高频登录成功后不使用全屏过渡；`handleLogin()` 关闭弹层后立即调用 `refreshAuthUI()`（=`renderNav()`+`renderFooter()`）、派发 `authRefresh`，并用底部 toast 显示“登录成功，欢迎回来”。这避免短暂全屏层造成闪烁，`workspace.html` 仍会原地加载内容，管理员首次登录仍按页面监听器 reload。低频注册调用 `showWelcomeOverlay('register', name)`：遮罩从首帧保持稳定，卡片约 900ms 后淡出，不再使用会瞬时改变整屏颜色的 `settling` 状态。不要把登录重新接回短时全屏欢迎层。

**退出提速 + 记住我 / 登录持久化 (2026-08-22)**：①`Auth.logout()` 原地更新，不整页 reload。顺序保持 `await auth.signOut()` → 同时清除 local / session 两套代理会话和用户快照 → `refreshAuthUI()` → 派发 `authRefresh`。②「记住我」默认不勾：勾选时代理令牌、Firebase persistence 和乐观用户快照都使用 `LOCAL` / `localStorage`；不勾时三者都使用 `SESSION` / `sessionStorage`，关闭标签页后退出，更适合公用电脑。注册仍固定长期保持。浏览器存储里的快照只用于首帧 UI，服务端权限始终由 Firebase idToken 和安全规则判断。

## Navigation & Mobile

- Desktop (≥1081px): the standard horizontal `.site-nav` in `renderNav()` shows all entries.
- Tablet / mobile (≤1080px): `.site-nav` is hidden via CSS, a 40px `ph-list` hamburger button appears in `.auth-area`. Clicking it opens a right-slide drawer (`.nav-drawer`) that fades in with a backdrop. The drawer holds the full nav list with mono "导航" / "其他" kickers between sections.
- Drawer dismissal: backdrop click, ESC key, internal link click, or the close button.
- `resources.html` formerly had its own inline nav markup; it now uses `renderNav('resources')` like every other page so the hamburger works there too.

## Classroom Tools (`classroom-tools.html`)

Single-page experience. Home grid shows tool cards; clicking one swaps in its UI under `#ct-stage-content`. A back button returns home; a fullscreen toggle hides nav/footer for projector use. URL hash deep-links directly to a tool (`#countdown` / `#picker` / etc.). Transitions: home fades+slides out before stage fades+slides in (CSS `entering` / `leaving` classes + chained rAF). `prefers-reduced-motion` disables all of it.

**优化 (2026-06-19)** — ① 功能清晰度：**「音浪小球」显示名改为「音量监测」**（卡片名 + `TOOLS.balls.title` + meta；id 仍是 `balls`），说明改成用途优先「监测课堂音量、提醒安静」；转盘说明点明用于"奖励/游戏/选答案"并与随机点名区分。② 大屏高级感（重点 4 工具）：倒计时加**圆形进度环**（`.ct-cd-ring`/`#cd-prog`，`paint()` 里更新 `stroke-dashoffset`，间隔 200ms）；随机点名右侧改白卡 + 柔影、占位换图标空状态（`.ct-pk-empty`）、抽中回弹（`ct-land`）；转盘加投影 + 中奖结果卡（`.ct-wheel-win`）；座位表讲台改深色讲台牌、座位改白色椅卡 + 柔影 + 悬停上浮、地面用 `--soft`。另：**导航「智能体空间」`nav-feature` 简约化**（去常亮朱红底块与脉冲，改为朱红文字 + ✦ 图标，hover/active 才 `brand-soft` 底）；`css/style.css?v=20260619-nav`。

**新增 (2026-06-21，借鉴 ketang.cool 的教学法、单屏化创新)** — **评价量规** (`mountRubric`, `rubric`) + **课堂活动模板** (`mountRoutine`, `routine`)；共用打印助手 `ctPrint(title, bodyHtml)`（开新窗 + 教学文稿样式 + `window.print()` → 另存 PDF）。（叠加同日删除「课堂音效」后）现共 **9 个工具**。⚠️ 维护提醒：这两个工具的 CSS 在 `<head>` 内联 `<style>` 末尾（`.ct-rb-*` / `.ct-rt-*`），mount 函数在底部 `<script>` 末尾（会 hoist）。

The nine tools（「课堂音效」`applause`/`mountApplause` 已于 2026-06-21 删除——属低频气氛道具，按用户要求移除）:

1. **倒计时** — mono-numeric display **inside a circular SVG progress ring** (`.ct-cd-ring`, depletes as time runs), 1/3/5/10/15-min presets + custom MM:SS, start/pause/resume/reset, last 10s pulse (ring+number turn cinnabar), 3-beep AudioContext chime at zero.
2. **随机点名** — roster textarea (any whitespace/punctuation separator), spinning ticker before landing, white result card + iconified empty state + bounce reveal, "抽过不再抽" mode with chip-list history. Roster persists in `localStorage` (`ctPickerRoster`).
3. **小组计分板** (`mountScore`, data-tool `score`) — classroom points: 2–10 group cards, each with editable name + big mono score + −1/＋1/＋5 buttons; leader card auto-gets 👑 + cinnabar highlight; reset-to-zero; **persists to `localStorage` (`ctScoreGroups`)**. Score/count clicks full-re-render; name edits update on `input` without re-render (keeps focus). **(替换了原「转盘抽奖」`mountWheel`，2026-06-20 删除——与随机点名重复、低频。)**
4. **音量监测**（原「音浪小球」） — microphone-driven bouncing visualization for classroom-noise awareness; four themes (ball / bubble / emoji / number). See "音浪小球 details" below.
5. **随机分组** — fisher-yates shuffle + round-robin OR per-group chunking. Roster persists in `localStorage` (`ctGroupsRoster`).
6. **座位表** — grid of `rows × cols` filled from a roster, click two seats to swap, prints via `window.print()` with `@media print` rules hiding everything else.
7. **简易白板** — 6-color palette + 4 brush sizes + eraser + undo (40-frame snapshot stack) + clear + save PNG. Supports both pointer and touch input. ResizeObserver preserves the drawing across fullscreen toggles.
8. **评价量规** (`mountRubric`, `rubric`) — editable rubric grid (criteria × 优/良/合格, 可切 3/4 等级)，内置作文/口语表达/小组合作/空白模板，contenteditable 单元格 + 加减维度；`localStorage` (`ctRubric`)；「打印/PDF」经 `ctPrint`。借鉴 ketang「量规」但做成纯教师端可编辑+导出。
9. **课堂活动模板** (`mountRoutine`, `routine`) — 思维结构脚手架：KWL / 3-2-1 反思 / 思考·配对·分享，三栏彩色标题 + 引导语 + 大输入区，当堂填写；`localStorage` (`ctRoutine`)；「打印/PDF」经 `ctPrint`。把 ketang 的 KWL/3-2-1/思享汇合并为一个可切换工具。

### 音浪小球 details

- Audio pipeline: `getUserMedia({audio: { echoCancellation:false, noiseSuppression:false, autoGainControl:false }})` → `AudioContext` → `AnalyserNode` (fftSize 1024, smoothing 0.5). Each frame computes RMS over the time-domain buffer, applies a noise-floor cutoff, smooths exponentially, scales by the sensitivity slider, produces an `impulse` value in [0, 1.4].
- Ball sizes are bucketed for strong visual variance: ~38% small (sizeMul 0.45–0.70), ~44% medium (0.80–1.10), ~18% large (1.25–1.80). Every ball stores `mass = sizeMul²`.
- Physics: gravity + wall damping (0.78) + ground friction (0.96). Audio impulse is `(impulse * 26 * groundBias) / mass` — same sound throws tiny balls high, barely nudges big ones. Ball-ball collisions are mass-weighted elastic impulse with restitution 0.86; overlap separation is inverse-mass weighted.
- Controls bar: mic toggle (pulses red when active), sensitivity slider (0.3×–3.0×), count slider (5–60), 4-way theme segmented control.
- Stage uses `ResizeObserver` on `.ct-balls-stage` to react to fullscreen toggles (CSS-only size changes don't fire `window.resize`).
- `syncCanvas()` resizes the canvas backbuffer and **clamps** existing balls into the new bounds rather than rebuilding — preserves the live state through fullscreen transitions.

### Classroom Tools lesson

If a render call throws (we hit this when the bubble theme built `"rgb(...)55"` strings that aren't valid CSS colors), the next `requestAnimationFrame(loop)` line never executes and the whole animation freezes silently. Always wrap canvas render loops in `try/catch` and prefer the local `rgbaFromHex(hex, alpha, lightenAmt?)` helper over string concatenation when alpha is involved.

## SEO / OG

- Every page has `<meta name="description">`, complete OpenGraph tags (og:title / description / type / url / image + image:width/height), `twitter:card` (summary_large_image) + `twitter:image`, and `<link rel="canonical">`.
- **Per-page OG cards (done 2026-06-04)**: each content page points `og:image`/`twitter:image` at its own `assets/og/<slug>.jpg` (1200×630). Slugs: `index, tools, prompts, paths, news, articles, article, resources, classroom, agents` (the `showcase` card was deleted 2026-06-15 with the feature). `admin.html` / `main.html` are internal and have no OG card.
- **How to regenerate a card**: edit the page's entry in the `PAGES` map inside `assets/og/template.html`, serve the folder locally (`python3 -m http.server`), open `assets/og/template.html?p=<slug>` at a 1200×630 viewport, and screenshot to `assets/og/<slug>.jpg`. The template uses the editorial palette (cream + dot-grid + cinnabar italic highlight + mono kicker + bottom brand stripe). No build step, no runtime function — the cards are static JPGs.
- `assets/hero-teacher-workspace.jpg` is now **unused** — the homepage stopped preloading it when the hero went two-column (2026-06-15). The file is still in `assets/` (also unused: `assets/hero-ai-training.jpg`); safe to delete if you want, kept for now in case a future design reuses it.

## Known Quirks / Conventions

- The contact form writes directly to Firestore — no server, no email. Admin reviews via the **联系留言** panel in `admin.html`.
- Auth-protected pages are listed in `PROTECTED_PAGE_NAMES` inside `js/auth.js`. When adding a new page that needs login gating, add it there.
- **Render-time palette enforcement** is the standard pattern for cards whose backgrounds were originally stored in Firestore — see paths (slug → gradient) and articles (id-hash → gradient). When updating colors, change the local map; don't bother migrating the database row.
- `DB.getMessages()` reads `contact_messages` ordered by `createdAt desc`. The contact field uses `firebase.firestore.FieldValue.serverTimestamp()` so the order is reliable.
- Five-star tool ratings UI was removed but the `tool_ratings` collection and rules remain (in case it's reintroduced).
- **Tool icon picker (2026-06-04)**: the add/edit-tool modal's 图标 field is a curated `<select id="tool-icon">` of Phosphor classes with friendly Chinese labels, plus a live preview swatch (`#tool-icon-preview`, updated by `updateIconPreview()`). Set it via `setToolIcon(val)` — never `.value =` directly — so an icon not in the curated list (legacy tools) gets a fallback `<option>` injected instead of showing blank. To offer a new icon, add an `<option value="ph-...">中文名</option>` to that select in `admin.html`.
- Article and path data flow: if Firestore is empty, `DEFAULT_*` constants in `js/data.js` provide content. Otherwise Firestore wins.
- Resources data flow same: `resources.html` paints `DEFAULT_RESOURCES` immediately, then swaps in whatever Firestore returns. Admin saves go to `resource_categories`.
- Cache-busting query strings on `data.js` (`?v=...`), `auth.js`, and now `css/style.css` (`?v=YYYYMMDD`) are updated whenever those files change; bump the version in every page that loads them.
- The end of `css/style.css` has a clearly fenced "2026-06-04 · Refinement layer" — motion/spacing/polish overrides plus a pure-CSS scroll-reveal (`@supports (animation-timeline: view())`, degrades to fully-visible on unsupported browsers, disabled under `prefers-reduced-motion`). It's self-contained and safe to revert as a block.
- After it sits a second fenced block "**2026-06-16 · 加浓增强层**" (depth/contrast/solid icons). Two conventions live here: (a) **feature-card icon color** is driven by an inline `--c` on each `.feature-icon` (set per card in `index.html`), with `.feature-icon{background:var(--c);color:#fff}` — the old `.feature-*` tint classes are dead; (b) **tool-card icons** are forced solid by overriding `.tool-card-icon.bg-*` to a restrained warm palette. Also self-contained / revertible as a block. **The card depth in this block was later refined (2026-06-16 卡片精修) to the unified card spec** — radius 16 / padding 22 / hairline border `rgba(26,22,18,0.08)` / near-flat rest + layered soft hover shadow; the group selector now also covers `.resource-card`. `.agent-card` now lives in **`css/style.css`** (moved 2026-06-17, shared by agents.html + 首页橱窗); `.wb-card` still carries the spec **in workspace.html's own `<style>`** — so changing the card look means editing style.css (covers .card/.feature-card/.tool-card/.news-card/.resource-card/.agent-card) **and** workspace.html (.wb-card). Heads-up for audits: because of the scroll-reveal, a Playwright `fullPage` screenshot renders below-fold `.home-section`s (and grouped tool cards) at `opacity:0` — they're fine for real users; force `opacity:1` before capturing.

## Future Follow-Ups

- ~~Add a 忘记密码 flow to the login modal.~~ **Done 2026-06-17** — see `js/auth.js` notes above.
- Consider extracting the classroom-tools sub-tools into separate JS modules — `classroom-tools.html` is large (~1700 lines now).
- If we ever need real-time updates on `contact_messages`, switch the admin panel to `onSnapshot`.
- `tool_ratings` is dormant; either restore the UI or delete the collection + its security rule.
- `showcases` collection is now orphaned (feature removed 2026-06-15) — delete the collection + rule + any stored docs if it won't be revived.
