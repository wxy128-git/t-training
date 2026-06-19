# AGENTS.md

## Project Snapshot

- Project: `t-training`, a teacher-facing AI training site (AI agents, AI tools, prompts, learning paths, articles, design resources, classroom tools, contact feedback).
- Local path: `/Users/wangxingyu/C-C/t-training`
- Production: `https://xylaoshi.pages.dev/`
- GitHub remote: `git@github.com:wxy128-git/t-training.git`
- Deployment: push to `main` → Cloudflare Pages auto-builds and ships static files + `functions/`.
- Backend services: Firebase Auth (email/password) and Cloud Firestore.

## Architecture

- Plain HTML/CSS/JS, no bundler. Pages render skeletons (or in-code defaults), then JS pulls data from Firestore via the global `DB` object in `js/data.js`.
- Four Cloudflare Pages Functions under `functions/api/`:
  - `auth-proxy.js` — server-side login/register fallback when the browser can't reach Firebase Auth directly. Stores an ID token in `localStorage` under the key in `window.PROXY_AUTH_SESSION_KEY`. **Should now only run as a network-failure fallback** (see "Auth Lesson" below).
  - `admin-users.js` — admin-only full deletion of a user (both Authentication account and Firestore profile). Requires a Firebase service account configured via Cloudflare environment variables.
  - `rss-proxy.js` — generic CORS-friendly RSS fetcher for the news page; used as one of several loaders.
  - `agent.js` — 智能体后端代理（2026-06-09）：持 `DEEPSEEK_API_KEY` 转发到 DeepSeek（model `deepseek-chat`），用 `accounts:lookup` 校验 Firebase idToken 防盗刷，把上游 SSE 解析成纯文本增量流式回传。前端 `agents.html` 的 `callAgentAPI()` POST `{ messages, idToken }` 调用它。未配密钥时返回 501。
- Frontend always calls these via `/api/...` paths.

## Deployment History

- **2026-05-30**: Migrated off Netlify after the team credit limit was exceeded; rewrote the three Netlify Functions as Cloudflare Pages Functions (Node `crypto`/`Buffer` swapped for Web Crypto API + `atob`/`TextEncoder`).
- **2026-05-31**: Removed the legacy `netlify/functions/` directory once CF was stable; configured `FIREBASE_SERVICE_ACCOUNT` on CF so admin user deletion works. Editorial visual redesign + four classroom tools shipped.
- **2026-06-01**: Hamburger drawer replaces 1080px-and-below horizontal scroll nav. Four more classroom tools added (groups / seating / applause / whiteboard). Paths and articles split into warm-vs-cool color families. Admin gets a 设计资源 management panel; resources migrate to Firestore.
- **2026-06-02**: Firestore rules updated to include `resource_categories`. Path gradients enforced at render time by slug, bypassing any legacy data in Firestore.
- **2026-06-04**: Per-page OG share cards shipped (10 editorial 1200×630 JPGs under `assets/og/`, generated from `assets/og/template.html` via headless screenshots — see "SEO / OG"). Added `twitter:card`/`twitter:image` + `og:image:width/height` to all content pages; added missing `canonical` to `index.html`. CSS got a self-contained "Refinement layer" at the end of `style.css` (softer card motion, springy button press, more editorial spacing, CSS-only scroll-reveal). `style.css` is now cache-busted with `?v=YYYYMMDD` on every page — bump it whenever the stylesheet changes.
- **2026-06-09**: 新增「智能体空间」(`agents.html` + `js/agents-data.js`) — 19 个面向中小学教师的 AI 智能体，分备课设计 / 课堂教学 / 作业评价 / 班级家校 / 教师发展五类，含生成式（填参数）与对话式两种工作台。模型调用统一收口在前端 `callAgentAPI()` → 后端 `functions/api/agent.js`。已加入主导航（`renderNav` 的 `agents` 项）、页脚与首页功能卡；OG 卡 `assets/og/agents.jpg` 已按 `template.html` 流程生成。智能体清单纯前端维护，未进 Firestore/admin。
- **2026-06-09（下午）**: 智能体空间接入 **DeepSeek**。新增 `functions/api/agent.js` 后端代理（model `deepseek-chat`/V3，全站统一），前端 `callAgentAPI()` 从演示 mock 改为真实流式调用。需在 Cloudflare 配 `DEEPSEEK_API_KEY`（Secret），配后需重新部署一次才生效。智能体的角色设定取自 `js/agents-data.js` 各项的 `system` 字段；表单输入由前端 `buildUserPrompt()` 拼成 user 消息。
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
  - 缓存版本：`data.js` / `auth.js` → `?v=20260616-workbook`（保存范围 MVP 仅 form 类；chat 类、PPT 导出留待二期）。
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
  - **签名视觉（红笔/印章，克制·更轻）**：一套「教师」母题，整页只点几处。① **手绘红笔下划线**：`.hero h1 .underline::after` 改为内嵌 SVG 笔触（data-URI，朱砂、细），用于首页 H1「你的课堂」。② **印章徽记** `.seal`（朱砂双线、微旋转）盖在智能体卡右上角 `.card-seal`。③ **红笔对勾**（已于 2026-06-17 回滚——观感不佳，hero 价值条恢复 Phosphor 图标；`.rp-check` 样式已删）。母题样式在 style.css「签名视觉」块。**更新 (2026-06-19)**：首页改版后用的是**实心朱印**（`.hp-seal*`，朱砂阴文楷体）；为与首页统一，**agents.html 在自己的内联 `<style>` 里把 `.seal` 覆盖成同款实心朱印**（`.seal` 仅 agents.html 在用，安全），页眉加「甄选」印 (`.agents-head-seal`)、「常用推荐」精选卡盖「精选」印（`cardHtml(a,false,true)`），分区卡仍按用量盖「热门」印。另：**全站轻量一致层**——`style.css` 加了 `body::before` 稿纸纹理（固定·极淡·顶部加重），并清除了子页残留冷色（Tailwind 石板灰/靛蓝→编辑式暖调）；`css/style.css?v=20260619-texture`。
  - **印章改为「热门」按使用频率（2026-06-17）**：原固定 4 个「精选」印 → 改为**全站使用频率最高的 2 个**盖「热门」印，自动顶替。计数：智能体每次「生成/对话」成功后 `DB.bumpAgentUsage(id)` 写 Firestore `agent_usage/{id}.count`（`FieldValue.increment`）；`DB.getTopAgents(2)` 读出 Top-2。`window.TOP_AGENTS` 先用种子 `['lesson-design','quiz-gen']`，数据返回后覆盖并重渲染。**显示去重**：homepage 在 `#feat-agents` 盖；agents.html 在**分区卡**盖、**「常用推荐」行传 `cardHtml(a,false)` 不盖**（避免同一智能体出现两次被盖两个印）。无 `agent_usage` 规则/数据时回退到种子，不报错。缓存版本：`data.js`/`css/style.css` → `?v=20260617-hot`。

- **2026-06-17（提示词并入智能体 + 悬浮助手重绘）**:
  - **撤「提示词库」栏目，并入智能体**：从导航 (`renderNav`)、页脚、首页「配套资源」移除「提示词库」入口；智能体工作台头部新增 **「复制提示词」** 按钮（`copyAgentPrompt()`，复制当前智能体的 `a.system`，供老师拿到别处用）；`openAgent` 里记 `window._wsAgent`。**`prompts.html` 文件保留**（直链可达、admin 社区提示词面板仍在），只是退出主 IA——如要彻底删页/删 community_prompts 再单独定。
  - **悬浮助手重绘 + 改定位**（`js/assistant.js` + style.css）：卡通吉祥物 → **克制小药丸**「🧭 需要帮忙？」；面板从「AI 教学助教」改为 **「网站向导」**（帮你找智能体/工具/路径）；答案改为**优先引导到对应智能体**（备课→`#lesson-design`、出题→`#quiz-gen`、家校→`#parent-comm`），清掉对已撤提示词库的引用；**去掉打开/提问的登录门槛**（找功能不需登录；联系我们仍需登录）。删除全部 `.assistant-mascot/.mascot-*/.assistant-mini-*` 吉祥物 CSS。`assistant.js` 首次加上缓存版本号 `?v=20260617-guide`（全 13 页）。
  - 缓存版本：`css/style.css` / `js/auth.js` / `js/assistant.js` → `?v=20260617-guide`。

## Auth Lesson (Important)

**The single biggest bug we hit during the migration**: production logins were routed through `/api/auth-proxy` first, which only stashes the ID token in `localStorage` and never calls the Firebase JS SDK. That left `firebase.auth().currentUser` as `null`, so every Firestore request went out unauthenticated — `getUsers`, article writes, subscribe lookups all 403'd even though the UI showed the admin as "logged in".

**Fix**: `shouldUseAuthProxyFirst()` in `js/auth.js` now always returns `false`. The Firebase JS SDK runs first; the proxy is only invoked from the `auth/network-request-failed` fallback branch. If you ever consider re-enabling proxy-first, remember it cannot satisfy Firestore security rules that read `request.auth`.

To verify auth is healthy: in DevTools console, `firebase.auth().currentUser` should be a non-null object after login.

## Auth & Admin

- Admin email: `admin@xylaoshi.com`. Password is **not** in the repo — reset via Firebase Authentication if forgotten.
- `users/{uid}` documents must contain `isAdmin: true` (boolean) for the admin user — Firestore rules check this with `get(.../users/$(request.auth.uid)).data.isAdmin == true`.
- "Forgot password" flow not yet implemented.
- Cloudflare env var `DEEPSEEK_API_KEY` (Type: Secret) — 智能体空间（`/api/agent`）调用 DeepSeek 所需。未配置时 `/api/agent` 返回 501 并提示。**改动 env 后必须重新部署一次才生效。**
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
| `works` | **「我的备课本」** saved agent outputs (added 2026-06-16) — `{uid, agentId, agentName, title, content, createdAt, updatedAt}` | owner only (uid == request.auth.uid) — **rule must be added in Firebase Console, see below** |
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
| `index.html` | Homepage — **「教研周刊」报头带重设计 (2026-06-18)**. All homepage markup/CSS is **self-contained & namespaced**: wrapper `.hp-root` + every class is `hp-*`, and design tokens (`--paper`/`--paper-2`/`--grid`/`--seal`/`--c-*`…) are scoped to `.hp-root`. The CSS lives in an **inline `<style>` block inside `index.html`** — it deliberately does **NOT** touch `css/style.css`, so other pages are unaffected and there are zero class clashes with the global `.hero`/`.kicker`/`.seal`/`.mini`. Structure: **报头带** (`.hp-mast` — ◆ AI 教研周刊 + 期号/日期/19个 + 「教研甄选」solid square seal `.hp-seal-sq`, vermillion carved 楷体) → **hero** (`.hp-hgrid`: left copy + right **「怎么用·30秒出稿」3-step how-to panel** `.hp-howto` — replaced the old 5场景 panel to kill the hero/section category duplication) → **section 01 AI 智能体**: 头条`.hp-lead`(教学设计助手, 样张 manuscript preview + 「精选」seal + 「生成内容包含」chips) + 要闻`.hp-brief`(3 cards, each w/ mini 样张) + 分类目录`.hp-toc`(5 category rows) → **section 02 配套资源** `#hp-supp` (6 numbered `.hp-mcard`). **The showcase is DYNAMIC (2026-06-18, restored)** — an inline `renderHome()` builds 头条/要闻/分类目录 from `window.AGENTS` + `window.AGENT_CATS` (`js/agents-data.js` is loaded again by index.html). `FEATURED = ['lesson-design','quiz-gen','homework-grader','parent-comm']` picks 头条(=[0]) + 要闻(=[1..3]); card meta (name/category/icon/tagline/type) comes from data so renaming/retagging an agent updates the homepage; only the illustrative **样张** snippets live in a small `SAMP` map (by agent id) inside index.html (fallback = `a.desc`), plus an `INCL` chips map for the 头条. 分类目录 is fully data-driven (each cat's agent names + count). **Masthead 期号/date/智能体数 are auto-computed**: issue = weeks since 2026-01-05 +1, date = today, count = `AGENTS.length` (also fills every `.hp-count` span). Each card links to `agents.html#<id>`. 稿纸 grid texture via `.hp-root::before` (faint, masked). **Button text-color note:** `.hp-root a{color:inherit}` outranks `.hp-cta-primary{color}` by specificity, so the primary CTA + `.hp-sec-more` colors are re-asserted as `.hp-root a.hp-cta-primary` / `.hp-root a.hp-sec-more`. Kept intact: `renderNav`/`renderFooter`, `DB.getAnnouncements()`, contact band, subscribe, floating assistant — these sit OUTSIDE `.hp-root` (in `.home-main`) so global styles/tokens apply normally. |
| `agents.html` | **智能体空间** — agent gallery + workspace. Self-contained single page (card wall ↔ workspace, hash deep-link `#agent-id`). 19 agents in `js/agents-data.js` (5 categories). 首页视图 = **顶部精选 (`FEATURED` 4 个) + 按类分区陈列** (`renderHome`)；选分类或搜索时切单层网格 (`renderFiltered`)。Two workspace types: **form**（左参数栏 `sticky` 吸顶 / 右流式 Markdown，含编辑·复制·重新生成；`toggleEdit` 切换渲染态↔可编辑文本框）和 **chat**（独立聊天窗口，**仅 `chat-stream` 内部滚动**、不带动整页避免抖动）。Login enforced on *use* (`openAgent` / run / send), not on browsing — card wall 是开放橱窗 (not in `PROTECTED_PAGE_NAMES`)。Model calls funnel through `callAgentAPI()` → `functions/api/agent.js`（DeepSeek，已接真实 API）。 |
| `tools.html` | Curated directory of **external** third-party AI products (cards link out). User-facing name is **「AI资源精选」** (renamed 2026-06-16 from "AI工具" — clearer vs in-house 智能体空间; nav key stays `tools`). **Renders `DEFAULT_TOOLS` synchronously first**, then replaces with Firestore data. Default "全部" view is **grouped by category** (`#tools-grouped`, section per category); search or a specific category switches to a flat `#tools-grid`. Filter pills built dynamically by `buildFilterBar()` from categories actually present |
| `classroom-tools.html` | Eight self-contained classroom widgets (see below) |
| `paths.html` | Full learning-path detail page |
| `prompts.html` | Prompt library (official + community submissions) |
| `news.html` | RSS-aggregated industry news. Nav display name **「AI 资讯」** (renamed 2026-06-16 from "全球资讯"; key stays `news`) |
| `articles.html` + `article.html` | Featured article list + detail |
| `resources.html` | Curated **external** free-asset sites (images/PNG/icons/AIGC), Firestore-backed, falls back to `DEFAULT_RESOURCES`. Nav display name **「课件素材」** (renamed 2026-06-16 from "设计资源" to avoid "资源" clash with AI资源精选; key stays `resources`) |
| `admin.html` | Admin dashboard: dashboard, announcements, community prompts, subscribers, **联系留言**, articles, tools, prompts, paths, **设计资源**, users |
| `workspace.html` | **「我的备课本」**(added 2026-06-16) — per-user saved agent outputs. Self-gated (shows login prompt if logged out; entry only shown in nav when logged in). Card wall + view modal + copy / export Word(.doc) / export Markdown / rename / delete. Reads `works` where `uid == current user` |

## Key JS Files

- `js/data.js` — `DEFAULT_TOOLS / DEFAULT_PROMPTS / DEFAULT_PATHS / DEFAULT_ARTICLES / DEFAULT_RESOURCES` are used as fallbacks/seeds; `DB` object wraps all Firestore reads/writes (one or more methods per collection).
- `js/firebase-config.js` — initializes Firebase, exposes `auth` and `db`, defines `_currentUser`, `onAuthReady`, dispatches `authChanged` events.
- `js/auth.js` — `Auth` object (login/register/logout, getIdToken, **`sendPasswordReset`**), `renderNav` / `renderFooter` (every page calls these), `requireLogin`, `showAuthModal`, `showWelcomeOverlay`, **hamburger drawer state** (`openNavDrawer` / `closeNavDrawer`). The auth modal has **three views** toggled by `switchAuthTab('login'|'register'|'forgot')`: login (`#form-li`, with a 「忘记密码？」link), register (`#form-rg`), and **forgot-password (`#form-fp`, added 2026-06-17)**. Forgot flow: `handleForgotPassword()` → `Auth.sendPasswordReset(identifier)` → Firebase `auth.sendPasswordResetEmail`. **Phone-number accounts are rejected client-side** (their `tel_…@xylaoshi.tel` address can't receive mail — they must contact admin). Result shows in `#fp-msg` styled `.form-success` (green) or `.form-error` (red). The Firebase project has **email-enumeration protection ON**, so a reset for an *unregistered* email also returns success (no account leak) — only real accounts actually receive mail. Reset link lands on Firebase's own hosted reset page (no custom page needed).
- `js/assistant.js` — floating AI-assistant launcher + the contact-feedback modal that writes to `contact_messages`.

## Design Language

**Typography** — one sans family across the whole site:
- Latin: Plus Jakarta Sans (variable, weights 400–800, italic).
- Chinese: Noto Sans SC + system fallbacks (PingFang SC, Hiragino Sans GB).
- Mono (digits, timestamps, kicker labels): JetBrains Mono.
- `--font-display` is aliased to `--font-sans`; hierarchy comes from weight (700–800 for display, 500 for labels) and size, not font family.

**Base color tokens** (defined in `css/style.css :root`):
- Background: paper cream `--soft #faf7f0`. Surfaces white.
- Ink: warm dark `--ink #1a1612` (not cold blue).
- Brand: cinnabar red `--brand #c0392b` — used sparingly as the only accent (italic highlight in hero, section accent stripes, hover/active states).
- Avoid generic AI-design tropes: no purple-to-pink gradients, no Inter, no neon glow.

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

Both families are enforced at render time, **not** trusted from Firestore. Path renders look the gradient up from a `PATH_PALETTE[slug]` map in `index.html` and `paths.html`; article rendering ignores `coverColor` and hashes `id → COVER_GRADIENTS`. This means legacy Firestore values don't need to be migrated — they're simply overridden.

**Component conventions**:
- Radius scale 8 / 12 / 18 / 24 px.
- Cards: 1px `--line` border, soft hover lift (`translateY(-3px)` + `--shadow-md`).
- Section headers: top hairline + auto-counter "01 / 02 / 03" italic numeral in brand color (uses CSS counter on `.home-section`).
- Hero is on `--soft` with a faint dot-grid radial mask; title 800-weight with the `.highlight` span italic + brand color; staggered fade-in animation on `.hero-content > *`. Homepage hero is **two-column** (`.hero-split`, 1.04fr/0.96fr, stacks ≤900px): left = copy + value-label strip (`.hero-values`, icon + 短句, replaced the old number stats), right = a "本周精选" spotlight card (`.hero-card`). Other pages keep the single-column hero/breadcrumb.

**Welcome overlay**: registration and login both call `showWelcomeOverlay(kind, name)` from `js/auth.js`. It renders a centered card ("欢迎回来 / 欢迎加入" + the user's name + a 3-dot pulse) for ~1.7s before reloading. This is what makes the login moment feel like something happened.

## Navigation & Mobile

- Desktop (≥1081px): the standard horizontal `.site-nav` in `renderNav()` shows all entries.
- Tablet / mobile (≤1080px): `.site-nav` is hidden via CSS, a 40px `ph-list` hamburger button appears in `.auth-area`. Clicking it opens a right-slide drawer (`.nav-drawer`) that fades in with a backdrop. The drawer holds the full nav list with mono "导航" / "其他" kickers between sections.
- Drawer dismissal: backdrop click, ESC key, internal link click, or the close button.
- `resources.html` formerly had its own inline nav markup; it now uses `renderNav('resources')` like every other page so the hamburger works there too.

## Classroom Tools (`classroom-tools.html`)

Single-page experience. Home grid shows tool cards; clicking one swaps in its UI under `#ct-stage-content`. A back button returns home; a fullscreen toggle hides nav/footer for projector use. URL hash deep-links directly to a tool (`#countdown` / `#picker` / etc.). Transitions: home fades+slides out before stage fades+slides in (CSS `entering` / `leaving` classes + chained rAF). `prefers-reduced-motion` disables all of it.

The eight tools:

1. **倒计时** — mono-numeric display, 1/3/5/10/15-min presets + custom MM:SS, start/pause/resume/reset, last 10s pulse, 3-beep AudioContext chime at zero.
2. **随机点名** — roster textarea (any whitespace/punctuation separator), spinning ticker before landing, "抽过不再抽" mode with chip-list history. Roster persists in `localStorage` (`ctPickerRoster`).
3. **转盘抽奖** — Hi-DPI canvas wheel using the editorial palette, cubic-ease 4.2s deceleration, top pointer, auto-truncated labels.
4. **音浪小球** — microphone-driven bouncing visualization with four themes (ball / bubble / emoji / number). See "音浪小球 details" below.
5. **随机分组** — fisher-yates shuffle + round-robin OR per-group chunking. Roster persists in `localStorage` (`ctGroupsRoster`).
6. **座位表** — grid of `rows × cols` filled from a roster, click two seats to swap, prints via `window.print()` with `@media print` rules hiding everything else.
7. **课堂音效** — eight buttons, all sounds synthesized with Web Audio (no audio files): applause / cheer / bell / chime / time-up / drumroll / correct / wrong.
8. **简易白板** — 6-color palette + 4 brush sizes + eraser + undo (40-frame snapshot stack) + clear + save PNG. Supports both pointer and touch input. ResizeObserver preserves the drawing across fullscreen toggles.

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
