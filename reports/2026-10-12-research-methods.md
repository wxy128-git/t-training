# 科研写作第二批智能体验收（2026-10-12）

## 状态

已于 2026-10-12 按用户后续“上线”指令无中断发布，功能提交 `aeea6f2`。完整本地检查、候选 / 正式 / 公网守卫、202 文件哈希、158 项公网检查和 116 项线上隔离浏览器验收通过。

真实模型仍保持原始结论：第 1 次研究设计通过，第 2 次问卷匿名 / 自愿指导语未通过；先按用户“任何一项不通过，先停下来把原样结果告诉我，不要自行追加调用”的要求停止，报告原样结果后，用户明确指示“上线”。本次依此授权部署当前版本，没有修改提示词或追加模型请求，第 3–6 次没有执行。部署通过不等同于六次真实模型全部通过。

## 已交付实现

- 新增研究设计顾问与研究工具工坊，以及两张统一画风的虚构人物肖像。科研首页为四张卡；研究设计、问卷、访谈提纲与观察记录表各有工作台。
- 系统提示五段及 JSON_SUFFIX 取自 2026-10-12 方案代码块，回归验证逐字一致。原教练与精读卡的系统提示及既有纯函数保留。
- 结构化规范化、条目编辑、审查状态、采用改写或删除、重新审查、实时规则检查、Markdown / TSV 导出、预览、三类工具打印、备课本新条目保存及续编。
- 教练到设计、设计到工具、设计回教练的交接；两级设计子问题导入；临时交接按 UID、TTL 和目标隔离，切号与退出重置工作台。
- 后台科研文案追加 135 项，共 288 项。腾讯科研字段上限 300，其他页 40；Firestore 仅更新兼容规则源，未连接或发布旧库。
- 共享文案 / PWA / 向导及科研 core、data、methods、methods CSS 版本为 20261012-methods；SW 20261012-v41。新肖像不预缓存。
- agents.html 保持逐字不变，遵循用户明确禁止修改的边界；其既有共享脚本查询版本由静态检查显式保留。admin.html、workspace.html 等共享消费者仅同步缓存查询版本，未改管理员、备课本、认证、邮箱、隐私或统计逻辑。

## 开发验证

完整 npm run check 全绿：站点 12 公开页 / 14 应用页、课程匹配 13、函数 80、邮箱 79、邮件构造 16、生成可靠性 19、资源 Logo 31、后台客户端 30、腾讯 API 16、统计隐私 31、隐私同意 64、隐私界面 16、腾讯后台 42、账号删除 51、科研 209 项。测试全为合成数据，未调用真实模型或发送邮件。

独立无头 Chrome 与临时 Playwright 隔离验收 109 项通过：1440、1081、900、768、561、390、320px 均无页面横向溢出；四卡桌面 2×2、900px 以下单列；四张肖像加载及键盘入口；缺项聚焦、设计八节、复制与保存、刷新只读及基于此设计新建；工具三类型与审查草稿；改字、采用改写和删除、原句已修改和条目已删除状态、40 题上限；复审时禁用与可停止、替换结果、错误保留旧行；三种交接与两种导入；另存不覆盖旧条目；切换视图离开确认；三种打印及清理；方向键标签；切号、退出与游客登录门槛；预览；手机设计表和审查表卡片化。控制台脚本错误 0。

页面使用真实模块 HTML / CSS / JS / Markdown 清洗，认证、备课本和 NDJSON 模型流用合成替身；16 次合成流响应不消耗模型配额。使用新隔离上下文，未读取个人浏览器资料。桌面和手机首页、两工作台、审查卡片以及三种打印截图已人工检查，截图为临时材料。

服务器随机隔离 MariaDB 库验证 42 项通过，包括 288 项保存与 301 项整次拒绝；测试库、专属测试账号和虚构数据均自动清理，未在生产文案中写入测试值。

## 真实模型冒烟：失败即停止

实际 provider 为 deepseek，model 为 deepseek-v4-flash；服务器当前没有智谱密钥，此次不声称验证 GLM 或供应商回退。独立候选服务仅监听随机本机端口，读取服务器私密环境；没有更改 Nginx、正式服务、生产静态目录或旧 Firebase。

| 请求 | 结果 | 耗时 | 检查 |
| --- | --- | --- | --- |
| 1 研究设计 | 通过 | 13,529ms | JSON 完成并可解析；行动研究为主、准实验不推荐、plan 2–4 行、伦理提醒不给学生贴标签 |
| 2 问卷从零起草 | 未通过 | 7,302ms | JSON 完成并可解析；4 维各 4 题、总 16 题、反向题 3 题通过；匿名 / 自愿规则未通过 |
| 3–6 | 未执行 | — | 按用户失败即停止要求保留未执行状态，无额外调用 |

第 2 次原始指导语（逐字）：

> 同学你好！我们想了解你对数学分层作业的感受。问卷不写名字，答案没有对错，也不会影响你的成绩。请按你的真实想法填写，大约需要8分钟。谢谢你的帮助！

规则检查原样提示：`指导语没有写明匿名`、`指导语没有写明自愿`。指导语表达“不写名字”，但未写“匿名”与“自愿”，未满足第 13 节要求这三类规则提示均不出现的标准。JSON 解析没有失败；五段提示词仍与方案一致，未自行修改提示词、放宽规则、补写模型内容或追加复测。这属于模型遵循既有明确要求不足，用户在获知结果后明确要求上线当前版本；此次上线指令不作为追加模型请求或改写提示词的授权。

完整单次模型原始回复见 [失败原样结果](2026-10-12-research-methods-smoke-failed-original.json)，结果摘要见 [冒烟 JSON](2026-10-12-research-methods-smoke.json)。两份均不含密钥、账号、IP 或完整对话。临时普通教师账号、资料及会话按精确 UID 删除，三表合计残留 0；无邮件发送、无业务对话保存。

首次启动候选脚本在模型调用之前被服务器的正式自启动环境项触发，尝试监听已占用的 3001 端口并退出；该次实际请求为 0，也未创建临时账号。随后仅为候选进程关闭自启动项，使用随机本机端口执行上表 2 次请求，正式 API 始终运行。

## 文档与清理

AGENTS.md Current Notes、Pages 和 Key JS Files，以及 README.md 已立即更新为已上线，并新增 Deployment History。release `/home/ubuntu/t-training/releases/20261012-research-methods-aeea6f2`，回滚点 `/home/ubuntu/t-training/backups/20261012-pre-research-methods-aeea6f2`。完整静态、API、双 Nginx、事务数据库、私密配置与 PM2 清单均已备份（目录 700、文件 600），数据库 gzip 3,568,739 字节；发布包 172 静态与 30 API 共 202 项均与提交哈希一致。本批无数据库迁移。

无中断流程已完成候选 3002、双配置热切、静态与 API renameat2 原子交换、正式 API 重启及健康、双配置切回；通过 nginx -T 核对实际生效上游 3001，两份文件完全一致。候选、正式和公网守卫各 20 项通过，均为公开读取、无效请求或未登录拒绝，不触发真实模型、邮件或业务写入。正式 API PID 1187109，课程站 PID 4180111。公网完整检查 158 项通过。线上隔离无头 Chrome 共 116 项通过：41 项真实游客使用正式身份 / 导航 / PWA / 文案接口，75 项使用生产 HTML / CSS / 科研模块与合成身份、备课本和 NDJSON 流，复跑第 12 节表单、保存 / 刷新、工具三类型、审查和失败保留、编辑 / 状态 / 上限、两类导入、三种交接、停止 / 离开确认、预览 / 打印、七种宽度、移动表格卡片、账号切换及游客门槛。16 次合成响应，新增真实模型调用 0，生产业务写入 0，脚本错误 0；未使用个人浏览器资料，旧 Firebase 数据域名与身份域名在隔离测试中禁止连接。既有管理员自定义文案保留，新字段回退默认值。

候选进程已关闭并删除，PM2 保存仅 t-training-api 和 edu-media 两应用；systemd active / enabled，MainPID 1091830 与 PM2 pidfile 一致。双 Nginx 文件完全一致，实际生效上游 3001；官方目录 202 文件再次哈希一致。旧 Cloudflare `/research?probe=20261012` 返回 302 且保留路径 / 查询参数，课程站 HTTP/2 200。

首次候选守卫在 PM2 启动完成之前尝试连接导致 ConnectionRefused；生产尚未切流、无模型调用。只为守卫加入就绪等待后，20 项全部通过，随后完成正式切换。没有为此重复发布或修改业务代码。

本地浏览器、合成服务器和候选测试服务均已退出，生产隔离浏览器亦已关闭。临时 Playwright 脚本、截图、测试输出、打包副本、服务器 QA 目录和测试用依赖链接已删除并回查。本次上线候选、专属日志 / 配置、服务器暂存、交换后的旧目录和依赖链接也已清理，正式 release 与私有备份保留；备份全部目录 / 文件权限再次核对为 700 / 600。正式 release、已有私有备份、源文件、合成回归夹具及生成工具原图保留。

## 肖像

采用 frontend-design 与 imagegen 技能。两张选定肖像用内置 imagegen 生成，以 assets/agent-portraits/lesson-design.jpg 为画风参考；工具原图保留于工具生成目录，项目仅保存 900×900 JPG。设计顾问 132,910 字节，工具工坊 136,013 字节，均小于 200KB。桌面、手机卡片及小头像脸部裁切完整。

研究设计顾问最终提示词：

```text
Use case: illustration-story. Asset: portrait for the research-design advisor on a Chinese teacher AI website. The attached image is a STYLE REFERENCE only: match its refined realistic painterly digital illustration, soft cool-gray background, restrained thin broken circular line motifs, natural skin texture, eye-level standing half-body portrait and editorial palette. Create a different fictional East Asian woman about 50 with short neat dark hair lightly streaked with gray, composed and steady face, slight reassuring smile, like an experienced school teaching-research colleague. Deep desaturated ink-blue blazer over a soft gray knit top; holding a clipboard with a simple ruled grid sheet naturally at waist level, no readable writing. Centered single person, head fully visible with generous breathing room, face in upper third; chest and hands visible; square composition suitable for both entry card and small avatar cropping. Soft even light. Distinct from reference identity, no text, letters, logos, credentials, university badges, watermark, robot elements or neon. The character feels calm, practical and good at turning real conditions into a workable plan.
```

研究工具工坊最终提示词：

```text
Use case: illustration-story. Asset: portrait for the research-instrument workshop partner on a Chinese teacher AI website. The attached image is a STYLE REFERENCE only: match its refined realistic painterly digital illustration, soft cool-gray background, restrained thin broken circular line motifs, natural skin texture, eye-level standing half-body portrait and editorial palette. Create a different fictional East Asian man about 32 with short tidy dark hair, focused friendly face, slight smile, sleeves of a pale shirt neatly rolled up, wearing a muted khaki canvas work apron. Holding a pencil, a short ruler and a blank printed form sheet naturally at waist level, no readable writing. Centered single person, head fully visible with generous breathing room, face in upper third; chest and hands visible; square composition suitable for both entry card and small avatar cropping. Soft even light. Distinct from reference identity, no text, letters, logos, credentials, university badges, watermark, robot elements or neon. The character feels careful, hands-on and ready to check every item with you.
```
