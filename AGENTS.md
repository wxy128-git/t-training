# AGENTS.md

## Project Snapshot

- Project: `t-training`, a teacher-facing AI training site (AI agents, AI tools, prompts, learning paths, articles, design resources, classroom tools, contact feedback).
- Local path: `/Users/wangxingyu/C-C/t-training`
- Production: `https://xylaoshi.pages.dev/`
- Legacy Netlify URL: `https://xylaoshi.netlify.app/` is no longer production. If it still updates, Netlify is still connected to the GitHub repo and auto-deploying `main`.
- GitHub remote: `git@github.com:wxy128-git/t-training.git`
- Deployment: push to `main` → Cloudflare Pages auto-builds and ships static files + `functions/`.
- Backend services: Firebase Auth (email/password) and Cloud Firestore.

## Architecture

- Plain HTML/CSS/JS, no bundler. Pages render skeletons (or in-code defaults), then JS pulls data from Firestore via the global `DB` object in `js/data.js`.
- Six Cloudflare Pages Functions under `functions/api/`:
  - `auth-proxy.js` — server-side Firebase Auth proxy. **Login now uses this first** so users in mainland networks can sign in quickly without waiting for the browser Firebase SDK to time out; after proxy success, `js/auth.js` starts a background Firebase SDK sign-in to restore `auth.currentUser` when the network allows. Registration still prefers the Firebase SDK first to avoid duplicate-account edge cases. Stores an ID token + refresh token in `localStorage` under `window.PROXY_AUTH_SESSION_KEY`; action `refresh` exchanges the refresh token for a new idToken when the proxy session expires.
  - `admin-users.js` — admin-only full deletion of a user (both Authentication account and Firestore profile). Requires a Firebase service account configured via Cloudflare environment variables.
  - `rss-proxy.js` — generic CORS-friendly RSS fetcher for the news page; used as one of several loaders.
  - `agent.js` — 智能体后端代理（2026-06-09；2026-07-09 加多模型路由）：持 `DEEPSEEK_API_KEY` 转发到 DeepSeek（model `deepseek-v4-flash` + `thinking:{type:'disabled'}` 非思考模式；旧名 `deepseek-chat` 于 2026/07/24 停用，已于 2026-06-29 迁移），也可持 `ZHIPU_API_KEY` 转发到智谱 GLM-5.2（model `glm-5.2`）。用 `accounts:lookup` 校验 Firebase idToken 防盗刷，把上游 SSE 解析成纯文本增量流式回传。前端 `agents.html` 的 `callAgentAPI()` POST `{ messages, idToken, agentId }` 调用它。默认 DeepSeek；`DEFAULT_ZHIPU_AGENT_IDS` 内的高推理/结构化智能体在配置 `ZHIPU_API_KEY` 后优先走 GLM-5.2，GLM 失败且 DeepSeek 可用时自动回退。响应头 `X-Agent-Provider / X-Agent-Model / X-Agent-Fallback-From` 供前端显示实际模型，header 值必须保持 ASCII key。**限流 (2026-06-29)**：`checkRate(uid)` 软限流——同一登录用户 60 秒内最多 `RATE_MAX=12` 次，超出返回 429 `{ok:false,msg:"提问太频繁啦，请约 N 秒后再试～"}`（前端 `callAgentAPI` 的 `!res.ok` 分支已会显示该 msg，无需改前端）。实现是**单实例内存** `Map`（uid→时间戳数组，>5000 条时清理过期），零配置、不占额度，挡"手滑狂点/刷接口"；Cloudflare 多实例跨服务器非 100% 精确，要"每人每天硬封顶"再升级 KV/Durable Objects。调阈值改 `RATE_WINDOW_MS`/`RATE_MAX` 两常量即可。
  - `analytics.js` — 站内统计接口（2026-07-07）：`POST {action:'track'}` 写入 Firestore `analytics_events`，`POST {action:'summary'}` 仅管理员可读聚合结果。写入/读取都走 Firebase service account，前端不需要也不应开放 `analytics_events` 的匿名写规则。事件只记录访问和功能动作（page_view / agent_run / workbook_* / multimodal_*），不记录智能体输入、生成正文、备课本内容、IP、userAgent 或屏幕指纹信息。
  - `works.js` — 我的备课本代理（2026-07-09）：`POST {action:'list'|'create'|'rename'|'delete', idToken, ...}`，先用 Firebase `accounts:lookup` 校验登录用户，再用 Firebase service account 访问 Firestore `works`，并强制只能读写当前 uid 的内容。前端 `DB.saveWork/getMyWorks/renameWork/deleteWork` 优先走 `/api/works`，失败时才退回浏览器 Firestore SDK；解决不连 VPN 时备课本能进页面但内容加载不出来的问题。
- Frontend always calls these via `/api/...` paths.

## Deployment History

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
- **2026-07-12（现代教研工作台视觉重构，本地待上线）**:
  - 首页从“AI 教研周刊 / 头条 / 要闻 / 朱印”的展示型结构改为任务型工作台，全部首页专属类改用 `.th-*` 命名。结构现为：平台状态条 → 任务主张 + “备一节课”教学循环示例 → 6 个真实任务入口 → 人机协同工作协议与使用前检查 → 动态专业能力索引 → 配套资源。首页不展示虚构 KPI 或模型健康状态。
  - `css/style.css` 末尾新增“2026-07-12 · 现代教研工作台视觉基础层”：全站基调从米黄稿纸转为冷灰白 `#f3f6f8`、深墨蓝 `#17212b`；结构、数据、链接和流程状态使用教研蓝 `#245b78`，品牌、Logo、主操作与少量关键强调使用克制朱砂 `#b64235`，校验成功使用青绿 `#287a68`。关闭 `body::before` 稿纸纹理，收紧圆角、阴影和悬浮幅度。不要重新加回全站稿纸纹理，也不要把蓝色扩成泛 AI 的蓝紫渐变。
  - `agents.html` 同步为理性工作台：卡片从 `div onclick` 改成原生 `button`，朱印改为“建议起点 / 常用”状态标签；动态表单补齐 label/id、required，chips 改为可键盘操作的 `button[aria-pressed]`；支持 `agents.html?cat=<key>` 分类深链。分类颜色在 `js/agents-data.js` 收敛为蓝 / 青绿 / 砖红 / 琥珀 / 蓝灰。
  - `workspace.html` 同步减少纸张色、粗边和柔影，控制条、筛选、成果卡与弹层采用工作台规范。共享导航新增“跳到主要内容”链接，英文副标改为 `Teacher AI Practice Hub`。
  - 缓存版本：`css/style.css?v=20260712-balanced`；`js/auth.js` / `js/agents-data.js` → `?v=20260712-workbench`（相关 HTML 已同步）。
- **2026-07-12（教学项目闭环与可用性优化，本地待上线）**:
  - 新增 `js/teaching-projects.js`：按登录用户在当前设备保存“当前教学项目”、默认教学背景和最多 8 份“项目 × 智能体”草稿。表单输入与生成结果可恢复；单份结果在本地最多保留 8 万字符。该模块不把草稿正文上传到统计接口。
  - `agents.html` 新增教学项目条与编辑弹层（学科 / 年级 / 教材 / 课题 / 班级人数 / 学情 / 目标），表单自动带入项目背景并把相关背景传给智能体；必填错误改为字段旁文字提示。生成中、失败和重试状态明确区分，网络失败时保留输入。
  - 生成结果新增四项“教师核验清单”、结构化可用性反馈和后续任务入口；教学设计 → 练习 / 课件、错题诊断 → 针对性练习 / 反思等流程会携带当前参数。保存成果时在 `inputs` 内写入 `_projectId / _projectTitle / _reviewStatus` 等归类元数据，不新增 Firestore collection，也不要求规则迁移。
  - `workspace.html` 新增教学项目筛选、按项目排序、项目标签和“教师已核验”状态；从已保存成果继续使用智能体时，会把相应项目恢复成当前项目。首页在本机存在项目或未完成草稿时显示“继续项目 / 恢复草稿”。
  - 统计新增 `project_saved / draft_restored / generation_failed / teacher_reviewed / result_feedback / workflow_continue` 事件，只记录动作、耗时与反馈分类，不记录输入/输出正文。管理员数据看板新增按会话去重的任务漏斗、生成失败、平均耗时、教师核验与成果保存指标。
  - 窄屏导航在 ≤560px 时隐藏独立“注册”按钮（仍可在登录弹层内切换注册），优先保证登录和菜单入口完整可见。缓存版本：`css/style.css?v=20260712-usability`；`js/teaching-projects.js?v=20260712-project-flow`。

## Auth Lesson (Important)

**Old lesson from migration**: proxy-only login stashes an ID token in `localStorage` but does not immediately populate `firebase.auth().currentUser`; direct Firestore SDK calls then look unauthenticated.

**Current fix (2026-07-09)**: login intentionally uses `/api/auth-proxy` first for speed in no-VPN mainland networks, then starts a background Firebase SDK sign-in. Features that must work without VPN should not depend only on browser Firestore SDK. The main example is「我的备课本」: `js/data.js` work methods now call `/api/works` first, and `/api/works` enforces ownership server-side with the user idToken + service account. `Auth.getIdToken()` also prefers a valid proxy token before asking Firebase SDK, and uses `/api/auth-proxy` action `refresh` to refresh an expired proxy token before falling back to Firebase SDK.

To verify full SDK auth is healthy when network allows: in DevTools console, `firebase.auth().currentUser` should eventually be non-null after login. To verify no-VPN workbook support, check `/api/works` responses instead of Firestore SDK state.

## Auth & Admin

- Admin email: `admin@xylaoshi.com`. Password is **not** in the repo — reset via Firebase Authentication if forgotten.
- `users/{uid}` documents must contain `isAdmin: true` (boolean) for the admin user — Firestore rules check this with `get(.../users/$(request.auth.uid)).data.isAdmin == true`.
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
| `community_prompts` | user-submitted prompts | logged-in users (create), author or admin (update) |
| `showcases` | **(retired 2026-06-15)** teacher case studies — all frontend/admin UI removed; collection + existing docs kept, no longer read or written | — |
| `tool_ratings` | per-tool 5-star ratings (not currently shown in UI) | logged-in users |
| `subscribers` | newsletter sign-ups | anyone (create), admin (read/delete) |
| `agent_usage` | 智能体使用计数（doc/agentId，`count`），驱动首页/智能体空间「热门」印章（added 2026-06-17） | read public；write 任意登录用户（`FieldValue.increment`）— **需在 Console 加规则，见下** |
| `works` | **「我的备课本」** saved agent outputs (added 2026-06-16; expanded 2026-06-30) — `{uid, agentId, agentName, agentType, workType, title, content, inputs?, createdAt, updatedAt}` | owner only (uid == request.auth.uid) — **rule must be added in Firebase Console, see below** |
| `contact_messages` | contact-form submissions | logged-in users (create), admin (read/update/delete) |

Rules live in Firebase Console → Firestore → Rules. They are the source of truth — keep them in mind whenever a write fails.

**Firestore Rule for `works`** (must be added inside `match /databases/{database}/documents { … }`; without it the「我的备课本」save/read is denied):

```
match /works/{workId} {
  allow create: if request.auth != null && request.resource.data.uid == request.auth.uid;
  allow read, update, delete: if request.auth != null && resource.data.uid == request.auth.uid;
}
```

**Firestore Rule for `agent_usage`** (智能体使用计数，驱动「热门」印章；缺了不会报错，但用量不会累计、印章固定在种子两个)：

```
match /agent_usage/{agentId} {
  allow read: if true;
  allow write: if request.auth != null;
}
```

## Pages

| File | Purpose |
|---|---|
| `index.html` | Homepage — **现代教研工作台 (2026-07-12)**。首页 CSS 继续内联并全部使用 `.th-*` 命名，避免污染子页；颜色令牌限定在 `.th-root`。结构：平台状态条 → 任务主张 + 右侧“备一节课”五步示例流程 → 6 个任务启动入口 → 人机协同工作协议 / 使用前检查 → 动态专业能力索引 → 6 个配套资源入口。任务卡从 `window.AGENTS` 读取真实说明，能力索引从 `window.AGENT_CATS / AGENTS` 自动生成并链接到 `agents.html?cat=<key>`；智能体总数同样动态。首页不再使用周刊报头、期号、头条、要闻、朱印、稿纸纹理或“30 秒”等未测量宣传语。保留：`renderNav` / `renderFooter`、公告、联系反馈、订阅、悬浮向导与分析埋点。 |
| `agents.html` | **智能体空间** — agent gallery + workspace. Self-contained single page (card wall ↔ workspace, hash deep-link `#agent-id`). 19 agents in `js/agents-data.js` (5 categories). 首页视图 = **顶部精选 (`FEATURED` 4 个) + 按类分区陈列** (`renderHome`)；选分类或搜索时切单层网格 (`renderFiltered`)。Two workspace types: **form**（「任务参数 + 文稿工作区」；左参数栏 `sticky`/可折叠摘要，右文稿面板内部滚动，含保存到备课本、编辑、复制、重新生成；`.ws-top` 是普通文档流，勿设 sticky/fixed）和 **chat**（独立聊天窗口，**仅 `chat-stream` 内部滚动**、不带动整页避免抖动）。Login enforced on *use* (`openAgent` / run / send), not on browsing — card wall 是开放橱窗 (not in `PROTECTED_PAGE_NAMES`)。Model calls funnel through `callAgentAPI()` → `functions/api/agent.js`（DeepSeek + 可选 GLM-5.2，前端显示实际 provider/model）。**保存到备课本 (2026-07-09)**：表单类和聊天类保存前都会弹出标题确认框；表单类用 `buildWorkTitle()` 从输入字段生成具体标题（年级/学科/课题/任务类型），不要再回退成「智能体名称 · 日期」作为默认标题。 |
| `multimodal.html` | **多模态工作坊** — static case gallery for image/video/audio/avatar/courseware generation workflows. It is an owned site feature placed after 智能体空间 in nav, but does **not** call paid generation APIs. Cases live inline in `CASES`; publish-ready assets live in `多模态素材/`. Video case thumbnails use static poster images; detail modals use `media-player.html` or GIF preview + MP4 link. |
| `media-player.html` | Minimal same-origin video player used by `multimodal.html`; validates `src`/`poster` params so only `多模态素材/` paths without `..` can load. Keep it static and dependency-free. |
| `tools.html` | Curated directory of **external** third-party AI products (cards link out). User-facing name **「AI资源精选」** (renamed 2026-06-16; nav key stays `tools`). Renders `DEFAULT_TOOLS` sync first, then Firestore (`DB.getTools`) only replaces local defaults when non-empty. Default "全部" = **grouped by category** (`#tools-grouped`); search/specific category → flat `#tools-grid`; task pills + tag pills from `buildFilterBar()`. **「教师 AI 工具选型台」改版 (2026-07-09)** — all CSS in an **inline `<style>` in tools.html** (not style.css): ① editorial chooser header (`.tt-hero`) + search card. ② Task-oriented categories: `plan` 备课·出题·检索 / `make` 课件·演示·动画 / `media` 图像·音视频·数字人 / `platform` 教研·AI 平台 (+ `more` 更多工具 fallback), each with `CAT_DESCS`/`CAT_ICONS`/`CAT_FITS`. ③ **Category + per-tool tags come from LOCAL `TOOL_META` keyed by tool NAME (NOT Firestore)**; admin 新增工具若未登记进 `TOOL_META` 会落进「更多工具」且无标签。④ Card tags: 免费 / 部分免费 / 付费 / 中文 / 海外 (`.tt-tag` variants; values are estimates and need manual audit). ⑤ Grid override: `#tools-grid, #tools-grouped .cards-grid` use `repeat(auto-fit, minmax(224px,268px))`. Design rule: do not add colored top/side bars to cards; keep category color on section icons / small tags only. |
| `classroom-tools.html` | Eight self-contained classroom widgets (see below) |
| `paths.html` | Full learning-path detail page |
| `prompts.html` | Prompt library (official + community submissions) |
| `news.html` | RSS-aggregated industry news. Nav display name **「AI 资讯」** (renamed 2026-06-16 from "全球资讯"; key stays `news`) |
| `articles.html` + `article.html` | Featured article list + detail |
| `resources.html` | Curated **external** free-asset sites (images/PNG/icons/AIGC), Firestore-backed, falls back to `DEFAULT_RESOURCES`. Nav display name **「课件素材」** (renamed 2026-06-16 from "设计资源" to avoid "资源" clash with AI资源精选; key stays `resources`) |
| `admin.html` | Admin dashboard: dashboard, **数据看板**, announcements, community prompts, subscribers, **联系留言**, articles, tools, prompts, paths, **设计资源**, users. 数据看板从 `/api/analytics` 拉取汇总，新增用户仍用 Firestore `users.joinedAt` 在前端按天聚合。 |
| `workspace.html` | **「我的备课本」**(added 2026-06-16) — per-user saved agent outputs. Self-gated (shows login prompt if logged out; logged-in desktop entry lives in the username area as a personal workspace link, and mobile drawer has a separate「我的」group). Personal workbench UI: top metrics, search/filter/sort, card/list view toggle, paper-style cards, view modal + copy / export Word(.doc) / PDF / Markdown / rename / delete. **2026-07-12** 新增教学项目筛选、项目排序、项目标签与教师核验状态；项目元数据暂存在 work 的 `inputs._project*` 字段中。Reads `works` where `uid == current user`. **Title compatibility (2026-07-09)**：旧内容若标题是「智能体名称 · 日期」这类泛化标题，页面用 `displayWorkTitle()` / `inferredWorkTitle()` 从 `inputs` 或正文首个 Markdown 标题推断具体标题，并纳入搜索和导出文件名；新内容默认由 `agents.html buildWorkTitle()` 保存具体标题。 |

## Key JS Files

- `js/data.js` — `DEFAULT_TOOLS / DEFAULT_PROMPTS / DEFAULT_PATHS / DEFAULT_ARTICLES / DEFAULT_RESOURCES` are used as fallbacks/seeds; `DB` object wraps Firestore reads/writes. Work-book methods (`saveWork/getMyWorks/renameWork/deleteWork`) now prefer `/api/works` and fall back to direct Firestore only for local/dev or temporary API failure.
- `js/firebase-config.js` — initializes Firebase, exposes `auth` and `db`, defines `_currentUser`, `onAuthReady`, dispatches `authChanged` events.
- `js/auth.js` — `Auth` object (login/register/logout, getIdToken, **`sendPasswordReset`**), `renderNav` / `renderFooter` (every page calls these), `requireLogin`, `showAuthModal`, `showWelcomeOverlay`, **hamburger drawer state** (`openNavDrawer` / `closeNavDrawer`). The auth modal has **three views** toggled by `switchAuthTab('login'|'register'|'forgot')`: login (`#form-li`, with a 「忘记密码？」link), register (`#form-rg`), and **forgot-password (`#form-fp`, added 2026-06-17)**. Forgot flow: `handleForgotPassword()` → `Auth.sendPasswordReset(identifier)` → Firebase `auth.sendPasswordResetEmail`. **Phone-number accounts are rejected client-side** (their `tel_…@xylaoshi.tel` address can't receive mail — they must contact admin). Result shows in `#fp-msg` styled `.form-success` (green) or `.form-error` (red). The Firebase project has **email-enumeration protection ON**, so a reset for an *unregistered* email also returns success (no account leak) — only real accounts actually receive mail. Reset link lands on Firebase's own hosted reset page (no custom page needed).
- `js/analytics.js` — front-end event tracker for the admin data dashboard. Creates a random local visitor id, waits for `onAuthReady` when available, then POSTs to `/api/analytics`. Keep it non-blocking: all failures are swallowed so analytics never affects learning pages.
- `js/teaching-projects.js` — local-first teaching context and recovery layer. Stores the active project, default subject/grade profile, and up to 8 project-scoped agent drafts per logged-in user in `localStorage`. It never sends prompt/output text to analytics; saved workbook items receive only project/review metadata inside `inputs`.
- `js/assistant.js` — floating AI-assistant launcher + the contact-feedback modal that writes to `contact_messages`; also contains the Netlify legacy-domain migration notice gated to `xylaoshi.netlify.app`.

## Design Language

**Typography** — one sans family across the whole site:
- Latin: Plus Jakarta Sans (variable, weights 400–800, italic).
- Chinese: Noto Sans SC + system fallbacks (PingFang SC, Hiragino Sans GB).
- Mono (digits, timestamps, kicker labels): JetBrains Mono.
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
- Use numbered markers only for real sequences (for example the homepage teaching cycle), never as decorative section counters.
- Homepage signature element is the **teaching cycle rail**: input validation → draft → supporting exercise → teacher verification → save/reuse. Red-pen or document styling may remain in exported teaching documents, but not as the application shell.

**Welcome overlay + 登录提速 (2026-06-28)**: registration and login both call `showWelcomeOverlay(kind, name)` from `js/auth.js`. It renders a centered card ("欢迎回来 / 欢迎加入" + name + 3-dot pulse). **不再整页 `location.reload()`**（旧版固定 1.7s 后 reload，慢）：现在等下一次 `authChanged`（Firebase 确认登录态）后，**最少 0.7s、最多 1.4s 兜底**，调 `refreshAuthUI()`（=`renderNav()`+`renderFooter()` 原地重渲染；`renderNav` 现记住 `_navPage`，故无参也能保持高亮）并派发**仅登录/注册时触发**的 `authRefresh` 事件，然后淡出。登录态内容页据此原地刷新：`workspace.html` → `loadWorks()`，`admin.html` → `location.reload()`（后台少见、reload 最稳；`authRefresh` 不在普通加载触发 → 无死循环）。登录感知耗时从 ~4–5s（含 reload 重下 SDK + 再读资料）降到 ~0.7–1.4s。

**退出提速 + 记住我 / 登录持久化 (2026-06-28)**：①`Auth.logout()` 改**原地更新、去掉整页 reload**（旧版 `location.reload` 重下 SDK，慢；这才是慢的真因）。顺序用**标准的「先登出、后刷界面」**：`await auth.signOut()`（Firebase signOut 是本地操作、清本机令牌、几毫秒，不需联网）→ `forgetProxyAuthSession()`+`rememberLastAuthUser(null)`+清 `_currentUser` → `refreshAuthUI()` 切未登录 → 派发 `authRefresh`（备课本→回登录门 / 后台→reload）。（注：曾短暂用过"乐观更新"即先刷界面后台再登出，但 signOut 本就极快、该顺序无收益且会吞错误，已回退到 await-first 规范写法。）②登录加「记住我」勾选（`#li-remember`，**默认不勾**，旁注"公用电脑勿勾"）：`Auth.login(identifier, pwd, remember)` 在 signIn **之前** `await auth.setPersistence(remember ? LOCAL : SESSION)`——**勾=LOCAL**（关浏览器仍登录），**不勾=SESSION**（关浏览器即退出，公用机更安全）；常量是 `firebase.auth.Auth.Persistence.LOCAL/.SESSION`。注册固定 `LOCAL`（自家账号长期保持）。⚠️ 安全说明：localStorage 只存「资料快照」做乐观渲染、非令牌，篡改它只能伪造本机 UI，数据由 Firestore 安全规则在服务端兜底，不会泄露。`js/auth.js?v=20260628-logout`（全站同步）。

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
