# AI 工具目录页 Design QA

## 对照对象

- source visual truth: `/Users/wangxingyu/C-C/t-training/reports/2026-09-25-tools-redesign/reference-resources.png`
- implementation screenshot: `/Users/wangxingyu/C-C/t-training/reports/2026-09-25-tools-redesign/implementation-desktop.png`
- responsive screenshot: `/Users/wangxingyu/C-C/t-training/reports/2026-09-25-tools-redesign/implementation-mobile.png`
- full comparison: `/Users/wangxingyu/C-C/t-training/reports/2026-09-25-tools-redesign/comparison-desktop.png`
- focused comparison: `/Users/wangxingyu/C-C/t-training/reports/2026-09-25-tools-redesign/comparison-cards.png`
- route: `http://127.0.0.1:8765/tools`

## 尺寸、密度与状态

- 源页面与实现均在 1440×1000 px 视口截图，用于直接比较页面层级、筛选区、分区标题和卡片规格。
- 手机实现的 CSS 视口为 390×844 px，页面没有横向溢出。
- 桌面端共显示 20 个工具、4 个任务分区；首张卡片为 331×140 px。
- 手机端为单列布局，卡片为 350×140 px；两行筛选项在各自行内横向滑动，不撑宽页面。

## Full-view comparison evidence

最终实现沿用课件素材页的浅灰蓝背景、紧凑首屏、白色圆角卡片、粗体分区标题和橙红色选中状态。搜索框与页面标题保持左右对应，任务与条件筛选集中在同一条浮动筛选面板中，形成相同的目录浏览节奏。

## Focused region comparison evidence

卡片区域另以相同宽度裁切到 `comparison-cards.png` 共同查看。工具卡片只保留统一 Logo 底板、名称和两行以内的用途说明；已移除右上角箭头、费用标签、适用建议、核对日期和底部跳转文案，整张卡片仍可点击访问官网。

## Findings

- 没有残留的 P0、P1 或 P2 问题。
- 字体与排版：页面标题、筛选标签、分区标题和卡片文字层级与课件素材页一致。
- 间距与布局：1440 px 显示四列、1180 px 以下三列、860 px 以下两列、760 px 以下单列。
- 卡片高度：使用 140 px 基础高度，内容较长时可自然撑开，避免固定比例造成大块留白。
- Logo 一致性：20 个工具都使用 46×46 px 圆角方形底板，并全部改用对应官网提供的 Logo 或站点图标；加载失败与图标回退数量均为 0。
- 视觉层次：卡片改用轻微暖白背景，标题字重和说明文字对比度提高；分区标题右侧增加浅色细线，长列表的结构更清楚。
- 交互：筛选按钮带有可读的选中状态；卡片悬停时上移 2 px，Logo 轻微放大，标题变为品牌砖红色；键盘焦点与减少动态效果偏好均有对应状态。
- P3 / accepted：工具页保留“任务”和“条件”两套筛选以及安全提示，因为这些信息直接支持教师选择工具；课件素材页只需要单套分类筛选。

## Iteration history

### Iteration 1 — passed

- 将工具页改为与课件素材页一致的紧凑目录布局，删除重复标签、箭头和底部操作栏。
- 完成四列、三列、两列和手机单列响应式布局。

### Iteration 2 — passed

- 为 20 个工具补齐官网 Logo，统一 Logo 底板并验证加载结果。

### Iteration 3 — passed

- Logo 底板从 44 px 微调到 46 px，强化标题和说明文字层级。
- 增加暖白卡片、分区细线以及克制的悬停和键盘焦点反馈。
- 桌面与手机端卡片继续保持 140 px 基础高度，没有内容或页面横向溢出。

## Primary interactions and console check

- 任务筛选“图像·音视频·数字人”正确显示 7 个工具，并切换到单层网格。
- 条件筛选“免费”正确显示 7 个工具、3 个分区。
- 搜索“Gamma”正确显示唯一结果；无结果关键词会显示空状态；清空后恢复 20 个工具和 4 个分区。
- 任务和条件按钮的 `aria-pressed` 会随当前筛选同步更新。
- 20 个官网 Logo 全部加载成功，失败数量与回退图标数量均为 0；来源记录见 `reports/2026-09-25-tools-redesign/logo-sources.md`。
- 卡片内适用建议、标签、底部操作栏与跳转箭头数量均为 0。
- 浏览器没有页面脚本异常。本地预览仅有 `/api/analytics` 返回 501 的既有统计警告，不影响工具页功能。

## Implementation Checklist

- [x] 与课件素材页一致的背景、首屏和白色卡片墙
- [x] 桌面四列、中宽三列、平板两列、手机单列布局
- [x] 任务与条件双重筛选、搜索、清除和空状态
- [x] 20 个官网 Logo、统一 46×46 px 底板及失败回退
- [x] 左对齐卡片与精简信息层级
- [x] 暖白卡片、分区细线和克制的悬停反馈
- [x] 无箭头、无重复标签、无底部说明栏
- [x] 手机端筛选横向滑动且页面无横向溢出
- [x] 同尺寸全页与卡片区域视觉对照

final result: passed
