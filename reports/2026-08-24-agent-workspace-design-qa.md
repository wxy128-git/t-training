# 数字成员个人工作台 Design QA

## 对照对象

- source visual truth: `/Users/wangxingyu/.codex/generated_images/01a031c0-4991-71c2-8511-aa6ed915780c/exec-deb6313f-f485-4357-8486-5f75fc4a5806.png`
- normalized source: `/Users/wangxingyu/C-C/t-training/design-qa-assets/agent-workspace-source-1440x1024.png`
- implementation screenshot: `/Users/wangxingyu/C-C/t-training/design-qa-assets/agent-workspace-desktop-1440x1024.png`
- responsive screenshot: `/Users/wangxingyu/C-C/t-training/design-qa-assets/agent-workspace-mobile-390x844.png`
- before-fix screenshot: `/Users/wangxingyu/C-C/t-training/design-qa-assets/agent-workspace-desktop-before.png`
- route: `http://127.0.0.1:8765/agents#lesson-design`

## 尺寸、密度与状态

- 原始参考稿为 1487×1058 px；按相同比例归一化为 1440×1024 px，与桌面实现逐像素尺寸一致。
- 桌面实现 CSS viewport 为 1440×1024，`deviceScaleFactor=1`，截图为 1440×1024 px。
- 手机实现 CSS viewport 为 390×844，`deviceScaleFactor=1`，截图为 390×844 px；`innerWidth=390`、`documentElement.scrollWidth=390`。
- 桌面对照状态：教学设计助手、已填入与参考稿一致的语文一年级任务简报、参数折叠、交付区为空、处于“了解任务”阶段、未登录。
- 手机响应式状态：教学设计助手、空白任务简报、参数折叠、处于“了解任务”阶段、未登录。

## Full-view comparison evidence

参考稿和最终实现已在同一次视觉输入中以 1440×1024 原始分辨率共同打开对照。最终实现保持参考稿的核心构图：左侧任务简报、右侧成员交付、突出主任务输入、压缩学科/年级/课时、次要参数渐进展开、红色主操作和底部教师核验提示。

项目原有“备课项目”条带、成员简介、三阶段工作状态与右下帮助入口被保留。这会让双栏主体相对参考稿下移约一个项目条带的高度，但属于有意保留的既有产品能力，并非实现遗漏；双栏比例、首屏操作可见性和任务层级仍成立。

## Focused region comparison evidence

未另做裁切。两张 1440×1024 原图中的头像、标题、任务提示、输入正文、背景参数、按钮文案、交付空状态与核验提示均可直接辨认；关键细节已在同一次原始分辨率对照中检查，额外裁切不会提供新的判断信息。

## Findings

- 没有残留的 P0、P1 或 P2 问题。
- 字体与排版：沿用项目现有中文系统无衬线字体，标题、正文、小标签和按钮的粗细层级与参考稿一致；实现的小字号略紧凑，但仍在既有设计系统范围内，无截断核心信息。
- 间距与布局节奏：双栏 45/55 比例、卡片边界、输入区高度、空状态垂直居中和按钮位置与参考稿一致。保留备课项目条带造成的整体下移属于已接受的产品约束。
- 颜色与视觉令牌：沿用站点现有浅灰蓝背景、白色面板、青绿色成员状态和砖红主操作；语义和对比度与参考稿一致。
- 图片质量与资产：使用现有高清数字成员肖像并通过容器内缩放调整为近景头像，没有使用占位图、CSS 绘图或伪造资源；桌面和手机裁切清晰。
- 文案与内容：成员使用第一人称了解任务，交付区明确归属于“教学设计助手”，主操作为“任务已说清，开始起草”，并明确 AI 仅交付初稿、由教师核验，符合所选方向。
- P3 / accepted: 实现保留站点现有备课项目条带、成员能力简介和帮助入口，因此比概念稿信息略多；这些元素有实际产品用途，不建议为了形式一致而删除。

## Comparison history

### Iteration 1 — blocked

- P2：桌面主体高度为固定 760px，底部核验提示落到 1024px 视口之外。
- P2：顶部信息区和备课项目条带占用过多纵向空间，双栏主体明显低于参考稿。
- P2：成员头像使用全身比例，身份感弱于参考稿的近景头像。

Fixes:

- 将桌面双栏高度改为 `clamp(560px, calc(100vh - 352px), 720px)`，让底部核验提示回到首屏。
- 压缩工作台头部、简介和项目条带的内外间距，并将桌面栏宽调整为约 45/55。
- 在工作台头像容器内放大现有肖像并上移裁切中心，形成稳定近景身份锚点。

### Iteration 2 — passed

- 使用相同 1440×1024 视口重新截图，并将参考稿归一化到 1440×1024 后共同打开对照。
- 前述底部不可见、纵向密度和头像尺度问题均已消除；未发现新的可执行 P0/P1/P2 问题。
- 另以真实 390×844 手机指标验证：页面滚动宽度等于视口宽度，关闭状态的侧边导航位于屏外属于预期行为。

## Primary interactions and console check

- “展开全部参数”可切换为打开状态，原 6 个教学设计字段均保留。
- 编辑“教学任务描述”后，右侧“本次任务”摘要同步更新。
- `brief → working → review` 三阶段可正确切换；前序阶段标记为 complete，当前阶段标记为 active。
- 测试后已恢复空白任务内容、折叠参数和“了解任务”阶段。
- 浏览器未捕获 JavaScript runtime exception。日志中出现两次本地预览 `/api/analytics` 返回 501，以及一次 PWA 安装横幅提示；前者是本地预览未实现统计写入的既有行为，后者为浏览器信息提示，均不影响工作台主流程。

## Implementation Checklist

- [x] 任务简报与成员身份
- [x] 关键参数前置、次要参数折叠
- [x] 成员归属的交付区与教师核验提示
- [x] 三阶段工作状态
- [x] 1440×1024 同状态视觉对照
- [x] 390×844 响应式与横向溢出检查
- [x] 参数、摘要与阶段交互检查
- [x] 站点、函数与腾讯云适配自动检查

final result: passed
