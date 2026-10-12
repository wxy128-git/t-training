# 科研写作 · 第二批智能体开发方案：研究设计顾问 + 研究工具工坊

状态：2026-10-12 用户要求开发这两个智能体，「访谈编码助手」暂不做。第 2 节列出的默认决定可直接实施；用户另有指示时以用户为准。

读者：实施者（Codex）。先通读根目录 `AGENTS.md`、`docs/2026-10-06-research-writing-module-spec.md`（v1 方案）和 `docs/2026-10-08-research-coach-update.md`（教练更新），再读本文。本文只写新增与改动；与上述文档冲突时，**以本文为准**，但本文没提到的 v1 约定全部继续有效。

本文中的五段系统提示词是**唯一权威版本**，测试会把代码里的字符串与本文代码块逐字比对。如需修改提示词，先改本文对应代码块，再同步代码，并在验收报告中写明原因。

---

## 0. 硬规则（沿用 v1，并补充本批要求）

1. **不新增数据库表、collection 或后端路由。** 持久化只用现有 `works`（我的备课本）；模型调用只走现有 `/api/agent`。
2. **不新增统计事件、不恢复任何采集。** 不调用 `Analytics.track`，不加统计字段。
3. **不碰认证、管理员判定、邮箱验证、隐私政策。** 登录门只用现有 `requireLogin(null, t('loginHint'))`。
4. **不改 `agents.html` 的行为，不改 v1 两个智能体的系统提示词、请求补充约束、标记字符串和已有数据结构。** 不改 `parseReadingCard`、`detectFunnelPhase`、`extractFunnelResult`、`buildFunnelMessages` 的现有行为。
5. 模型输出一律当作**不可信文本**：结构化字段先经本文第 4.6、5.6 节的规范化函数，再用 `SafeRender.escape` 输出到页面；Markdown 只经 `SafeRender.markdown` 渲染。不得把模型字符串直接写进 `innerHTML`。
6. 纯 HTML/CSS/JS、无构建；中文文案；遵守 `AGENTS.md` 的 Design Language 和 v1 已有的科研视觉：底色 #f3f6f8、正文 #17212b、结构色 #245b78、成功 #287a68、提醒 #a76f18、主操作用站点朱砂色；新 CSS 一律 `.rs-` 前缀。不用紫粉渐变，不加假 KPI。
7. 自动化测试**不得调用付费模型**。第 13 节的真实模型冒烟只做规定的 6 次调用。
8. API 密钥不进仓库；不连接旧 Firebase 数据库改生产数据；管理员身份只绑定 `AGENTS.md` 中写明的 UID。
9. 向模型发送的只有教师在表单里填写的问题、条件和工具草稿。不读取、不发送任何学生数据文件；页面明确提醒教师删去姓名、学校等可识别信息。
10. 完成后按 `AGENTS.md`「Deployment Documentation Rule」更新文档，并在 `reports/` 写验收记录（第 14 节）。

---

## 1. 目标与边界

讲座第三部分「研究方法如何确定」的核心难点有两个：

- 教师不知道**自己的问题和条件**适合什么方法，常见错误是一个人一个班却写「准实验」，或者把所有方法堆成「混合方法」。
- 方法定了以后，**工具写不好**：问卷有双重问题和引导性措辞，访谈提纲全是是非题，观察表写的是「学生很专注」这种看不见的判断。

本批新增两个 AI 科研伙伴，接在 v1 的「研究问题教练」之后：

| 伙伴 | ID | 一句话 | 输出 |
|---|---|---|---|
| 研究设计顾问 | `research-design` | 根据研究问题和真实条件，推荐 1 至 2 种做得成的方法 | 问题解析、范围检查、题目承诺检查、推荐与不推荐方法、一页纸研究设计、所需工具、伦理提醒 |
| 研究工具工坊 | `research-instrument` | 为一个子问题起草或审查研究工具 | 可编辑的问卷 / 访谈提纲 / 观察记录表、逐条审查表、规则检查、施测建议、打印版 |

**AI 的边界**（写进提示词和页面说明）：顾问只给设计建议，不替教师决定，不预测结果；工坊只设计和审查工具，不编造量表原题、信度数据或研究发现。两者都不编造文献。

**不做**：访谈编码助手（v3 候选，见第 15 节）；统计分析解读；直接调用问卷平台（问卷星等）。

成功标准：一位没有科研训练的教师，从研究问题教练拿到问题后，10 分钟内得到一页纸研究设计；再用 15 分钟为其中一个子问题做出一份经过逐条审查、可打印的工具。

---

## 2. 默认决定（用户可推翻）

| 编号 | 决定 | 默认值 | 理由 |
|---|---|---|---|
| D1 | 页面位置 | 两个伙伴都放进现有 `/research` 页面，作为新视图 `#design`、`#instrument`；首页由两张卡变成 2×2 四张卡，顺序为教练、研读、设计、工坊 | 延续 v1 结构，顺序对应讲座的「问题 → 文献 → 方法」 |
| D2 | 模型 | 两个 ID 加入 `DEFAULT_ZHIPU_AGENT_IDS`，与 v1 相同：有智谱密钥时用 GLM-5.2，否则回退 DeepSeek | 与 v1 一致 |
| D3 | 后台文案 | 新增 135 项文案全部纳入后台「页面文案 → 科研写作」，共 288 项；科研页字段上限由 160 提到 **300** | 用户已要求科研模块文案都能在后台改；现有 153 项只剩 7 项余量。表格列名、编辑分区小标题、规则检查提示这类与数据结构绑定的文字写死在代码里（第 8 节） |
| D4 | 选项值不进后台 | 学段、条件、方法名等**会发给模型或被解析的选项值**写死在 `research-data.js` | 管理员改了选项会让提示词、解析和已保存数据不一致 |
| D5 | 方法清单 | 讲座的 7 种方法外，再加「个案研究」，共 8 种 | 一线教师研究学困生、特殊个案时最常用；不加会被迫选错方法 |
| D6 | 保存 | 设计和工具各存为备课本条目；再次保存总是**新增**一份，不覆盖原稿 | 现有 `works` 接口没有更新正文的操作，也避免误覆盖 |
| D7 | 已保存条目的可编辑性 | 研究设计打开后只读，可「基于此设计新建」；研究工具打开后可继续编辑、重新审查、另存 | 设计是一次性建议；工具需要多轮打磨 |
| D8 | 人物肖像 | 新增两张虚构人物肖像，方法与 v1 报告 `reports/2026-10-07-research-partners.md` 相同 | 与已有两位伙伴统一 |
| D9 | 真实模型冒烟 | 授权第 13 节的 6 次调用 | 结构化 JSON 和长输出必须在真实模型上验证 |
| D10 | 共享脚本 | `pwa.js`、`assistant.js` 和首页横幅同步更新文字，全站统一升版本号 | 修正向导里的旧名称「研究问题漏斗」「文献精读卡」 |

---

## 3. 总体流程与数据交接

```
研究问题教练 ──「交给研究设计顾问」──▶ 研究设计顾问 ──每个子问题「去研究工具工坊设计」──▶ 研究工具工坊
     │ 保存（_researchQuestion）            │ 保存（_design）                                 │ 保存（_instrument）
     ▼                                      ▼                                                 ▼
  我的备课本 ◀──「从备课本导入研究问题」── 设计顾问表单       工坊表单 ──「从备课本中的研究设计导入」──▶
```

三种进入方式，任何一种都能单独使用：

1. **同一标签页连续操作**：用会话交接（sessionStorage，第 6 节），点按钮即带着问题跳转。
2. **隔天继续**：从备课本导入。设计顾问列出已保存的教练结果中的研究问题；工坊列出已保存的研究设计及其子问题。
3. **直接填写**：两个表单都可以手动填写，不依赖上游。

---
## 4. 研究设计顾问（`research-design`）

### 4.1 身份与入口

- `RESEARCH_AGENTS` 第 3 项：`{id:'research-design', name:'研究设计顾问', type:'form', roleName:'研究设计顾问', tagline:'挑做得成的方法，排一页纸设计', maxQuestionChars:300, maxTitleChars:60, maxNotesChars:300, options, system, requestSystem, buildUserMessage}`。
- 视图 `#design`，DOM 根节点 `<section id="rs-design" class="rs-view" hidden>`。`normalizedView()` 增加 `'research-design':'design'`，保证备课本链接 `/research?work=<id>#research-design` 能打开。
- 肖像 `/assets/agent-portraits/research-design.jpg`。工作台头部与 v1 相同：返回按钮、56×64 小头像、角色名、ⓘ 使用说明（`designGuide`）、右侧「我的备课本」链接。

### 4.2 表单

表单 `<form id="rs-design-form" novalidate>`，一栏布局，宽屏时与结果区上下排列（与精读卡相同）。所有选项值写在 `design.options` 中（D4），界面文字等于选项值。

| 字段 | 控件 | 必填 | 选项或限制 |
|---|---|---|---|
| 从备课本导入研究问题 | `<select id="rs-design-import">` | 否 | 登录后列出 `agentId==='research-funnel'` 且 `inputs._researchQuestion` 非空的条目，按保存时间倒序去重，最多 20 条；未登录时禁用并显示 `loginHint`；没有条目时显示 `designImportEmpty` |
| 研究问题 | `<textarea id="rs-design-question">` | 是 | ≤300 字，显示字数 |
| 拟定题目 | `<input id="rs-design-title">` | 否 | ≤60 字。若交接或导入带来了教练给出的 5 个标题，在输入框上方显示一个 `<select id="rs-design-title-pick">`（`designTitlePick`），选中即填入输入框 |
| 学段 `stage` | 单选 | 是 | 小学低年级（1–3年级）、小学高年级（4–6年级）、初中、高中、其他 |
| 研究对象 `classes` | 单选 | 是 | 只有我任教的 1 个班、我任教的 2 个及以上班、可联合同事的班级 |
| 可比较的平行班 `parallel` | 单选 | 是 | 有、没有、不确定 |
| 研究周期 `period` | 单选 | 是 | 一个月内、一学期、一学年、两年及以上 |
| 可以收集的数据 `data` | 多选 | 否 | 学生作业与作品、测验或考试成绩、我自己的课堂观察、同事听课观察、课堂录音或录像（需同意）、学生访谈、学生问卷、家长访谈或问卷、教师同事访谈、教学日志与反思 |
| 数据分析能力 `ability` | 单选 | 是 | 只会 Excel 基本统计、会用 SPSS 或类似统计软件、都不太会，需要尽量简单 |
| 可求助的人 `support` | 单选 | 是 | 有教研员或高校老师指导、有同事愿意合作、主要靠自己 |
| 研究用途 `purpose` | 单选 | 是 | 个人教学改进、校级小课题、区县级课题、省级及以上课题申报、期刊论文 |
| 方法偏好 `preference` | `<select>` | 是，默认第一项 | 不确定（请顾问判断）、问卷调查、访谈法、观察法、行动研究、准实验、德尔菲法、田野调查、个案研究 |
| 其他说明 `notes` | `<textarea>` | 否 | ≤300 字 |

- 单选组用 `<fieldset><legend>`，多选组同理；不预选单选项，提交时缺项则在 `#rs-design-error` 显示 `designRequiredError`，并把焦点移到第一个缺项。
- 表单下方是隐私说明 ⓘ（`designPrivacy`）、条件说明 ⓘ（`designConditionsHint`）和主按钮「生成研究设计」（`designGenerateAction`）。生成中主按钮变为「停止」（复用 `stopAction`），表单控件禁用。
- 选了导入项后：研究问题填入 `_researchQuestion`；若该条目有 `_titles` 数组，就显示标题下拉。
- 研究问题输入框的值按 uid 存到 `localStorage['rsDesignQuestion:'+uid]`（与 v1 精读卡的 `rsReadingQuestion:` 做法相同），`syncAuth` 换号时按新 uid 恢复。

### 4.3 用户消息模板 `design.buildUserMessage(ctx)`

`ctx = {question, title, conditions}`，`conditions = {stage, classes, parallel, period, data:[], ability, support, purpose, preference, notes}`。生成的字符串逐行如下，空值按括号里的写法：

```
【研究问题】{question}
【拟定题目】{title 或 “未提供”}
【学段】{stage}
【研究对象】{classes}
【可比较的平行班】{parallel}
【研究周期】{period}
【可以收集的数据】{data 用“、”连接，空数组写“未选择”}
【数据分析能力】{ability}
【可求助的人】{support}
【研究用途】{purpose}
【方法偏好】{preference}
【其他说明】{notes 或 “无”}
```

请求体：`{idToken, agentId:'research-design', curriculum:null, messages:[{role:'system', content:design.requestSystem}, {role:'user', content:design.buildUserMessage(ctx)}]}`，经 `AgentStream.request` 发送，`onToken` 更新进度（`designProgress`，占位符 `{count}`）和「原始回复」折叠区，`onResponse` 调 `modelLabel(r,'rs-design-model')`。

### 4.4 系统提示词

下面的二级标题是测试定位锚点，不要改名、加编号或在前文重复。代码块内容逐字写入 `design.system`（去掉首尾空白）。

## 设计顾问系统提示

```
你是一位熟悉中小学教育科研的研究方法顾问，帮一线教师根据研究问题和真实条件选择研究方法，形成一页纸研究设计。你只给设计建议，不替教师做决定，不预测研究结果。

【依据】只依据教师提供的研究问题、拟定题目、学段、研究对象、平行班、研究周期、可收集的数据、分析能力、可求助的人、研究用途、方法偏好和其他说明。教师没有选择的条件一律视为不具备，不得假设成有利条件；需要教师补充的信息写入 pending。

【判断步骤】
1. 问题解析：写出研究对象、关键变量或现象、研究情境，并判断问题类型。questionType 只能取以下四个值之一：
   - 描述型：想弄清现状是什么、有多普遍；
   - 关系型：想知道两个或多个因素之间是否有关联；
   - 干预型：想知道采取某种做法后是否带来变化；
   - 过程型：想理解某件事怎样发生、参与者怎样经历和理解。
2. 范围检查：判断一名教师在给定周期和条件下能否完成。可以完成时 scope.status 为“可行”。范围过大时为“需收窄”，在 narrowed 写出收窄后的研究问题（疑问句），后续步骤全部针对收窄后的问题。如果输入只是困扰、口号或工作计划，还不是研究问题，status 为“需回到教练”，reason 说明还缺什么，recommended 和 plan 必须是空数组。
3. 题目承诺检查：教师提供了题目时，说明题目字面承诺了什么证据。例如“影响”“效果”通常要求前后比较或对照，“现状调查”通常要求较多样本，“机制”“路径”通常要求过程性材料。再指出与条件是否冲突，给出修改建议。没有提供题目时，title 写“未提供”，其余三项写空字符串。
4. 方法选择：method 只能从以下八种中选择：问卷调查、访谈法、观察法、行动研究、准实验、德尔菲法、田野调查、个案研究。推荐 1 至 2 种，不得超过 2 种，不得写“混合方法”“多种方法结合”等笼统答案。推荐 2 种时，一种为主方法，一种为辅助方法，并说明各自回答哪个子问题。教师有方法偏好且条件允许时优先考虑；条件不允许时，把它放进不推荐并说明原因。
5. 明确不推荐：列出与本案条件冲突的方法，尤其是教师偏好的方法和最容易被误选的方法，理由必须结合本案条件。
6. 一页纸设计：把研究问题拆成 2 至 4 个子问题，每个子问题一行，写清数据收集方式、对象、数据来源、需要的工具、收集时间点、分析方式和预期产出。
7. 伦理与实施提醒。

【方法适配约束】
- 准实验：需要可比较的平行班、至少一学期、可测量的结果。没有平行班时不得推荐。同一位教师同时教两个班时，必须提醒教师期望和教学差异会干扰比较。
- 问卷调查：适合了解较多人的现状或态度。只有一个班时只能做描述，不得用问卷数据推断“相关”或“影响”。小学低年级学生不适合独立填写多点量表问卷。
- 德尔菲法：需要多位领域专家参与多轮匿名征询，一般不适合教师个人课题；除非教师明确说明有专家资源，否则不推荐。
- 田野调查：需要长时间沉浸式观察和记录，研究周期短于一学年时一般不推荐。
- 行动研究：适合教师在自己课堂中按“计划—行动—观察—反思”循环改进。推荐时必须写明至少两轮循环，以及每轮收集什么证据，不得写成只有做法没有证据的工作总结。
- 个案研究：适合深入理解少数学生、班级或事件，要写明个案数量和选择理由。
- 访谈法和观察法常作为行动研究或个案研究的数据收集方式，写在 plan 中即可；作为主方法推荐时，要说明对象和次数。
- 分析能力为“都不太会，需要尽量简单”时，优先用次数、百分比、平均数等描述统计和按主题归类的整理，不推荐必须用统计软件的方法。
- 研究用途为课题申报或期刊论文时，说明需要达到怎样的证据要求；为个人教学改进时，以最小可行版本为主。

【写作要求】
- 用中文，句子短，面向一线教师。出现专业术语时，在后面的括号里用一句话解释，例如“三角互证（用不同来源的材料互相核对同一结论）”。
- 不编造文献、作者、量表名称、信度数据或政策文件。不写“证明”“显著提升”之类的结论性承诺，预期产出只写会得到什么材料和成果形式。
- minimal（最小可行版本）必须是一名教师、一个班、一学期内能做完的版本。
- 涉及学生数据时提醒匿名化；提醒教师向 AI 工具提交材料前删去姓名、学校等可识别信息。

【输出】只输出一个 JSON 对象，不加任何解释，不用代码围栏。结构如下：
{
  "analysis": {"object": "研究对象", "focus": "关键变量或现象", "context": "研究情境", "questionType": "描述型|关系型|干预型|过程型", "typeReason": "判断依据"},
  "scope": {"status": "可行|需收窄|需回到教练", "reason": "理由", "narrowed": "收窄后的研究问题，没有则为空字符串"},
  "titleCheck": {"title": "教师提供的题目或“未提供”", "implies": "题目承诺的证据", "conflict": "与条件的冲突，没有则写“无明显冲突”", "suggestion": "修改建议，没有则为空字符串"},
  "recommended": [{"method": "方法名", "role": "主方法|辅助方法", "why": "为什么适合本问题和条件", "limits": "本案中的局限", "data": "会产生什么数据", "minimal": "最小可行版本"}],
  "notRecommended": [{"method": "方法名", "reason": "不推荐的理由"}],
  "plan": [{"subQuestion": "子问题（疑问句）", "approach": "数据收集方式", "respondent": "学生|教师|家长|其他|无", "source": "数据来源", "tool": "需要的工具名称", "toolType": "问卷|访谈提纲|观察记录表|现有材料|无", "timing": "收集时间点", "analysis": "分析方式", "output": "预期产出"}],
  "ethics": ["伦理与实施提醒"],
  "pending": ["需要教师补充或核实的信息"]
}
数组上限：recommended 2 项，notRecommended 4 项，plan 4 项，ethics 6 项，pending 5 项。每个字符串不超过 200 字。
```

### 4.5 请求补充约束（逐字写入）

```js
const JSON_SUFFIX = '\n\n【请求补充约束】只输出一个 JSON 对象，第一个字符必须是“{”，最后一个字符必须是“}”。键名使用上面给出的英文键名，不得增删或翻译；枚举字段只能取列出的值。内容可能过长时，优先减少条目数量和字数，不要输出不完整的 JSON。';
design.requestSystem = design.system + JSON_SUFFIX;
```

`JSON_SUFFIX` 在 `research-data.js` 内部定义一次，工坊复用（第 5.5 节）。

### 4.6 规范化 `ResearchCore.parseDesign(raw)`

返回 `{design, warnings}`；不是 JSON 对象时返回 `null`。JSON 提取方式与 `parseReadingCard` 相同（去掉代码围栏，取第一个 `{` 到最后一个 `}`），但写成新的内部函数 `jsonObject(raw)`，**不改** `parseReadingCard`。

常量（导出）：

```js
METHODS = ['问卷调查','访谈法','观察法','行动研究','准实验','德尔菲法','田野调查','个案研究']
QUESTION_TYPES = ['描述型','关系型','干预型','过程型']
SCOPE_STATUS = ['可行','需收窄','需回到教练']
RESPONDENTS = ['学生','教师','家长','其他','无']
TOOL_TYPES = ['问卷','访谈提纲','观察记录表','现有材料','无']
```

规则：

1. 字符串字段：非字符串视为空；换行压成空格；截到 200 字（截断时不切开 emoji，复用 `truncateText`）。必填字符串为空时填「未给出」并把所在顶层键加入 warnings。
2. `analysis.questionType`：含「描述」「关系」「干预」「过程」之一时归为对应值，否则为「待判断」并警告。
3. `scope.status`：含「教练」或「回到」→ 需回到教练；含「收窄」→ 需收窄；其余 → 可行。`narrowed` 可为空；status 为需收窄但 narrowed 为空时警告。
4. `titleCheck.title` 为空时写「未提供」。
5. 方法名规范化 `normalizeMethod(name)`：完全相等直接通过；否则按关键词归并——「问卷」→问卷调查，「访谈」→访谈法，「观察」→观察法，「行动」→行动研究，「准实验」或「对照」→准实验，「德尔菲」→德尔菲法，「田野」→田野调查，「个案」或「案例」→个案研究。名称含「混合」「多种」「综合」时返回空。无法归并返回空。
6. `recommended`：逐项规范化方法名，去掉空值和重复，最多 2 项；有丢弃时警告。`role` 只能是主方法或辅助方法，缺省时第一项为主方法、第二项为辅助方法。两项都标主方法时，第二项改为辅助方法。
7. `notRecommended`：规范化方法名，丢弃空值和已出现在 recommended 中的方法（发生时警告），最多 4 项。
8. `plan`：丢弃 subQuestion 为空的行，最多 4 行。`respondent` 不在 RESPONDENTS 中时：含「生」→学生，含「师」→教师，含「家长」→家长，否则「其他」。`toolType` 含「问卷」→问卷，含「访谈」→访谈提纲，含「观察」→观察记录表，含「现有」「已有」「作业」「成绩」→现有材料，否则「无」。
9. `scope.status === '需回到教练'` 时，强制 `recommended=[]`、`plan=[]`；否则 recommended 或 plan 为空时警告。
10. `ethics` 最多 6 项，`pending` 最多 5 项，均为非空字符串。
11. 丢弃所有未知键。结果对象只含 analysis、scope、titleCheck、recommended、notRecommended、plan、ethics、pending 八个键。

warnings 非空时，结果区顶部显示 `missingFieldsHint`（v1 已有字段，占位符 `{fields}`），字段名用中文：analysis 问题解析、scope 范围检查、titleCheck 题目承诺检查、recommended 推荐方法、notRecommended 不推荐的方法、plan 一页纸设计、ethics 伦理提醒、pending 待核实。解析失败时与精读卡相同：显示 `designFormatError`、原始回复、「重试」「复制原始回复」。

### 4.7 结果呈现（`ResearchMethods.designHTML(design, ctx, copy, options)`）

结果区 `<div class="rs-panel rs-design-response">`，头部有小头像、`designResponseLabel`（新字段，默认「研究设计」；不要复用精读卡的 `responseLabel`）、预览按钮、模型标签 `#rs-design-model`。正文 `<article class="rs-method-document">` 按顺序：

1. **问题解析**（`designAnalysisHeading`）：研究对象、关键变量或现象、研究情境、问题类型用定义列表 `<dl>`；问题类型旁显示判断依据。
2. **范围检查**（`designScopeHeading`）：状态徽标——可行用成功色 #287a68，需收窄和需回到教练用提醒色 #a76f18；徽标必须同时有文字，不能只靠颜色。需收窄时显示「收窄后的研究问题」。需回到教练时显示理由和按钮「回研究问题教练聚焦」（`designToCoachAction`），并且**不渲染**第 3 至 7 部分。
3. **题目承诺检查**（`designTitleHeading`）：仅在 `titleCheck.title !== '未提供'` 时显示。
4. **推荐方法**（`designRecommendedHeading`）：每种方法一块，标题为「方法名 · 主方法/辅助方法」，下列适合理由、局限、会产生的数据；「最小可行版本」（`designMinimalLabel`）用浅色底块突出。
5. **不推荐的方法**（`designExcludedHeading`）：列表「方法名：理由」。
6. **一页纸研究设计**（`designPlanHeading`）：表格 8 列——子问题、收集方式、对象、数据来源、工具、时间点、分析方式、预期产出。宽于 560px 时放在可横向滚动的 `.rs-table-scroll` 中，首列固定宽度；560px 及以下改为每行一张卡片，表头作为卡片内标签。
7. **需要准备的工具**（`designToolsHeading`）：从 plan 中取 toolType 为问卷、访谈提纲、观察记录表的行，每行显示「子问题 → 工具名」和按钮「去研究工具工坊设计」（`designToWorkshopAction`，`data-design-row="<行序号>"`）。toolType 为现有材料时显示「使用已有材料：{source}」，不显示按钮。没有需要设计的工具时整块不显示。
8. **伦理与实施提醒**（`designEthicsHeading`）、**需要你补充或核实**（`designPendingHeading`）：列表，空数组时不显示该块。

结果下方操作条（`rs-actions rs-result-actions`）：预览、保存研究设计（主操作，`designSaveAction`）、复制 Markdown（复用 `markdownAction`）、复制设计表（`designTsvAction`）、重试（复用 `retryAction`）。只读模式（从备课本打开）隐藏保存和重试，显示「基于此设计新建」（`designNewAction`）。

生成完成后焦点移到结果区标题，`aria-live` 区域报告完成；生成中断时保留已收到的原始回复（与精读卡相同，使用 `incompleteHint`）。

### 4.8 导出

- `ResearchCore.designToMarkdown(design, {question, title, conditions})`：标题 `# 研究设计：{收窄后的问题或原问题}`，之后依次为研究问题、拟定题目、我的条件（每项一行）、问题解析、范围检查、题目承诺检查（有题目时）、推荐方法、不推荐的方法、一页纸研究设计（Markdown 表格，单元格中的 `|` 转义、换行压成空格）、需要准备的工具、伦理与实施提醒、需要补充或核实。
- `ResearchCore.designPlanTsv(design)`：第一行为 8 列表头，后面每行一个子问题。单元格内的制表符和换行替换为空格；以 `=`、`+`、`-`、`@` 开头的单元格前加 `'`（与 v1 相同的公式注入防护）。粘贴到 Excel 或 WPS 表格后正好 8 列。

---
## 5. 研究工具工坊（`research-instrument`）

### 5.1 身份与入口

- `RESEARCH_AGENTS` 第 4 项：`{id:'research-instrument', name:'研究工具工坊', type:'form', roleName:'研究工具工坊', tagline:'起草和审查问卷、访谈提纲、观察记录表', kinds:['questionnaire','interview','observation'], kindNames:{questionnaire:'问卷', interview:'访谈提纲', observation:'观察记录表'}, options, systems:{questionnaire, interview, observation, review}, requestSystems:{同四个键}, buildUserMessage, buildReviewMessage}`。没有单一的 `system` 字段。
- 视图 `#instrument`，DOM 根节点 `<section id="rs-instrument" class="rs-view" hidden>`。`normalizedView()` 增加 `'research-instrument':'instrument'`。
- 肖像 `/assets/agent-portraits/research-instrument.jpg`。工作台头部与设计顾问相同，ⓘ 使用说明为 `instrumentGuide`。

### 5.2 表单

表单 `<form id="rs-instrument-form" novalidate>`。工具类型用 `role="tablist"` 的三个标签（问卷、访谈提纲、观察记录表），键盘左右方向键切换，做法与 v1 精读卡「上传 PDF / 粘贴文字」标签相同。切换类型只改变下方专属字段的显示，不清空已填的共同字段。

**共同字段**

| 字段 | 控件 | 必填 | 选项或限制 |
|---|---|---|---|
| 从备课本中的研究设计导入 | 两个联动 `<select>` | 否 | 第一个列出 `agentId==='research-design'` 且 plan 中有问卷、访谈提纲或观察记录表的条目，最多 20 条；第二个列出所选设计中这类子问题，文字为「子问题 · 工具类型」。选定后填入研究问题（需收窄时用收窄后的问题）、子问题、工具类型、对象和学段。未登录时禁用并显示 `loginHint` |
| 起点 `source` | 单选 | 是，默认从零起草 | 从零起草、审查我的草稿 |
| 我的草稿 `draft` | `<textarea>` | 起点为审查时必填 | ≤6000 字，显示字数；只在「审查我的草稿」时显示 |
| 研究问题 | `<textarea>` | 是 | ≤300 字 |
| 子问题 | `<textarea>` | 是 | ≤200 字 |
| 对象 `respondent` | 单选（问卷、访谈） | 是 | 学生、教师、家长、其他 |
| 观察对象 `target` | `<input>`（观察表） | 是 | ≤60 字，占位 `targetPlaceholder` |
| 学段 `stage` | 单选 | 是 | 与设计顾问相同的 5 项 |

**问卷专属**

| 字段 | 控件 | 选项或限制 |
|---|---|---|
| 维度 | `<textarea>` | 可选，每行一个，写成「名称：含义」，≤600 字，最多 6 行；超过 6 行显示 `dimensionsLimitError` 并阻止提交 |
| 每个维度题数 | `<select>` | 3、4、5、6，默认 4；起点为审查时隐藏 |
| 选项类型 `scale` | 单选 | 5点、4点、3点、是否，默认 5点。当学段为小学低年级且对象为学生时，**第一次**满足该条件自动改为 3点并在字段下方显示 `lowGradeHint`；教师之后手动改回不再干预 |
| 需要基本信息 | 复选框 | 默认勾选 |
| 参考的成熟量表 | `<input>` | 可选，≤80 字 |

**访谈提纲专属**

| 字段 | 控件 | 选项或限制 |
|---|---|---|
| 访谈形式 `format` | 单选 | 半结构式个别访谈、焦点小组访谈，默认前者 |
| 访谈时长 `duration` | 单选 | 15、30、45（界面显示「15 分钟」等，值为数字字符串），默认 30 |
| 想了解的话题 | `<textarea>` | 可选，≤500 字 |

**观察记录表专属**

| 字段 | 控件 | 选项或限制 |
|---|---|---|
| 观察场景 `scene` | 单选 | 课堂教学、作业完成过程、小组活动、课间或其他；必填 |
| 想观察的维度或行为 | `<textarea>` | 可选，≤600 字 |
| 取样方式 `sampling` | 单选 | 时间取样、事件取样，默认时间取样；旁边 ⓘ 为 `samplingHint` |
| 观察者 `observer` | 单选 | 本人、同事，默认本人 |

主按钮文字：从零起草时为 `instrumentGenerateAction`，审查草稿时为 `instrumentReviewDraftAction`。缺必填项时在 `#rs-instrument-error` 显示 `instrumentRequiredError` 并聚焦第一个缺项。研究问题和子问题按 uid 存到 `localStorage['rsInstrumentDraft:'+uid]`（JSON：`{question, subQuestion}`），换号时恢复；草稿正文**不**存本地。

### 5.3 用户消息模板

**`instrument.buildUserMessage(ctx)`**，`ctx = {kind, source, question, subQuestion, respondent, target, stage, draft, dimensions, perDimension, scale, demographics, scaleName, format, duration, topics, scene, sampling, observer}`。逐行如下，括号里的空值写法必须照做：

```
【工具类型】{问卷|访谈提纲|观察记录表}
【来源】{从零起草|审查我的草稿}
【研究问题】{question}
【子问题】{subQuestion}
```

问卷接着写：

```
【填答对象】{respondent}（{stage}）
【维度】
{每行一个“名称：含义”；未填写时这一行写“未提供，请拟定 2 至 4 个”}
【每个维度题数】{perDimension}            ← 仅从零起草时出现
【量表类型】{scale}
【人口学信息】{需要|不需要}
【参考的成熟量表】{scaleName 或 “无”}
```

访谈提纲接着写：

```
【受访对象】{respondent}（{stage}）
【访谈形式】{format}
【时长】{duration} 分钟
【想了解的话题】{topics 或 “未提供”}
```

观察记录表接着写：

```
【观察场景】{scene}
【观察对象】{target}（{stage}）
【维度或行为】{填写内容，未填写时写“未提供，请拟定 2 至 4 个”}
【取样方式】{sampling}
【观察者】{observer}
```

起点为审查时最后加：

```
【草稿】
{draft 原文，保留换行}
```

**`instrument.buildReviewMessage(inst, ctx)`**：用于「重新审查」。条目文字中的换行压成空格；空文字的条目不发送。

```
【任务】重新审查
【工具类型】{问卷|访谈提纲|观察记录表}
【研究问题】{question}
【子问题】{subQuestion}
【对象】{respondent 或 target}（{stage}）
【量表类型】{scale.type}                    ← 仅问卷
【时长】{duration} 分钟                     ← 仅访谈
【取样方式】{sampling.mode}：{sampling.rule} ← 仅观察
【当前条目】
```

条目行的格式（每条一行）：

| 工具 | 行格式 |
|---|---|
| 问卷 | `Q1［维度：学习兴趣］我喜欢上数学课。`；反向题写 `Q2［维度：学习兴趣］［反向题］……` |
| 访谈 | `W1［暖场］……`、`B1［主问题·话题：作业经历］……`、`B1-1［追问］……`、`C1［收尾］……` |
| 观察 | `O1［维度：任务投入］［记录：计数］……`；等级项在末尾加 `（等级：1级 ……／2级 ……／3级 ……）` |

请求体与设计顾问相同，`agentId:'research-instrument'`，system 为 `instrument.requestSystems[kind]`（重新审查时为 `requestSystems.review`）。

### 5.4 系统提示词

下面四个二级标题是测试定位锚点，不要改名、加编号或在前文重复。代码块内容分别逐字写入 `instrument.systems.questionnaire`、`.interview`、`.observation`、`.review`（去掉首尾空白）。

## 工坊系统提示：问卷

```
你是一位熟悉中小学教育测量的问卷设计顾问，帮一线教师为一个研究子问题起草或审查问卷。你只设计和审查工具，不编造量表原题、信度数据、常模、研究发现或文献。

【依据】只依据教师提供的研究问题、子问题、填答对象、学段、维度、每个维度题数、量表类型、人口学信息要求、参考的成熟量表名称和草稿。

【维度】
- 教师提供了维度时逐一使用，source 写“教师提供”，definition 写教师给出的含义；教师没写含义时补一句简短定义。
- 教师没有提供维度时，根据子问题拟定 2 至 4 个维度，source 写“AI拟定”，并在 pending 中提醒教师确认这些维度是否切合子问题。
- 教师写了参考的成熟量表名称时，不得写出或声称知道原量表的原题、作者、题数、计分方式或信度，只能依据教师的描述改编题目，adaptationNotice 必须逐字写：“以下为依据你的描述改编，不是原量表原文，请核对原量表并确认使用许可。”没有写成熟量表时，adaptationNotice 为空字符串。

【题目要求】
- 一题只问一件事；不用引导性措辞；不用“总是”“从不”“所有”等绝对词；不用否定句和双重否定；不用填答对象不理解的术语；不问超出填答对象知道或记得的事；避免让人只想选“好答案”的社会赞许措辞。
- 需要回忆的题目写明时间范围，例如“最近一个月”。
- 每道题属于一个维度，并与该维度的含义一致；不同题目不得意思重复。
- 从零起草时，每个维度按教师要求的题数出题，每个维度 3 至 6 题，全卷不超过 30 题，你写的每道题不超过 60 字。
- 反向题（与维度方向相反的表述）可以不设；设置时不超过总题数的五分之一，reverse 写 true，并且不与它对应的正向题相邻。
- 量表按教师选择的类型。scale.labels 从低到高排列，数量与点数一致：5点为“非常不符合、比较不符合、说不清、比较符合、非常符合”，4点为“完全不符合、比较不符合、比较符合、完全符合”，3点为“不像我、有点像我、很像我”，是否为“否、是”。审查草稿时，草稿用了其他选项文字就照抄。
- 填答对象是小学低年级学生时只用 3点或是否，并在 administration.notes 中提醒由教师逐题读题，或改用访谈。
- instructions（指导语）写明研究目的、匿名、自愿、答案没有对错、大约用时。
- 需要人口学信息时，只收集与子问题有关的最少项目，最多 6 项，不收集姓名、学号、电话、家庭收入、家长职业等可识别或敏感信息；不需要时 demographics 为空数组。

【两种来源】
- 来源为“从零起草”：按上面的要求起草完整问卷。review 只列出你认为教师仍需留意的风险，最多 5 条；没有就写空数组。
- 来源为“审查我的草稿”：items 逐字抄录教师草稿中的题目，保持原顺序，按 Q1、Q2……编号，不得自行改写、删除或合并；草稿超过 40 题时只抄录前 40 题，并在 pending 中说明。维度按草稿的归属填写；草稿没有分维度时由你归类，归不进任何维度的写“未分维度”。修改意见全部写在 review 中：每道有问题的题至少一条，original 抄录该题原句；没有问题的题不写。草稿缺少指导语时由你补写，并在 pending 中注明“指导语为 AI 补写”。

【审查条目】
- itemId 必须是 items 中存在的编号。
- issue 只能取：双重问题、引导性、绝对词、否定或双重否定、术语或抽象、与维度不符、意思重复、社会赞许、超出对象认知、时间范围模糊、反向题设置、其他。
- action 只能取：改写、拆分、删除、保留并提醒。改写时 suggestion 是可以直接替换原题的完整题目；拆分时 suggestion 写拆分后的几道题，用“／”分隔；删除和保留并提醒时 suggestion 写简短建议。
- reason 用一句话说明为什么，面向一线教师。

【施测建议】administration.pilot 写试测建议，例如先请 3 至 5 名同类对象试填并说出对每道题的理解；duration 写预计用时；notes 写发放、回收和匿名处理的提醒。

【写作要求】用中文，句子短。出现专业术语时，在后面的括号里用一句话解释。

【输出】只输出一个 JSON 对象，不加任何解释，不用代码围栏。结构如下：
{
  "kind": "questionnaire",
  "title": "问卷标题",
  "respondent": "填答对象",
  "instructions": "指导语",
  "scale": {"type": "5点|4点|3点|是否", "labels": ["从低到高的选项文字"]},
  "demographics": [{"label": "项目", "options": ["选项"]}],
  "dimensions": [{"name": "维度名", "definition": "含义", "source": "教师提供|AI拟定"}],
  "items": [{"id": "Q1", "dimension": "维度名", "text": "题目", "reverse": false}],
  "review": [{"itemId": "Q1", "issue": "问题类型", "original": "原句", "action": "改写|拆分|删除|保留并提醒", "suggestion": "建议", "reason": "理由"}],
  "administration": {"pilot": "试测建议", "duration": "预计用时", "notes": ["提醒"]},
  "adaptationNotice": "",
  "pending": ["需要教师确认的事项"]
}
数组上限：demographics 6 项，每项 options 8 个，dimensions 6 项，items 40 项，review 30 条，administration.notes 5 条，pending 5 条。题目以外的每个字符串不超过 200 字。
```

## 工坊系统提示：访谈提纲

```
你是一位熟悉中小学质性研究的访谈设计顾问，帮一线教师为一个研究子问题起草或审查访谈提纲。你只设计和审查工具，不编造研究发现或文献。

【依据】只依据教师提供的研究问题、子问题、受访对象、学段、访谈形式、时长、想了解的话题和草稿。

【结构】
- opening（开场说明）：教师可以照着念的口语化开场，说明访谈者身份、访谈目的、大约用时、是否录音并征得同意、可以随时停止或不回答、内容匿名处理且不影响任何评价。consentPoints 逐条列出开场中需要对方明确同意的事项。
- warmup：2 个轻松、容易回答的暖场问题，编号 W1、W2。
- blocks：主题块。时长 15 分钟写 2 至 3 块，30 分钟写 3 至 4 块，45 分钟写 4 至 5 块。每块编号 B1、B2……，包含一个话题 topic、一个开放式主问题 main，以及 2 至 3 个追问 probes，追问编号 B1-1、B1-2……。主问题优先请对方讲具体经历，例如“能讲讲最近一次……的情况吗？”；追问用来问细节、请对方举例、问当时的感受和想法。
- closing：一个收尾问题，编号 C1，例如“关于……还有什么想补充的吗？”；closingStatement 写致谢和后续说明。
- fieldNotes：访谈现场提醒，例如记下停顿和表情、不打断、不评价对方的回答、访谈当天整理记录。

【提问要求】
- 主问题不得是可以用“是/不是”“有/没有”回答的封闭式问题。
- 不预设答案，不带引导，不用受访者不熟悉的术语，一次只问一件事。
- 敏感问题放在访谈中后段，并给出可以不回答的说法。
- 受访者是学生时：问题短而具体，少用连续的“为什么”，多问“当时发生了什么”“你是怎么想的”；提醒教师在公开场所或有其他成人在场时进行，小学生单次不超过 20 分钟，并事先取得监护人同意。
- 受访者是家长时：不请家长评价其他学生或任课教师，避免涉及家庭隐私。
- 受访者是教师同事时：说明访谈内容不用于考核评价，并留意双方的权力关系。
- 访谈形式是焦点小组访谈时：建议 4 至 6 人，提醒主持人邀请发言少的人，并请参与者对他人的发言保密。

【两种来源】
- 来源为“从零起草”：按上面的结构起草完整提纲。review 只列出你认为教师仍需留意的风险，最多 5 条；没有就写空数组。
- 来源为“审查我的草稿”：warmup、blocks、closing 逐字抄录教师草稿中的问题，保持原顺序，按上面的规则编号，不得自行改写、删除或合并。草稿中分不清主问题和追问时，每个问题各作一个主题块的主问题，topic 由你概括。草稿缺少暖场问题时 warmup 为空数组，缺少收尾问题时 closing 为 null，都不要补写，并在 pending 中说明。草稿缺少开场说明时由你补写，并在 pending 中注明“开场说明为 AI 补写”。修改意见全部写在 review 中：每个有问题的问题至少一条，original 抄录原句；没有问题的不写。

【审查条目】
- itemId 必须是提纲中存在的编号（W1、B1、B1-1、C1 这类）。
- issue 只能取：封闭式提问、引导或预设、术语或抽象、一问多事、敏感问题位置、超出对象认知、与子问题无关、题量与时长不符、其他。
- action 只能取：改写、拆分、删除、保留并提醒。改写时 suggestion 是可以直接替换原句的完整问题；拆分时用“／”分隔拆分后的几个问题；删除和保留并提醒时 suggestion 写简短建议。
- reason 用一句话说明为什么，面向一线教师。

【写作要求】用中文，口语化，句子短。出现专业术语时，在后面的括号里用一句话解释。

【输出】只输出一个 JSON 对象，不加任何解释，不用代码围栏。结构如下：
{
  "kind": "interview",
  "title": "访谈提纲标题",
  "respondent": "受访对象",
  "format": "半结构式个别访谈|焦点小组访谈",
  "duration": "15|30|45",
  "opening": "开场说明",
  "consentPoints": ["需要对方同意的事项"],
  "warmup": [{"id": "W1", "text": "暖场问题"}],
  "blocks": [{"id": "B1", "topic": "话题", "main": "主问题", "probes": [{"id": "B1-1", "text": "追问"}]}],
  "closing": {"id": "C1", "text": "收尾问题"},
  "closingStatement": "致谢与后续说明",
  "review": [{"itemId": "B1", "issue": "问题类型", "original": "原句", "action": "改写|拆分|删除|保留并提醒", "suggestion": "建议", "reason": "理由"}],
  "fieldNotes": ["现场提醒"],
  "pending": ["需要教师确认的事项"]
}
数组上限：consentPoints 6 项，warmup 3 项，blocks 8 块，每块 probes 5 项，review 25 条，fieldNotes 6 条，pending 5 条；从零起草时仍按上面的结构数量。opening 不超过 400 字，其他每个字符串不超过 200 字。
```

## 工坊系统提示：观察记录表

```
你是一位熟悉中小学课堂观察的研究顾问，帮一线教师为一个研究子问题起草或审查结构化观察记录表。你只设计和审查工具，不编造研究发现或文献。

【依据】只依据教师提供的研究问题、子问题、观察场景、观察对象、学段、维度或行为、取样方式、观察者和草稿。

【维度与观察项】
- 教师提供了维度或行为时逐一使用，source 写“教师提供”；没有提供时根据子问题拟定 2 至 4 个维度，source 写“AI拟定”，并在 pending 中提醒教师确认。
- 从零起草时，每个维度 3 至 5 个观察项，全表不超过 20 个。观察项编号 O1、O2……，全表连续编号。
- 观察项必须写成看得见、可以记录的具体行为，例如“眼睛看向作业本并持续书写超过 1 分钟”。不得使用“很专注”“积极”“认真”“理解了”“感兴趣”等需要推断内心的词。
- 一个观察项只写一种行为。
- record（记录方式）只能取：勾选（出现就打勾）、计数（记录出现次数）、等级（按标准评 1 至 3 级）。用等级时，levels 按 1 级到 3 级写 3 条可观察的判断标准；不用等级时 levels 为空数组。

【取样】
- 时间取样：rule 写每隔多久记录一次、每次看多长时间；slots 列出记录时间点，例如“第5分钟”，不超过 10 个。
- 事件取样：rule 写清什么情况算一次事件开始、什么情况算结束；slots 写“第1次”“第2次”……，不超过 10 个。
- 观察对象较多时，建议每次轮流重点观察 4 至 6 名学生或 1 至 2 个小组，并用编号代替姓名，写进 recordingRules。

【观察者】
- 观察者是本人时，在 recordingRules 中提醒边上课边记录的负担，建议减少观察项，或在事先取得同意后课后回看录像补记。
- agreement（记录一致性）：观察者是同事时，写观察前统一标准、一起试看同一段课、比对记录差异的做法；观察者是本人时，写如何请同事抽查部分记录。

【两种来源】
- 来源为“从零起草”：按上面的要求起草完整记录表。review 只列出你认为教师仍需留意的风险，最多 5 条；没有就写空数组。
- 来源为“审查我的草稿”：indicators 逐字抄录教师草稿中的观察项，保持原顺序，按 O1、O2……编号，不得自行改写、删除或合并；维度按草稿的归属填写，草稿没有分维度时由你归类；record 按草稿填写，草稿没写时由你判断。修改意见全部写在 review 中：每个有问题的观察项至少一条，original 抄录原句；没有问题的不写。

【审查条目】
- itemId 必须是表中存在的编号。
- issue 只能取：推断性描述、一项多行为、不可计数、与维度不符、意思重复、超出观察条件、取样不清、其他。
- action 只能取：改写、拆分、删除、保留并提醒。改写时 suggestion 是可以直接替换原句的完整观察项；拆分时用“／”分隔；删除和保留并提醒时 suggestion 写简短建议。
- reason 用一句话说明为什么，面向一线教师。

【伦理】ethics 写观察前告知、录像需事先取得同意、记录用编号代替姓名、观察结果不用于给学生贴标签等提醒。

【写作要求】用中文，句子短。出现专业术语时，在后面的括号里用一句话解释。

【输出】只输出一个 JSON 对象，不加任何解释，不用代码围栏。结构如下：
{
  "kind": "observation",
  "title": "记录表标题",
  "scene": "观察场景",
  "target": "观察对象",
  "observer": "本人|同事",
  "sampling": {"mode": "时间取样|事件取样", "rule": "取样规则", "slots": ["记录时间点或第几次"]},
  "dimensions": [{"name": "维度名", "source": "教师提供|AI拟定", "indicators": [{"id": "O1", "behavior": "可观察的行为", "record": "勾选|计数|等级", "levels": []}]}],
  "recordingRules": ["记录规则"],
  "agreement": "记录一致性的核对做法",
  "review": [{"itemId": "O1", "issue": "问题类型", "original": "原句", "action": "改写|拆分|删除|保留并提醒", "suggestion": "建议", "reason": "理由"}],
  "ethics": ["伦理提醒"],
  "pending": ["需要教师确认的事项"]
}
数组上限：dimensions 6 个，每个维度 indicators 8 个，全表 indicators 30 个，slots 10 个，recordingRules 5 条，review 30 条，ethics 5 条，pending 5 条。每个字符串不超过 200 字。
```

## 工坊系统提示：重新审查

```
你是一位研究工具审查顾问。教师已经修改了自己的研究工具，请你逐条重新审查消息中的【当前条目】。你只审查，不改写整份工具，不编造研究发现或文献。

【依据】只依据消息中的工具类型、研究问题、子问题、对象、学段、量表类型或时长或取样方式，以及【当前条目】。每个条目以编号开头，方括号里是该条目的维度、类型或记录方式等信息，方括号之后才是条目文字。

【审查要求】
- 只指出真实存在的问题，不为凑数挑错。所有条目都没有明显问题时，review 为空数组，并在 summary 中说明。
- 问卷：一题一事，无引导性，无绝对词，无否定或双重否定，无术语，与所属维度一致，不重复，无社会赞许倾向，不超出对象认知，回忆类题目有时间范围，反向题不超过总题数的五分之一且不与对应正向题相邻。小学低年级学生不宜使用 4点或 5点量表。
- 访谈提纲：主问题开放，无引导或预设，无术语，一问一事，敏感问题位置合适，适合受访对象，与子问题相关，主题块数量与时长相符（15 分钟 2 至 3 块，30 分钟 3 至 4 块，45 分钟 4 至 5 块）。
- 观察记录表：每项是看得见的具体行为而不是推断，一项一种行为，能按标注的记录方式记录，与维度一致，不重复，在给定场景和观察者条件下做得到，取样规则清楚。

【审查条目】
- itemId 必须是【当前条目】中出现的编号；涉及整份工具的问题（如题量与时长不符）写在最相关的条目上。
- original 逐字抄录该编号的当前文字，不含编号和方括号部分。
- issue 只能从对应工具类型的列表中选：
  问卷：双重问题、引导性、绝对词、否定或双重否定、术语或抽象、与维度不符、意思重复、社会赞许、超出对象认知、时间范围模糊、反向题设置、其他；
  访谈提纲：封闭式提问、引导或预设、术语或抽象、一问多事、敏感问题位置、超出对象认知、与子问题无关、题量与时长不符、其他；
  观察记录表：推断性描述、一项多行为、不可计数、与维度不符、意思重复、超出观察条件、取样不清、其他。
- action 只能取：改写、拆分、删除、保留并提醒。改写时 suggestion 是可以直接替换原句的完整条目；拆分时用“／”分隔；删除和保留并提醒时 suggestion 写简短建议。
- reason 用一句话说明为什么，面向一线教师。

【写作要求】用中文，句子短。出现专业术语时，在后面的括号里用一句话解释。

【输出】只输出一个 JSON 对象，不加任何解释，不用代码围栏。结构如下：
{"review": [{"itemId": "Q1", "issue": "问题类型", "original": "当前原句", "action": "改写|拆分|删除|保留并提醒", "suggestion": "建议", "reason": "理由"}], "summary": "一两句总体评价"}
review 最多 30 条，每个字符串不超过 200 字。
```

### 5.5 请求补充约束

```js
instrument.requestSystems = Object.fromEntries(Object.entries(instrument.systems).map(([k, v]) => [k, v + JSON_SUFFIX]));
```

`JSON_SUFFIX` 与第 4.5 节是同一个常量。

### 5.6 规范化

导出常量：

```js
INSTRUMENT_KINDS = ['questionnaire','interview','observation']
KIND_NAMES = {questionnaire:'问卷', interview:'访谈提纲', observation:'观察记录表'}
ISSUES = {
  questionnaire: ['双重问题','引导性','绝对词','否定或双重否定','术语或抽象','与维度不符','意思重复','社会赞许','超出对象认知','时间范围模糊','反向题设置','其他'],
  interview: ['封闭式提问','引导或预设','术语或抽象','一问多事','敏感问题位置','超出对象认知','与子问题无关','题量与时长不符','其他'],
  observation: ['推断性描述','一项多行为','不可计数','与维度不符','意思重复','超出观察条件','取样不清','其他']
}
ACTIONS = ['改写','拆分','删除','保留并提醒']
REVIEW_STATUS = ['未处理','已采用','条目已删除']
SCALE_LABELS = {'5点':['非常不符合','比较不符合','说不清','比较符合','非常符合'], '4点':['完全不符合','比较不符合','比较符合','完全符合'], '3点':['不像我','有点像我','很像我'], '是否':['否','是']}
ADAPTATION_NOTICE = '以下为依据你的描述改编，不是原量表原文，请核对原量表并确认使用许可。'
LIMITS = {items:40, probes:5, blocks:8, warmup:3, indicatorsPerDimension:8, indicators:30, dimensions:6, slots:10, review:30}
```

`ADAPTATION_NOTICE` 必须与问卷提示词中引号里的句子完全相同，测试会比对。

**`ResearchCore.parseInstrument(raw, kind, ctx, {keepStatus=false}={})`** 返回 `{instrument, warnings}`，不是 JSON 对象或核心列表为空（问卷无题、访谈无主题块、观察无观察项）时返回 `null`。`ctx` 至少含 `{scale, duration, sampling, observer, scaleName}`，用作模型缺字段时的回退值。

1. 字符串：同设计顾问的清洗规则。上限：题目、问题、观察项文字 150 字（教师原句可能长于 60 字）；访谈 `opening` 400 字；量表选项文字、slot 20 字；人口学选项 30 字；其余 200 字。
2. `kind` 一律设为调用方传入的值；模型写的 kind 不同时只警告。
3. **问卷**：`scale.type` 含「5」→5点、含「4」→4点、含「3」→3点、含「是否」或「是/否」→是否，都不含时用 `ctx.scale`；`labels` 数量与点数相同（是否为 2）且都非空时保留，否则用 `SCALE_LABELS` 并警告 `scale`。`dimensions` 最多 6 个，名称为空的丢弃；`source` 含「教师」为教师提供，否则 AI拟定。`items` 丢弃空文字，最多 40 题；`dimension` 不在维度名中且不是「未分维度」时改为「未分维度」并警告 `items`；`reverse` 只在值为 `true`、`"true"` 或「是」时为 true。`demographics` 最多 6 项，每项 options 最多 8 个。`adaptationNotice`：`ctx.scaleName` 非空时强制为 `ADAPTATION_NOTICE`，否则为空字符串。
4. **访谈**：`format` 含「焦点」→焦点小组访谈，否则半结构式个别访谈；`duration` 取 15、30、45 中与模型值数字相同者，否则用 `ctx.duration`。warmup 最多 3 个，blocks 最多 8 块，主问题为空的块丢弃，`topic` 为空时写「未命名话题」，每块 probes 最多 5 个；`closing` 不是含非空 text 的对象时为 `null`。
5. **观察**：`observer` 含「同事」→同事，否则本人；`sampling.mode` 含「事件」→事件取样，否则时间取样；slots 最多 10 个。dimensions 最多 6 个，每个最多 8 个观察项，全表最多 30 个，超出部分丢弃并警告。`record` 含「计数」或「次数」→计数，含「等级」或「评分」→等级，否则勾选；等级项的 levels 少于 3 条时用「待补充标准」补足并警告 `dimensions`，多于 3 条截取前 3 条；非等级项 levels 为空数组。
6. **编号**：编号规则——问卷 `Q\d{1,2}`；访谈暖场 `W\d`、主题块 `B\d{1,2}`、追问必须是 `所属块编号-\d`、收尾固定 `C1`；观察 `O\d{1,2}`。全部编号都合规且不重复时保留；只要有一个不合规或重复，就**全部按位置重新编号**（问卷 Q1…，访谈 W1…、B1…、B1-1…、C1，观察 O1… 跨维度连续），同时丢弃全部 review 条目并警告 `review`（编号对不上时，审查意见无法可靠对应）。
7. **review**：`itemId` 不在当前条目编号中的丢弃；`issue` 不在该类型 `ISSUES` 中时为「其他」；`action` 含「改写」「拆分」「删除」「保留」时取对应值，否则为保留并提醒；`original` 一律改为该条目当前文字；同一 itemId 与 issue 重复的只留第一条；最多 30 条。`status`：`keepStatus` 为 true 且原值在 `REVIEW_STATUS` 中时保留，否则为「未处理」。
8. 其余数组（consentPoints、fieldNotes、recordingRules、ethics、administration.notes、pending）按提示词上限截取，丢弃空字符串。丢弃所有未知键。

**`ResearchCore.parseReview(raw, inst)`** 返回 `{review, summary, warnings}`；不是 JSON 对象或没有 `review` 数组时返回 `null`。review 按上面第 7 条规范化（status 一律为未处理），`summary` 截到 200 字。

### 5.7 编辑用纯函数（`research-core.js`，均返回新对象，不修改入参）

- `instrumentEntries(inst)`：返回扁平列表 `[{id, text, group, type}]`。问卷 `type:'item'`、group 为维度名；访谈依次为暖场（group「暖场」）、每块主问题（group「主问题·话题：{topic}」）及其追问（group「追问」）、收尾（group「收尾」）；观察 `type:'indicator'`、group 为维度名。空文字条目也列出（编辑中），但 `buildReviewMessage`、打印、导出和保存前用 `compactInstrument(inst)` 去掉空文字条目和没有主问题的块。
- `updateEntry(inst, id, text)`：改条目文字，截到 150 字。
- `applySuggestion(inst, index)`：只处理 `status==='未处理'` 且该条目当前文字等于 `original` 的审查行。action 为改写时用 suggestion 替换条目文字；为删除时删除该条目（同 `removeEntry`）。两种情况都把该行 status 设为已采用。其他 action 或条件不满足时原样返回。
- `removeEntry(inst, id)`：删除条目；删除访谈主问题时整块（含追问）删除。所有指向被删条目的审查行 status 改为「条目已删除」。删除后**不重新编号**，保证其余审查行仍能对应。
- `addEntry(inst, {type, group, blockId})`：在该组末尾新增空条目，编号取同类最大编号加 1（问卷 Q、观察 O、暖场 W、主题块 B、追问 `{blockId}-n`）。达到 `LIMITS` 时返回原对象并由界面提示已达上限。访谈收尾只有一个，已有时不新增。

### 5.8 规则检查 `ResearchCore.instrumentChecks(inst, ctx)`

纯函数，不调用模型，返回提示字符串数组。界面标题为 `checksHeading`（「规则检查（不调用 AI）」），条目编辑后 300 毫秒防抖重算。没有提示时显示 `checksEmpty`。

| 工具 | 检查 | 提示文字 |
|---|---|---|
| 问卷 | 指导语不含「匿名」 | 指导语没有写明匿名 |
| 问卷 | 指导语不含「自愿」 | 指导语没有写明自愿 |
| 问卷 | 反向题数大于总题数的五分之一 | 反向题 {n} 道，超过总题数的五分之一 |
| 问卷 | 某维度题数少于 3 或多于 6 | 维度“{name}”有 {n} 道题，建议 3 至 6 道 |
| 问卷 | 有「未分维度」的题 | 有 {n} 道题没有归入维度 |
| 问卷 | 学段为小学低年级、对象为学生、量表为 4点或 5点 | 小学低年级学生不宜独立填写 4 点或 5 点量表 |
| 问卷 | 人口学项目匹配 `/姓名|学号|收入|职业|电话|手机|住址|身份证/` | 基本信息“{label}”可能识别个人或过于敏感 |
| 问卷 | 总题数超过 30 | 共 {n} 道题，填答时间可能过长 |
| 访谈 | 开场说明不含 `/录音|录像/` | 开场说明没有提到录音并征得同意 |
| 访谈 | 开场说明不含 `/匿名|保密/` | 开场说明没有提到匿名或保密 |
| 访谈 | 开场说明不含 `/停止|不回答|退出|自愿/` | 开场说明没有告诉对方可以不回答或随时停止 |
| 访谈 | 主题块数不在时长对应范围（15→2–3，30→3–4，45→4–5） | {duration} 分钟访谈有 {n} 个主题块，建议 {min} 至 {max} 个 |
| 访谈 | 主问题匹配 `/是不是|是否|有没有|会不会|对不对|能不能|好不好|喜不喜欢/`，或以「吗」「吗？」结尾且不含 `/讲讲|说说|谈谈|描述|举个例子|怎么|怎样|什么|哪些|为什么/` | {id} 主问题可能是封闭式提问 |
| 访谈 | 学段以「小学」开头、对象为学生、时长大于 20 | 小学生单次访谈建议不超过 20 分钟 |
| 访谈 | 没有暖场问题 / 没有收尾问题 | 没有暖场问题 / 没有收尾问题 |
| 观察 | 观察项匹配 `/专注|积极|认真|理解|喜欢|兴趣|主动|努力|能力|自信/` | {id} 含推断性词语“{word}”，建议改成看得见的行为 |
| 观察 | 观察项总数超过 20 | 共 {n} 个观察项，现场难以记全 |
| 观察 | 时间取样且 slots 为空 | 时间取样没有列出记录时间点 |
| 观察 | 事件取样且 rule 为空 | 事件取样没有写清一次事件的起止 |
| 观察 | 等级项含「待补充标准」或 levels 有空项 | {id} 等级标准不完整 |

提示文字写死在 `research-core.js`（属于规则输出，不进后台），测试逐条覆盖。

### 5.9 结果呈现（`ResearchMethods.instrumentHTML(inst, ctx, copy, state)`）

结果区 `<div class="rs-panel rs-instrument-response">`，头部有小头像、`instrumentResponseLabel`、预览按钮、模型标签 `#rs-instrument-model`。正文从上到下：

1. 警告条（`missingFieldsHint`）与改编说明（`adaptationLabel` + `adaptationNotice`，提醒色底块）。
2. **可编辑工具** `<div class="rs-instrument-editor">`。每个条目一行：编号徽标、`<textarea data-entry="{id}" maxlength="150" aria-label="{id}">`、该条目未处理审查数的小标记（点击跳到审查表对应行）、「删除此条」。各组末尾有「新增一条」；访谈另有「新增追问」「新增主题块」，删除主题块前 `confirm(deleteBlockConfirm)`。
   - 问卷：标题、指导语（可编辑）、选项类型与选项文字（只读）、基本信息列表（可删除）、维度列表（名称、含义、来源），然后按维度分组的题目；每题有「反向题」复选框。任一维度来源为 AI拟定时显示「把维度填回表单」（`useDimensionsAction`），点击后把「名称：含义」逐行写入表单的维度框，便于教师改后重新生成。
   - 访谈：标题、开场说明（可编辑）、需要对方同意的事项、暖场、各主题块（话题可编辑、主问题、追问）、收尾问题、结束语（可编辑）、现场提醒。
   - 观察：标题，场景、对象、观察者（只读），取样规则（可编辑）与记录时间点（一个输入框，用「、」分隔，最多 10 个），按维度分组的观察项（行为文字、记录方式下拉、等级时显示 3 个等级标准输入框），记录规则、记录一致性、伦理提醒。
   - 编辑分区的小标题（指导语、基本信息、维度、题目、开场说明、暖场问题、主题块、收尾、取样规则、观察项、记录规则、记录一致性等）写死在 `research-methods.js` 的 `LABELS` 常量中，并与 Markdown 导出、打印共用，保证三处一致（与 v1 表头写在 `research-core.js` 的做法相同）。
3. **逐条审查**（`reviewHeading`）：宽屏为表格，列为 编号、问题类型、原句、处理、建议、理由、操作；560px 及以下每行一张卡片。操作列：
   - status 为未处理、action 为改写、当前文字等于原句：「采用建议」（`adoptAction`）。
   - status 为未处理、action 为删除、当前文字等于原句：「采用：删除此条」（`adoptDeleteAction`）。
   - 当前文字已不等于原句：显示 `reviewStale`，不显示采用按钮。
   - status 为已采用：显示 `adoptedLabel`；为条目已删除：显示 `removedLabel`。
   - 每行都有「定位到该条」（`locateAction`）：滚动到条目并聚焦其输入框。
   - 来自重新审查时，表格上方显示 `reviewSummaryLabel` 与 summary；review 为空时显示 `reviewEmpty`。
4. **规则检查**（第 5.8 节）。
5. 问卷另显示「施测建议」（`administrationHeading`）和可折叠的「回收后怎样检查信度」（`reliabilityHeading` + `reliabilityGuide`，静态文字，不调用模型）。
6. 待核实事项（复用 `designPendingHeading`）。

操作条：预览、打印（`printAction`）、保存研究工具（主操作，`instrumentSaveAction`）、重新审查（`reviewAction`）、复制 Markdown、复制表格（`instrumentTsvAction`）、重试。

- 编辑通过事件委托写回内存中的 `inst`（`updateEntry` 等纯函数），设置 `dirty=true`，不整块重绘，避免输入框失焦；只有增删条目、采用建议和审查返回时重绘编辑区。
- **重新审查**：`generation.kind='review'`，进度显示 `reviewProgress`，编辑区和操作条在审查期间禁用。成功后用新审查行**替换**旧审查行；失败或格式错误时保留旧审查行，显示错误和「复制原始回复」。
- **重试（重新生成）**：`dirty` 为 true 时先 `confirm(regenerateConfirm)`。
- 生成完成或审查完成后，焦点移到对应标题，`aria-live` 报告完成。

### 5.10 打印

- `research.html` 在 `</body>` 前加 `<div id="rs-print" hidden></div>`（`body` 的直接子元素）。
- `ResearchMethods.printDocument(inst, ctx, copy)`：纯字符串函数，返回 `{html, landscape}`（观察记录表 landscape 为 true），内容全部经 `SafeRender.escape` 拼接。
- 页面函数 `printHTML(html, landscape)` 写在 `research.html` 中：写入 `#rs-print`，取消 hidden，给 `body` 加 `rs-printing`，按需插入 `<style id="rs-print-page">@page{size:A4 landscape;margin:12mm}</style>`（竖版为 `size:A4 portrait;margin:15mm`），调用 `window.print()`；`afterprint` 时清空 `#rs-print`、恢复 hidden、移除样式和类名。
- 打印 CSS 放在 `css/research-methods.css`：`@media print { body.rs-printing > :not(#rs-print) { display:none !important } #rs-print { display:block } }`，黑白可读，表格加边框，避免条目跨页断开（`break-inside:avoid`）。
- 打印前先 `compactInstrument`。打印内容：
  - **问卷（填答者版）**：标题、指导语、基本信息（每个选项前加 □）、题目表格（题号按 1、2、3 显示，不显示内部编号；每个选项一列，单元格为 □）、结尾 `printThanks`。**不出现**维度、反向题标记、审查意见和改编说明。
  - **访谈提纲（访谈者版）**：标题，表头栏 日期 / 受访者编号 / 访谈者，开场说明，同意事项清单（□），暖场、主题块（主问题、追问）、收尾，每个问题下留 3 行记录线，最后是结束语和现场提醒。
  - **观察记录表**：A4 横向。表头栏 日期 / 班级 / 观察者 / 对象编号 / 开始时间；表格列为 编号、维度、观察行为、记录方式，再加每个 slot 一列空白格（slots 为空时为 6 个空白列，列名 1 至 6）；等级项在行为下方用小字列出 3 级标准；表下印取样规则和记录规则。

### 5.11 导出

- `ResearchCore.instrumentToMarkdown(inst, ctx)`：教师版，含研究问题、子问题、对象、全部条目（问卷标注维度和反向题）、审查表（含处理状态）、规则检查结果、施测建议、改编说明和待核实事项。表格单元格中的 `|` 转义，换行压成空格。
- `ResearchCore.instrumentTsv(inst)`：第一行表头，然后每个条目一行，单元格清洗与公式注入防护同 `designPlanTsv`。
  - 问卷：题号、维度、题目、反向题（是/否）、量表。
  - 访谈：编号、类型（暖场/主问题/追问/收尾）、问题、话题。
  - 观察：编号、维度、观察行为、记录方式、等级标准（用「／」连接），再加每个 slot 一列空白。

---
## 6. 会话交接（同一标签页内跳转带数据）

### 6.1 纯函数（`research-core.js`）

```js
const HANDOFF_TTL = 30 * 60 * 1000;
writeHandoff(storage, uid, data, now = Date.now())  // 写 storage['rsHandoff:'+uid] = JSON.stringify({...data, at: now})；uid 为空或写入异常时返回 false
takeHandoff(storage, uid, to, now = Date.now())     // 读取并校验，见下
```

`takeHandoff` 规则：

1. uid 为空、键不存在、JSON 无效时返回 `null`（JSON 无效时顺便删除该键）。
2. `at` 早于 `now - HANDOFF_TTL` 时删除并返回 `null`。
3. `data.to !== to` 时**不删除**，返回 `null`（留给正确的目标视图）。
4. 匹配时删除该键（只用一次），并逐项清洗后返回：字符串按对应表单上限截断；`titles` 最多 5 个、每个 ≤60 字；`mode` 必须在 `INSTRUMENT_KINDS` 中；`respondent` 必须是学生、教师、家长、其他之一；`stage` 必须是 5 个学段之一。不合规的字段直接丢掉。

页面一律传 `sessionStorage`；测试传一个内存替身。`syncAuth` 在 uid 变化时删除 sessionStorage 中所有以 `rsHandoff:` 开头的键。未登录时不写交接，只跳转。

### 6.2 教练 → 设计顾问

- `updatePhase()` 在 `phase` 为 `focused` 和 `titles` 时，在已有按钮之后加 `btn('coachHandoffAction','toDesign')`。
- `$('rs-funnel-actions')` 的点击处理中，**在**最后的 `else void send(funnel.commands[action])` **之前**加 `else if (action==='toDesign') handoffToDesign();`，否则会把 `undefined` 发给模型。
- `handoffToDesign()`：`const r = C.extractFunnelResult(history)`，写交接 `{to:'design', question:r.question, titles:C.extractTitles(r.titles)||[]}`；`r.question` 为空时 `showToast(t('coachHandoffMissing'))`；然后 `location.hash = 'design'`。
- 进入设计视图时调用 `applyDesignHandoff()`：`takeHandoff(sessionStorage, uid, 'design')`。有数据时，如果研究问题或拟定题目框非空，先 `confirm(t('handoffConfirm'))`，取消则不填；确认或表单为空时填入研究问题，并用 titles 生成题目下拉。条件单选不预填。

### 6.3 设计顾问 → 工坊

- 「需要准备的工具」每行的按钮（`data-design-row`）写交接：

```js
{to:'instrument',
 question: design.scope.status==='需收窄' && design.scope.narrowed ? design.scope.narrowed : ctx.question,
 subQuestion: row.subQuestion,
 mode: {'问卷':'questionnaire','访谈提纲':'interview','观察记录表':'observation'}[row.toolType],
 respondent: row.respondent,   // 不合规时由 takeHandoff 丢弃
 stage: ctx.conditions.stage}
```

- 然后 `location.hash='instrument'`。进入工坊视图时 `applyInstrumentHandoff()`：表单非空（研究问题、子问题或草稿任一非空）时先 `confirm(handoffConfirm)`；填入后切到对应工具类型标签，起点设为从零起草。观察表的观察对象不预填，让教师自己写。
- 只读的已保存设计也能用这些按钮。

### 6.4 设计顾问 → 教练（范围为「需回到教练」时）

- 按钮 `designToCoachAction`。教练对话历史为空且输入框为空时，把输入框预填为 `design.coachPrefill(question, reason)` 的结果，**不自动发送**：

```js
coachPrefill: (question, reason) => `我现在的研究问题是：${question}。研究设计顾问认为它还需要聚焦：${reason}`
```

  这句会作为用户消息发给模型，所以写死在 `research-data.js`（D4），不进后台。
- 教练已有对话或输入框非空时，不改输入框，显示 `coachBusyHint`。两种情况都跳到 `#funnel` 并聚焦输入框。

---

## 7. 保存、载入与备课本

### 7.1 保存（沿用 `prepareSave` → 确认标题对话框 → `savePending`）

`prepareSave(kind)` 增加两个分支。两者都要求已登录、没有进行中的生成。

```js
// kind === 'design'：要求 designResult 存在且 designReadOnly 为 false
pendingWork = {uid, agentId:design.id, agentName:design.name, agentType:'form', workType:'draft',
  title:(designCtx.title || designCtx.question).slice(0,160),
  content:C.designToMarkdown(designResult, designCtx),
  inputs:{_module:'research', _design:clone(designResult), _researchQuestion:designCtx.question,
          _title:designCtx.title, _titles:designCtx.titles, _conditions:clone(designCtx.conditions)}};

// kind === 'instrument'：要求 inst 存在；先 compactInstrument
pendingWork = {uid, agentId:instrument.id, agentName:instrument.name, agentType:'form', workType:'draft',
  title:(inst.title || `${KIND_NAMES[kind]}：${ctx.subQuestion}`).slice(0,160),
  content:C.instrumentToMarkdown(inst, ctx),
  inputs:{_module:'research', _instrument:clone(inst), _instrumentKind:kind, _researchQuestion:ctx.question,
          _subQuestion:ctx.subQuestion, _respondent:ctx.respondent, _target:ctx.target, _stage:ctx.stage,
          _scaleName:ctx.scaleName, _source:ctx.source}};
```

- `savePending` 的成功提示改为按 agentId 查表：`{[reading.id]:'cardSavedHint',[funnel.id]:'coachSavedHint',[design.id]:'designSavedHint',[instrument.id]:'instrumentSavedHint'}`。研究工具保存成功后 `dirty=false`。
- 继续使用现有 285,000 字节检查和 `saveLengthError`。
- 每次保存都是 `DB.saveWork` 新建（D6），不调用改名或删除接口。

### 7.2 备课本数据加载

- `loadLibrary` 保持 `works` 只含精读卡（卡片夹、首页「（N 张）」计数和 CSV 导出不变），另存 `allResearchWorks = all.filter(w => /^research-/.test(w.agentId))`，加载完成后调用 `renderMethodImports()` 刷新两个导入下拉。
- 设计顾问导入：取 `agentId===funnel.id` 且 `inputs._researchQuestion` 非空的条目，按问题文字去重（保留最新），最多 20 条；选项文字为问题本身（超过 40 字截断加「…」）。
- 工坊导入：取 `agentId===design.id` 的条目，用 `parseDesign(JSON.stringify(w.inputs._design))` 重新规范化，只列 plan 中有问卷、访谈提纲、观察记录表的设计；选项文字为保存标题。
- `syncAuth` 换号时清空 `allResearchWorks` 并重置两个下拉。

### 7.3 从备课本打开（`/research?work=<id>#<agentId>`）

`workspace.html` 已为所有 `research-` 条目生成这种链接，**不用改**。`loadSavedWork` 改为显式分支：

| agentId | 处理 |
|---|---|
| `research-funnel` | 现有逻辑不变 |
| `research-reading-card` | 现有逻辑不变（原来的 else 分支改为显式判断） |
| `research-design` | `showView('design')`；用 inputs 恢复表单并禁用；`parseDesign(JSON.stringify(_design))` 成功则渲染，失败则用 `SafeRender.markdown(w.content)` 显示；`designReadOnly=true`，显示 `designReadOnlyHint` 和「基于此设计新建」 |
| `research-instrument` | `showView('instrument')`；用 inputs 恢复表单（类型、问题、子问题、对象、学段、成熟量表名称）；`parseInstrument(JSON.stringify(_instrument), _instrumentKind, ctx, {keepStatus:true})` 成功则进入可编辑状态（`dirty=false`），失败则只读显示 Markdown |
| 其他 `research-` 开头 | 抛出 `new Error('暂不支持打开这类科研条目')`，由现有 catch 显示提示 |

「基于此设计新建」：`clearWorkQuery()`，`designReadOnly=false`，解除表单禁用并保留其中内容，结果区回到空状态，焦点移到生成按钮。

### 7.4 视图与状态

- `const [funnel, reading, design, instrument] = RESEARCH_AGENTS;`
- `showView` 白名单加 `'design'`、`'instrument'`；`normalizedView` 映射加两项（第 4.1、5.1 节）。
- 新状态变量：`designResult`、`designCtx`、`designRaw`、`designReadOnly`、`inst`、`instCtx`、`instRaw`、`dirty`、`allResearchWorks`。
- `generation.kind` 新增 `'design'`、`'instrument'`、`'review'`，仍是全页唯一的 `generation`；现有 `route()` 的离开确认和 `stopGeneration()` 自动覆盖新视图。
- 切换视图只隐藏，不清空内存状态，所以在工坊编辑一半去看设计再回来，修改还在。刷新页面会丢失未保存的修改，这与 v1 精读卡一致。
- `syncAuth` 在 uid 变化时调用新增的 `resetDesign()`、`resetInstrument()`（停止生成、清空结果和表单、关闭对话框、`dirty=false`），并按新 uid 恢复两个本地草稿（第 4.2、5.2 节）。
- 所有新的异步回调都用现有 `same(userId, version)` 和 `generation===run` 守卫，防止换号后旧响应写进新账号的页面。

---
## 8. 后台文案（SiteCopy）

### 8.1 规则

- 在 `js/site-copy.js` 的 research 定义中追加下表 **135** 项，研究页总数 **153 + 135 = 288** 项。字段对象格式与现有字段相同：`{"key","label","maxLength","defaultValue","rows"?,"group"}`；上限栏 ≥200 的字段加 `"rows": 3`，标注「4 行」的加 `"rows": 4`。
- 页面中每个字段都用 `data-site-copy` / `data-site-copy-placeholder` 绑定，或在 `research-methods.js` 中通过 `copy.key` 读取。**键名一律字面写出**，不要用模板字符串拼键名，这样 `test-functions.mjs` 的键名存在性检查不需要新增例外。
- 不进后台、写死在代码中的文字（理由：与数据结构或导出绑定，管理员改动会造成页面、导出和打印不一致，或会发给模型）：
  - 所有发给模型或被解析的选项值（学段、条件、方法名、工具类型、量表类型等，D4）；
  - 一页纸设计表、审查表的列名，以及 TSV、Markdown、打印的表头（`research-core.js` 常量）；
  - 设计结果中的小标签（研究对象、关键变量或现象、研究情境、问题类型、判断依据、收窄后的研究问题、题目承诺的证据、与条件的冲突、修改建议、为什么适合、本案局限、会产生的数据）和工坊编辑分区小标题（`research-methods.js` 的 `LABELS` 常量）；
  - 规则检查提示（第 5.8 节）和 `coachPrefill`。
- 第 4.2、5.2 节表单里每个字段的可见标签与占位文字，就是 8.3、8.4 表中默认值相同的那个键（例如「研究对象」对应 `designClassesLabel`）；单选、多选的选项文字不是文案键，写死在 `design.options`、`instrument.options` 中。
- 改 `server/local-content.mjs` 第 85 行：`pageId === 'research' ? 160 : 40` 改为 `300`。
- 改 `firestore.rules` 的 `validResearchCopy()`：hasAll 与 hasOnly 键名列表加入 135 个新键，并为每个键加一行 `validText`，上限与下表一致。
- 两处现有默认值随本批更新，并在 `normalize` 中加与第 415–417 行同样写法的旧默认值迁移（只替换管理员没改过的旧默认值）：

| 键 | 旧默认值 | 新默认值 |
|---|---|---|
| `moreTools` | 更多工具陆续推出：主题综合、评审专家、技术路线图。 | 更多工具陆续推出：访谈编码助手、主题综合、评审专家、技术路线图。 |
| `heroIntro` | 面向中小学教师的论文与课题写作支持。AI 负责追问、填卡、整理；选题、判断和结论由你来做。 | 面向中小学教师的论文与课题写作支持。AI 负责追问、填卡、给设计建议和审查工具；选题、方法、判断和结论由你来做。 |

### 8.2 分组「科研首页」（新增 8 项，插在 `readingAction` 之后）

| 键 | 后台标签 | 默认值 | 上限 |
|---|---|---|---|
| designEyebrow | 设计顾问角标 | AI 科研伙伴 · 研究设计 | 40 |
| designRole | 设计顾问称呼 | 研究设计顾问 | 40 |
| designIntro | 设计顾问介绍 | 我会根据你的研究问题和真实条件，挑一到两种做得成的方法，排出一页纸研究设计。 | 200 |
| designAction | 设计顾问入口提示 | 方法选择 + 一页纸研究设计 → | 40 |
| instrumentEyebrow | 工坊角标 | AI 科研伙伴 · 研究工具 | 40 |
| instrumentRole | 工坊称呼 | 研究工具工坊 | 40 |
| instrumentIntro | 工坊介绍 | 告诉我工具要回答哪个子问题，我陪你起草或审查问卷、访谈提纲和观察记录表，逐条指出该改在哪里。 | 200 |
| instrumentAction | 工坊入口提示 | 问卷 · 访谈提纲 · 观察记录表 → | 40 |

### 8.3 分组「研究设计顾问」（新增 51 项）

| 键 | 后台标签 | 默认值 | 上限 |
|---|---|---|---|
| designGuide | 设计顾问使用说明 | 先写研究问题，再如实选择你的条件。我会先判断问题能不能做、题目承诺了什么，再推荐一到两种方法，说明哪些方法不适合你，最后排出一页纸研究设计。方法由你决定，正式立项前建议请教研员或指导老师把关。 | 400（4 行） |
| designPrivacy | 设计顾问隐私提醒 | 只会发送你在表单里填写的文字。请不要填写学生姓名、学校名称等可识别信息。 | 200 |
| designImportLabel | 导入研究问题标签 | 从备课本导入研究问题 | 40 |
| designImportPrompt | 导入下拉首项 | 选择一个已保存的研究问题 | 40 |
| designImportEmpty | 无可导入提示 | 备课本里还没有研究问题教练的结果。可以先去教练那里聚焦，也可以直接填写。 | 200 |
| designQuestionLabel | 研究问题标签 | 研究问题 | 40 |
| designQuestionPlaceholder | 研究问题占位 | 如：分层作业如何影响小学五年级数学学困生的作业完成质量？ | 200 |
| designTitleLabel | 拟定题目标签 | 拟定题目（可选） | 40 |
| designTitlePlaceholder | 拟定题目占位 | 如：小学五年级数学分层作业设计的行动研究 | 200 |
| designTitlePick | 选择教练题目标签 | 从教练给出的题目中选择 | 40 |
| designConditionsLegend | 条件分组标题 | 我的研究条件 | 40 |
| designConditionsHint | 条件说明 | 条件越真实，建议越可用。没有选择的条件，我会当作暂时不具备。 | 200 |
| stageLabel | 学段标签（设计与工坊共用） | 学段 | 40 |
| designClassesLabel | 研究对象标签 | 研究对象 | 40 |
| designParallelLabel | 平行班标签 | 可比较的平行班 | 40 |
| designPeriodLabel | 研究周期标签 | 研究周期 | 40 |
| designDataLabel | 可收集数据标签 | 可以收集的数据（可多选） | 40 |
| designAbilityLabel | 分析能力标签 | 数据分析能力 | 40 |
| designSupportLabel | 可求助的人标签 | 可求助的人 | 40 |
| designPurposeLabel | 研究用途标签 | 研究用途 | 40 |
| designPreferenceLabel | 方法偏好标签 | 方法偏好 | 40 |
| designNotesLabel | 其他说明标签 | 其他说明（可选） | 40 |
| designNotesPlaceholder | 其他说明占位 | 如：学校每月有一次教研活动，可以请同事来听课 | 200 |
| designGenerateAction | 生成按钮 | 生成研究设计 | 40 |
| designProgress | 生成进度模板 | 正在生成研究设计，已接收 {count} 字… | 100 |
| designEmpty | 结果区空状态 | 填写研究问题和条件后，这里会出现一页纸研究设计。 | 200 |
| designRequiredError | 必填提示 | 请填写研究问题，并完成学段、研究对象、平行班、研究周期、分析能力、可求助的人和研究用途的选择。 | 200 |
| designFormatError | 格式错误提示 | 研究设计格式不完整。可以重试，或复制原始回复自行整理。 | 200 |
| designResponseLabel | 结果区标题 | 研究设计 | 40 |
| designAnalysisHeading | 问题解析标题 | 问题解析 | 40 |
| designScopeHeading | 范围检查标题 | 范围检查 | 40 |
| designTitleHeading | 题目承诺检查标题 | 题目承诺检查 | 40 |
| designRecommendedHeading | 推荐方法标题 | 推荐方法 | 40 |
| designMinimalLabel | 最小可行版本标签 | 最小可行版本 | 40 |
| designExcludedHeading | 不推荐方法标题 | 不推荐的方法 | 40 |
| designPlanHeading | 一页纸设计标题 | 一页纸研究设计 | 40 |
| designToolsHeading | 所需工具标题 | 需要准备的工具 | 40 |
| designEthicsHeading | 伦理提醒标题（设计与工坊共用） | 伦理与实施提醒 | 40 |
| designPendingHeading | 待核实标题（设计与工坊共用） | 需要你补充或核实 | 40 |
| designExistingMaterial | 已有材料模板 | 使用已有材料：{source} | 100 |
| designToCoachAction | 回教练按钮 | 回研究问题教练聚焦 | 40 |
| designToWorkshopAction | 去工坊按钮 | 去研究工具工坊设计 | 40 |
| designTsvAction | 复制设计表按钮 | 复制设计表 | 40 |
| designSaveAction | 保存按钮 | 保存研究设计 | 40 |
| designSavedHint | 保存成功提示 | 研究设计已保存到我的备课本 | 100 |
| designNewAction | 基于此设计新建按钮 | 基于此设计新建 | 40 |
| designReadOnlyHint | 只读提示 | 这是已保存的研究设计，只能查看。要调整，请点“基于此设计新建”。 | 200 |
| coachHandoffAction | 教练交接按钮 | 交给研究设计顾问 | 40 |
| coachHandoffMissing | 未识别研究问题提示 | 没有识别到研究问题，请在研究设计顾问中手动填写。 | 200 |
| coachBusyHint | 教练已有对话提示 | 教练里已有对话。请先保存或清空，再回去聚焦。 | 200 |
| handoffConfirm | 交接替换确认（共用） | 表单里已有内容，要用带过来的内容替换吗？ | 200 |

### 8.4 分组「研究工具工坊」（新增 45 项）

| 键 | 后台标签 | 默认值 | 上限 |
|---|---|---|---|
| instrumentGuide | 工坊使用说明 | 先选工具类型，写清它要回答哪个子问题。可以让我从零起草，也可以贴上你的草稿让我逐条审查。改完后可以请我再审查一次。工具由你最终决定，正式使用前请先找几位同类对象试用。 | 400（4 行） |
| instrumentPrivacy | 工坊隐私提醒 | 只会发送你填写的文字和草稿。草稿里请不要出现学生姓名、学校名称等可识别信息。 | 200 |
| modeTabLabel | 工具类型标签 | 工具类型 | 40 |
| modeQuestionnaire | 问卷标签 | 问卷 | 40 |
| modeInterview | 访谈提纲标签 | 访谈提纲 | 40 |
| modeObservation | 观察记录表标签 | 观察记录表 | 40 |
| instrumentSourceLabel | 起点标签 | 起点 | 40 |
| sourceNewLabel | 从零起草选项 | 从零起草 | 40 |
| sourceDraftLabel | 审查草稿选项 | 审查我的草稿 | 40 |
| instrumentImportLabel | 导入设计标签 | 从备课本中的研究设计导入 | 40 |
| instrumentImportPrompt | 导入设计首项 | 选择一份已保存的研究设计 | 40 |
| instrumentImportRow | 子问题下拉首项 | 选择要设计工具的子问题 | 40 |
| instrumentImportEmpty | 无可导入设计提示 | 备课本里还没有需要问卷、访谈或观察工具的研究设计，可以直接填写。 | 200 |
| instrumentQuestionLabel | 研究问题标签 | 研究问题 | 40 |
| subQuestionLabel | 子问题标签 | 这份工具要回答的子问题 | 40 |
| subQuestionPlaceholder | 子问题占位 | 如：学困生完成分层作业时遇到哪些困难？ | 200 |
| respondentLabel | 对象标签 | 填答或受访对象 | 40 |
| targetLabel | 观察对象标签 | 观察对象 | 40 |
| targetPlaceholder | 观察对象占位 | 如：班上 6 名作业困难学生（用编号代替姓名） | 200 |
| dimensionsLabel | 问卷维度标签 | 维度（可选，每行一个） | 40 |
| dimensionsPlaceholder | 问卷维度占位 | 如：作业兴趣：愿不愿意做作业（换行）完成困难：做作业时卡在哪里。不填则由 AI 拟定，你再确认。 | 200 |
| observationDimensionsLabel | 观察维度标签 | 想观察的维度或行为（可选） | 40 |
| itemsPerDimensionLabel | 每维题数标签 | 每个维度题数 | 40 |
| scaleLabel | 选项类型标签 | 选项类型 | 40 |
| demographicsLabel | 基本信息复选框 | 需要基本信息（如性别、年级） | 40 |
| scaleNameLabel | 成熟量表标签 | 参考的成熟量表（可选） | 40 |
| scaleNamePlaceholder | 成熟量表占位 | 只写名称即可。我不会冒充原量表原文。 | 200 |
| formatLabel | 访谈形式标签 | 访谈形式 | 40 |
| durationLabel | 访谈时长标签 | 访谈时长 | 40 |
| topicsLabel | 话题标签 | 想了解的话题（可选） | 40 |
| topicsPlaceholder | 话题占位 | 如：做分层作业时的感受、遇到困难时找谁帮忙 | 200 |
| sceneLabel | 观察场景标签 | 观察场景 | 40 |
| samplingLabel | 取样方式标签 | 取样方式 | 40 |
| samplingHint | 取样方式说明 | 时间取样：每隔固定时间记录一次。事件取样：目标行为每发生一次就记录一次。 | 200 |
| observerLabel | 观察者标签 | 观察者 | 40 |
| draftLabel | 草稿标签 | 我的草稿 | 40 |
| draftPlaceholder | 草稿占位 | 把问卷题目、访谈问题或观察项粘贴到这里，一行一条。 | 200 |
| instrumentGenerateAction | 起草按钮 | 生成研究工具 | 40 |
| instrumentReviewDraftAction | 审查草稿按钮 | 开始审查草稿 | 40 |
| instrumentProgress | 生成进度模板 | 正在设计研究工具，已接收 {count} 字… | 100 |
| instrumentEmpty | 结果区空状态 | 选好工具类型并写清子问题后，这里会出现可以编辑的研究工具。 | 200 |
| instrumentRequiredError | 必填提示 | 请填写研究问题、子问题、对象和学段；审查草稿时还需要粘贴草稿。 | 200 |
| instrumentFormatError | 格式错误提示 | 研究工具格式不完整。可以重试；草稿较长时，可以分成两次审查。 | 200 |
| lowGradeHint | 低年级量表提示 | 小学低年级学生不宜独立填写 4 点或 5 点量表，已改为 3 点。正式施测时建议由你逐题读题。 | 200 |
| dimensionsLimitError | 维度过多提示 | 维度最多 6 个，请合并后再生成。 | 100 |

### 8.5 分组「工具结果与审查」（新增 31 项）

| 键 | 后台标签 | 默认值 | 上限 |
|---|---|---|---|
| instrumentResponseLabel | 结果区标题 | 研究工具 | 40 |
| checksHeading | 规则检查标题 | 规则检查（不调用 AI） | 40 |
| checksEmpty | 规则检查无提示 | 规则检查没有发现问题。 | 100 |
| reviewHeading | 审查表标题 | 逐条审查 | 40 |
| reviewAction | 重新审查按钮 | 重新审查 | 40 |
| reviewProgress | 审查进度模板 | 正在重新审查，已接收 {count} 字… | 100 |
| reviewSummaryLabel | 总体评价标签 | 总体评价 | 40 |
| reviewEmpty | 无审查意见提示 | 这一轮审查没有指出需要修改的条目。 | 100 |
| reviewStale | 原句已改标签 | 原句已修改 | 40 |
| adoptAction | 采用建议按钮 | 采用建议 | 40 |
| adoptDeleteAction | 采用删除按钮 | 采用：删除此条 | 40 |
| adoptedLabel | 已采用标签 | 已采用 | 40 |
| removedLabel | 条目已删除标签 | 条目已删除 | 40 |
| locateAction | 定位按钮 | 定位到该条 | 40 |
| deleteItemAction | 删除条目按钮 | 删除此条 | 40 |
| addItemAction | 新增条目按钮 | 新增一条 | 40 |
| addProbeAction | 新增追问按钮 | 新增追问 | 40 |
| addBlockAction | 新增主题块按钮 | 新增主题块 | 40 |
| deleteBlockConfirm | 删除主题块确认 | 删除这个主题块和它的追问吗？ | 100 |
| limitReachedHint | 条目上限提示 | 这一组已达到条目上限。 | 100 |
| useDimensionsAction | 维度填回按钮 | 把维度填回表单 | 40 |
| adaptationLabel | 改编说明标签 | 改编说明 | 40 |
| administrationHeading | 施测建议标题 | 施测建议 | 40 |
| reliabilityHeading | 信度说明标题 | 回收后怎样检查信度 | 40 |
| reliabilityGuide | 信度说明 | 回收问卷后，可以在 SPSS 中用“分析 → 刻度（标度）→ 可靠性分析”计算每个维度的克隆巴赫 α 系数（看同一维度的题目是不是在测同一件事）。先把反向题反向计分。α 达到 0.7 一般可以接受；少于 3 题的维度不宜计算。只有一个班的数据时，结果只能作初步参考。 | 400（4 行） |
| printAction | 打印按钮 | 打印 | 40 |
| instrumentTsvAction | 复制表格按钮 | 复制表格 | 40 |
| instrumentSaveAction | 保存按钮 | 保存研究工具 | 40 |
| instrumentSavedHint | 保存成功提示 | 研究工具已另存到我的备课本，原来的版本不会被覆盖。 | 100 |
| regenerateConfirm | 重新生成确认 | 重新生成会丢掉你在当前工具上的修改，确定吗？ | 100 |
| printThanks | 问卷打印结束语 | 感谢你的填写！ | 40 |

`dimensionsPlaceholder` 的默认值在代码中把「（换行）」写成真正的换行符 `\n`，表中为便于阅读写成文字。

复用的现有字段（不新增）：`previewAction`、`previewTitle`、`saveAction`、`cancelAction`、`saveHeading`、`saveTitleLabel`、`stopAction`、`retryAction`、`markdownAction`、`copyRawAction`、`closeAction`、`rawOutputLabel`、`loginHint`、`incompleteHint`、`missingFieldsHint`、`leaveConfirm`、`saveLengthError`、`saveFailure`、`copySuccess`、`copyFailure`、`countTemplate`、`backResearch`、`workspaceAction`、`noteLabel`。

---
## 9. 人物形象

做法与 `reports/2026-10-07-research-partners.md` 相同：内置 imagegen，以 `assets/agent-portraits/lesson-design.jpg` 为**画风参考**，生成两位虚构人物；不用真实照片，不虚构学历、院校、头衔。选定后用 sips 缩放、JPEG 压缩为 900×900，体积约 130–140 KB：

- `assets/agent-portraits/research-design.jpg`
- `assets/agent-portraits/research-instrument.jpg`

与 v1 相同，`research.html` 的入口卡、工作台小头像和结果区头部直接写这两个图片路径（`width="900" height="900"`，入口卡 `loading="lazy"`），不在 `RESEARCH_AGENTS` 中加图片字段。原始 PNG 留在工具生成目录，不进仓库。

研究设计顾问提示词：

```text
Use case: illustration-story. Asset: portrait for the research-design advisor on a Chinese teacher AI website. The attached image is a STYLE REFERENCE only: match its refined realistic painterly digital illustration, soft cool-gray background, restrained thin broken circular line motifs, natural skin texture, eye-level standing half-body portrait and editorial palette. Create a different fictional East Asian woman about 50 with short neat dark hair lightly streaked with gray, composed and steady face, slight reassuring smile, like an experienced school teaching-research colleague. Deep desaturated ink-blue blazer over a soft gray knit top; holding a clipboard with a simple ruled grid sheet naturally at waist level, no readable writing. Centered single person, head fully visible with generous breathing room, face in upper third; chest and hands visible; square composition suitable for both entry card and small avatar cropping. Soft even light. Distinct from reference identity, no text, letters, logos, credentials, university badges, watermark, robot elements or neon. The character feels calm, practical and good at turning real conditions into a workable plan.
```

研究工具工坊提示词：

```text
Use case: illustration-story. Asset: portrait for the research-instrument workshop partner on a Chinese teacher AI website. The attached image is a STYLE REFERENCE only: match its refined realistic painterly digital illustration, soft cool-gray background, restrained thin broken circular line motifs, natural skin texture, eye-level standing half-body portrait and editorial palette. Create a different fictional East Asian man about 32 with short tidy dark hair, focused friendly face, slight smile, sleeves of a pale shirt neatly rolled up, wearing a muted khaki canvas work apron. Holding a pencil, a short ruler and a blank printed form sheet naturally at waist level, no readable writing. Centered single person, head fully visible with generous breathing room, face in upper third; chest and hands visible; square composition suitable for both entry card and small avatar cropping. Soft even light. Distinct from reference identity, no text, letters, logos, credentials, university badges, watermark, robot elements or neon. The character feels careful, hands-on and ready to check every item with you.
```

验收：与现有两位科研伙伴、教学团队并排时画风一致，两人年龄、性别、服装颜色彼此可区分；56×64 与 44×52 小头像裁切后脸部完整。两段最终提示词写进本批验收报告。

---
## 10. 逐文件改动清单

| 文件 | 改动 |
|---|---|
| `js/research-data.js` | `RESEARCH_AGENTS` 追加 `design`、`instrument` 两个对象，字段见第 4.1、5.1 节，另加 `design.coachPrefill`（第 6.4 节）和 `instrument.buildReviewMessage`（第 5.3 节）；`JSON_SUFFIX` 常量；系统提示逐字取自本文档锚点标题下的代码块 |
| `js/research-core.js` | 新增第 4.6、4.8、5.6–5.8、5.11、6.1 节的常量与纯函数，并全部加入 `root.ResearchCore` 导出；现有函数不改 |
| `js/research-methods.js`（新建） | 全局 `ResearchMethods = {designHTML, instrumentHTML, printDocument, LABELS}`；只拼 HTML 字符串，不操作 DOM（`printHTML` 写在 `research.html`），所有动态文字先 `SafeRender.escape`；需要 Markdown 的地方只用 `SafeRender.markdown` |
| `css/research-methods.css`（新建） | 两个工作台、一页纸设计表、工具编辑区、审查表、560px 以下卡片化、`@media print`；沿用 `research-reading.css` 的变量与间距，不改全局 `style.css` |
| `research.html` | 首页四张卡（2×2）；`#design`、`#instrument` 两个视图；`#rs-print` 容器；新状态、事件委托、交接、导入、保存、载入、`syncAuth` 重置（第 4–7 节）；引入新 JS、CSS；`toDesign` 按钮加进教练动作条 |
| `js/site-copy.js` | 135 项新文案；`moreTools`、`heroIntro` 新默认值与旧默认值迁移（第 8 节） |
| `server/local-content.mjs` | 第 85 行研究页上限 160 → 300 |
| `firestore.rules` | `validResearchCopy()` 加 135 个键与逐项长度校验 |
| `functions/api/agent.js` | `DEFAULT_ZHIPU_AGENT_IDS` 追加 `'research-design'`、`'research-instrument'`；其他不改 |
| `sw.js` | `VERSION` 改为 `'20261012-v41'`；`CORE_ASSETS` 追加 `'/js/research-methods.js'`、`'/css/research-methods.css'`；肖像不预缓存（与 v1 相同） |
| `js/pwa.js` | 第 267 行「选题与文献工具」改为「选题、文献与方法工具」 |
| `js/assistant.js` | 第 367 行附近的科研场景：关键词追加「研究方法」「研究设计」「问卷」「访谈提纲」「观察记录」；正文改为「用「研究问题教练」把教学困扰聚焦成能研究的问题，用「文献研读伙伴」整理你提供的论文，再请「研究设计顾问」选方法、「研究工具工坊」做问卷、访谈提纲和观察记录表。AI 追问与整理，选题、方法和判断由你来做。」四个名称分别链接 `/research#funnel`、`#reading-card`、`#design`、`#instrument` |
| `index.html` | 第 416 行横幅副文案改为「把教学困扰聚焦成研究问题，读文献、定方法、做工具。AI 追问与整理，判断由你来做。」 |
| `assets/agent-portraits/` | 新增两张 JPG（第 9 节） |
| `workspace.html` | **不改**。备课本已按 `/^research-/` 识别科研条目并生成 `/research?work=…#agentId` 链接，新 id 自动生效 |
| `agents.html`、`admin.html`、认证、邮箱、隐私、统计相关文件 | **不改**（后台按 `group` 自动出现三个新分组） |

缓存版本统一改为 `20261012-methods`：

- `research.html` 中的 `research-core.js`、`research-data.js`、`research-methods.js`、`research-methods.css`；`research-presentation.js` 和 `research-reading.css` 只有改动时才升版本。
- 所有加载 `site-copy.js` 的页面（`dataPages` 与 `admin.html`）。
- 所有加载 `assistant.js`、`pwa.js` 的页面（包括 `offline.html`）。
- `scripts/check-site.mjs`、`scripts/check-production.mjs` 中对应的版本断言同步改。注意现有正则 `/js\/pwa\.js\?v=20261006-research/` 也会匹配 `-research-nav`，改版本时写完整版本号。

---
## 11. 自动测试（只用合成数据，不调用付费模型）

### 11.1 `scripts/test-research.mjs`

在现有断言之后追加，现有断言只改第 15–17 行：

- `const [f,r,d,w] = RESEARCH_AGENTS`；长度为 4；id 依次为 `research-funnel`、`research-reading-card`、`research-design`、`research-instrument`；名称为研究问题教练、文献研读伙伴、研究设计顾问、研究工具工坊。
- 循环断言改为 `a.name && (a.system || a.systems)`。
- **提示词逐字一致**：读取本文档，用与 v1 相同的写法（按锚点标题切开，取其后第一个代码块并 trim）取出第 4.4 节设计顾问锚点下的提示词，等于 `d.system`；四个工坊锚点（问卷、访谈提纲、观察记录表、重新审查）分别等于 `w.systems.questionnaire`、`interview`、`observation`、`review`。
- `d.requestSystem.startsWith(d.system)`；四个 `w.requestSystems[k].startsWith(w.systems[k])`；五个请求提示都包含 `【请求补充约束】`。
- `w.systems.questionnaire` 包含 `ResearchCore.ADAPTATION_NOTICE`。
- `buildUserMessage`、`buildReviewMessage`：逐行与第 4.3、5.3 节模板一致；空题目写「未提供」、空数据数组写「未选择」、空说明写「无」；多选用「、」连接；审查草稿时【草稿】之后保留原文换行；仅从零起草时出现【每个维度题数】；`buildReviewMessage` 不发送空文字条目，条目行格式与第 5.3 节表格一致。
- **parseDesign**：
  - 标准夹具（小学五年级数学、只有 1 个班、没有平行班、一学期）：主方法为行动研究，准实验在不推荐中，plan 2–4 行。
  - 杂乱夹具：「混合方法」被丢弃、「行动研究法」规范为「行动研究」、5 个推荐只留 2 个、两个都标主方法时只保留第一个、范围为「需回到教练」时 plan 为空、未知键丢弃、枚举值规范化、JSON 围栏和前后解释文字可解析、非 JSON 返回 null。
- **parseInstrument**：三种类型各一套夹具；ID 重复或缺失时全部重编号且审查行清空；未知量表类型回退到 5点及其标签；问卷参考成熟量表时 `adaptationNotice` 被补齐；观察「等级」项不足 3 级时补「待补充标准」；访谈缺收尾时为 null；各项上限（`LIMITS`）截断。
- **parseReview**：引用不存在 ID 的行被丢弃；原句与当前条目不一致时改为当前条目文字。
- **编辑纯函数**：`applySuggestion` 只在当前文字等于原句时生效，改写与删除各一例，原对象不被修改；`removeEntry` 不重编号，相关审查行变为条目已删除；`addEntry` 达上限时返回原对象（同一引用），访谈收尾已有时不新增。
- **instrumentChecks**：第 5.8 节每条规则至少一个命中样例和一个不命中样例；「能讲讲最近一次……吗？」不得被判为封闭式问题。
- **交接**：用内存版 storage 替身测试 30 分钟过期、uid 不同返回 null、`to` 不匹配时保留条目、匹配后只能取一次、字段截断与类型清洗。
- **导出**：TSV 列数与表头一致、以 `= + - @` 开头的单元格加单引号、制表符和换行被替换；Markdown 中的 `|` 被转义。
- **XSS**：设计和工具里放 `<img src=x onerror=alert(1)>` 与 `<script>`，`designHTML`、`instrumentHTML`、`printDocument` 输出中不得出现原样标签。
- **GLM 优先**：现有第 96 行循环改为四个 id，每个都只请求一次供应商且模型为 `glm-5.2`。

完成后把新的断言总数写进验收报告和 AGENTS.md。

### 11.2 其他测试

- `scripts/test-functions.mjs`：第 44 行上限断言改为 ≤300；第 47 行改为 `=== 288`；键名存在性检查的来源文件加入 `js/research-methods.js`。
- `scripts/test-tencent-admin.mjs`：第 34 行改为 288 项可保存；第 37 行改为 301 项被拒绝。
- `scripts/check-site.mjs`：新版本号；`sw.js` 含两个新资源；`research.html` 含 `id="rs-design"`、`id="rs-instrument"`、`id="rs-print"`、`research-methods.js` 与 `research-methods.css`；`research-data.js` 含五个锚点标题对应的特征句；`agent.js` 名单含两个新 id。
- `scripts/check-production.mjs`：新版本号；四张肖像（状态 200、`image/jpeg`、体积 <200 KB、30 天缓存）；`research-methods.js`、`research-methods.css` 状态与缓存；首页横幅新文字。
- 最后运行完整 `npm run check`，必须全绿。

---
## 12. 浏览器验收

用隔离的无头 Chrome 和临时 Playwright，不碰个人浏览器资料；认证与模型都用合成替身，`/api/agent` 返回合成的 NDJSON events-v1 流（做法同 v1）。视口：1440、1081、900、768、561、390、320px，每个视口都检查无横向溢出。

必测项：

1. 首页四张卡 2×2（900px 以下单列），四张肖像加载完整，键盘 Enter 可进入。
2. 设计顾问：填表 → 缺项提示并聚焦 → 生成 → 八个部分齐全 → 复制设计表 → 保存 → 刷新后从备课本打开为只读 → 「基于此设计新建」回到可编辑表单。
3. 工坊三种类型各走一遍从零起草；问卷再走一遍审查草稿。
4. 编辑：改字、采用改写建议、采用删除建议、手动改原句后出现「原句已修改」、删除条目后审查行变为「条目已删除」、新增条目到上限。
5. 重新审查：审查期间编辑区禁用；成功后审查行被替换；合成一次格式错误，旧审查行保留。
6. 三种交接：教练 → 设计顾问（含表单已有内容时的替换确认）；设计 → 工坊；设计 →「回研究问题教练聚焦」（教练空闲时预填不发送，教练有对话时提示 `coachBusyHint`）。
7. 两种导入：设计顾问导入教练结果和题目下拉；工坊两级导入设计子问题。
8. 工坊保存为另存新条目，原条目不被覆盖；从备课本打开工具可继续编辑。
9. 生成中切换视图触发离开确认；停止按钮有效。
10. 换账号或退出：两个工作台的结果、表单、本地草稿全部换成新账号的。
11. 打印预览：三种工具各一次，页面只出现 `#rs-print` 内容，问卷末尾有结束语。
12. 工具类型标签用左右方向键切换；游客点生成时弹出登录门槛。
13. 560px 及以下：一页纸设计表和审查表变为卡片，按钮不挤出屏幕。
14. 全程控制台脚本错误为 0。

截图只放在临时目录，人工查看桌面首页、手机首页、两个工作台和打印预览后删除。

---
## 13. 已授权真实模型冒烟（恰好 6 次请求）

按 D9，本批授权 **6 次**真实模型请求，不得多调（用户若推翻 D9，跳过本节并在报告中写明）。做法同 2026-10-08：本地候选服务读取服务器环境中的密钥（密钥不进仓库、不写进报告），使用独立的临时普通教师账号，结束后按精确 UID 删除并确认残留为 0；不发邮件，不把对话写进业务库。

| 序号 | 请求 | 样例 | 通过标准 |
|---|---|---|---|
| 1 | 研究设计 | 小学五年级数学教师；只有自己任教的 1 个班（45 人，约 8 名作业困难学生），没有平行班；一学期；可收集学生作业、自己的课堂观察、学生访谈；只会 Excel；主要靠自己；校级小课题；方法不确定 | JSON 可解析；主方法为行动研究；准实验在不推荐中；plan 2–4 行；伦理提醒包含不给学生贴标签 |
| 2 | 问卷从零起草 | 子问题取自第 1 次结果中的问卷行（若无则用「学生对分层作业的感受如何？」），学生、小学高年级、5点 | 可解析；每维 3–6 题、全卷不超过 30 题；反向题不超过五分之一；规则检查没有匿名、自愿和敏感基本信息三类提示 |
| 3 | 访谈提纲从零起草 | 学困生完成分层作业时遇到哪些困难？学生、半结构式、15 分钟 | 可解析；规则检查没有封闭式提问提示；主题块 2–3 个；有暖场与收尾；同意事项非空 |
| 4 | 观察记录表从零起草 | 分层作业讲评课中学困生的参与情况；课堂教学；时间取样；本人观察 | 可解析；规则检查没有推断性词语提示；时间点非空；记录规则非空；等级项有 3 级标准 |
| 5 | 审查草稿 | 合成一份 8 题问卷草稿，故意包含一道双重问题、一道引导性问题、一道超出小学高年级学生认知的题 | 可解析；三处分别以「双重问题」「引导性」「超出对象认知」被指出，且引用正确 ID |
| 6 | 重新审查 | 在第 5 次结果上采用全部改写建议后重新审查 | 可解析；新审查行替换旧行；不再指出已改好的条目 |

结果写入 `reports/2026-10-12-research-methods-smoke.json`：每次的 provider、model、耗时、是否可解析、关键检查结果与问题清单；不写密钥、账号、IP 或完整对话。任一项未通过时，先记录原样结果，再判断是提示词问题还是解析问题；修改提示词必须同时改本文档对应锚点下的代码块，保持逐字一致，修改后的复测请求**另行征得用户同意**，不在这 6 次之内。

---
## 14. 部署、文档与清理

1. 严格按 AGENTS.md 的无中断流程：打包 → 上传 release → 完整静态、API、两份 Nginx 与数据库一致性备份（目录 700、文件 600）→ 候选 3002 健康与守卫验收 → 两份 Nginx 热切到候选 → 原子交换静态与 API 目录 → 重启正式 3001 并验收 → 两份 Nginx 切回 3001 并核对**实际生效**上游 → 公网验证通过后再删除候选 → 保存 PM2。本批无数据库迁移。
2. 公网运行 `node scripts/check-production.mjs https://ai.teachailab.com/`，必须全部通过；线上隔离浏览器复跑第 12 节中不需要真实模型的项目。
3. 更新 AGENTS.md：Current Notes 新增一条本批事实（含测试数、发布目录、备份目录、PID）；Pages 表的 research 行；Key JS Files 加 `research-methods.js`；Deployment History 加一行。同步 README.md。
4. 写验收报告 `reports/2026-10-12-research-methods.md`：交付、验证、冒烟摘要、生产发布与清理、两段肖像提示词。
5. 按 AGENTS.md 的部署后规则提交并推送 GitHub。
6. 清理：本地预览、隔离浏览器、候选进程、临时 QA 脚本与依赖、截图、打包副本、服务器暂存与交换后的旧目录全部删除并回查；正式 release、私密备份与选定肖像保留。

---
## 15. 下一批候选（本批不做）

- **访谈编码助手**：导入工坊保存的访谈提纲和教师整理过的访谈文字，做初始编码、类属归纳与引语摘录；需要先解决较长文本的分段发送和匿名化提醒。
- **主题综合**：把多张精读卡按主题归并，形成综述提纲。
- **评审专家**：模拟评审意见，指出申报书或论文的薄弱处。
- **技术路线图**：把一页纸研究设计转成技术路线图草稿。
