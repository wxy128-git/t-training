# 科研伙伴人物形象验收

状态：2026-10-07 已上线；本地回归、桌面/手机浏览器、公网与清理完成。

## 交付

- 研究问题教练（研究问题漏斗）：亲切、耐心，深青色衬衫、笔记本与铅笔。
- 文献研读伙伴（文献精读卡）：沉静、细致，蓝灰开衫、眼镜与文献纸页。
- 两张独立虚构人物肖像使用内置 imagegen 生成，以现有 `assets/agent-portraits/lesson-design.jpg` 为画风参考，采用写实数字绘画、冷灰背景和克制环形线条。未使用真实教师照片，未虚构学历、院校、头衔或研究资历。
- 发布图片均为 900×900 JPG：`assets/agent-portraits/research-funnel.jpg`（135,303 字节）与 `assets/agent-portraits/research-reading-card.jpg`（133,726 字节）；与现有团队同用 JPG 与低饱和显示。原始生成 PNG 作为源资产保留在工具生成目录。
- 入口卡片显示人物称呼、原功能名称和第一人称介绍；桌面并列、900px 以下单列。工作台使用 56×64px 小头像（手机 44×52px）和角色标识；对话署名与开场白改用研究问题教练，明确 AI 身份。
- 功能名称、智能体 ID、保存成果的名称、原始与请求补充提示词均保留；后端、PDF、保存/导出、认证、管理员与研究采集未改。只新增角色展示与图片，不新增统计事件、模型请求或数据库字段。
- 仅研究数据缓存升级 `20261007-research-partners`，SW `20261007-v36`；全站共享脚本与 CSS 不改。图片按既有静态缓存，不新增预缓存下载。

## 验证

- `npm run check` 全绿，科研回归仍为 64 项，两个原始系统提示词逐字保留断言通过。
- Browser 插件初始化仍被环境禁止导入 node:process，使用隔离无头 Chrome 与临时 Playwright；没有操作个人浏览器资料。
- 本地浏览器 **34 项通过**：1440/1081/900/768/561/390/320px 的首页、漏斗与精读工作台无横向溢出；两张图完整加载；人物称呼与功能名称同时可辨；键盘 Enter 进入；小头像尺寸；对话署名；访客发送弹登录；合成 events-v1 流式回复仍使用原 ID；退出清空；运行时错误 0。
- 人工查看桌面首页、手机首页/漏斗/精读截图，人物裁切与文字排版正常；头像不占用文献表格空间。无需新增镜像实现的单元测试，以现有回归和实际浏览器交互验证此次展示改动。
- 本轮没有调用科研真实模型、创建真实账号、发邮件或写生产业务数据。图像生成仅用于两张肖像。

## 生产发布与清理

- 功能提交 `c3ff734d236d`。release `/home/ubuntu/t-training/releases/20261007-research-partners-c3ff734`，166 个静态文件、30 个 API 文件共 **196 个 SHA-256** 与正式目录一致。
- 完整静态/API、两份 Nginx 及一致性数据库 dump 备份 `/home/ubuntu/t-training/backups/20261007-pre-research-partners-c3ff734`；备份目录 700、数据库文件 600，gzip 完整性验证通过。未执行数据库迁移。
- 按无中断流程：候选 3002 健康及守卫验收 → 两份 Nginx 热切到候选 → renameat2 原子交换静态/API 目录 → 重启正式 3001 并验收 → 两份 Nginx 同步切回 3001 → 公网首页、工具及登录错误处理通过 → 删除候选、保存 PM2。候选、正式、公网守卫各 **16 项通过**。
- 公网 `node scripts/check-production.mjs https://ai.teachailab.com/` **136 项通过**，新增人物入口、研究数据缓存、两张 JPG 状态/MIME/体积/30 天缓存断言。线上隔离 Chrome 同套交互 **34 项通过**，脚本错误 0；认证和模型为合成替身，不创建账号或调用模型。
- 旧 `/research?from=portrait` 302 保留路径参数；教育媒体 `https://teachailab.com/` 200。两份 Nginx 完全一致，`nginx -T` 实际上游均为 3001，PDF ESM MIME 配置保持。
- PM2 已保存，仅 `edu-media`（PID `3380240`）与 `t-training-api`（PID `3721812`）online；`pm2-ubuntu` active / enabled，MainPID `1091830`。候选错误日志 0 字节，随临时目录清理。
- 本地预览、隔离浏览器与候选服务已停止；临时 QA 脚本、依赖、截图、打包副本、服务器候选配置/日志与交换后的旧目录均已删除并回查。正式 release、私有回滚备份与选定肖像源资产保留。
- `git diff --check` 通过；上线事实同步更新 AGENTS.md、README.md 并提交/推送，不为后续文档同步递归创建部署历史。

## 最终生成提示词

工具：内置 imagegen；输入图仅用作画风参考。两张最终生成均直接选用，未改人物内容，仅用 sips 缩放及 JPEG 压缩以供网页发布。

### 研究问题教练

```text
Use case: illustration-story. Asset: portrait for the research-question coach on a Chinese teacher AI website. The attached image is a STYLE REFERENCE only: match its refined realistic painterly digital illustration, soft cool-gray background, restrained thin broken circular line motifs, natural skin texture, eye-level standing half-body portrait and editorial palette. Create a different fictional East Asian man about 40, softly tousled short dark hair, kind thoughtful face, slight warm smile, relaxed and attentive as a fellow school teacher. Deep desaturated teal overshirt over a light cream shirt, holding a small notebook and a pencil naturally at waist level. Centered single person, head fully visible with generous breathing room, face in upper third; chest and hands visible; square composition suitable for both entry card and small avatar cropping. Soft even light. Distinct from reference identity, no text, letters, logos, credentials, university badges, watermark, robot elements or neon. The character feels patient, listening and ready to ask one useful question.
```

### 文献研读伙伴

```text
Use case: illustration-story. Asset: portrait for the literature-reading partner on a Chinese teacher AI website. The attached image is a STYLE REFERENCE only: match its refined realistic painterly digital illustration, soft cool-gray background, restrained thin broken circular line motifs, natural skin texture, eye-level standing half-body portrait and editorial palette. Create a different fictional East Asian woman about 38 with dark hair loosely tied back, fine oval glasses and a calm attentive face, slight friendly smile. Light off-white blouse with desaturated slate-blue cardigan; holding a few neatly annotated paper sheets naturally at waist level, with a muted blue bookmark. Centered single person, head fully visible with generous breathing room, face in upper third; chest and hands visible; square composition suitable for both entry card and small avatar cropping. Soft even light. Distinct from reference identity, no text, letters, logos, credentials, university badges, watermark, robot elements or neon. The character feels precise, thoughtful and approachable as a reading colleague.
```
