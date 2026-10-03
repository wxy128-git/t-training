# 腾讯管理后台适配（2026-10-03，已上线）

## 完成内容

- 后台内容读写固定使用同源腾讯接口。后台遇到 404、服务故障、超时或异常响应时明确报错，不切回 Firebase，也不以默认内容冒充读取成功。
- 留言只修改 handled 状态；原文、联系方式、姓名和时间保留。公告编辑保留创建时间。
- 整份列表保存增加版本核对，旧页面不能覆盖已被他人更新的数据；腾讯侧使用独立连接、数据库命名锁及事务，使整批写入全部成功或全部撤回。资源分类保存和删除也核对版本。
- 不再截断为 300 条。非法格式、重复编号（含仅大小写不同）、超限列表整体拒绝；当前上限 2000 条，仍受原请求体大小限制。数据库编码器不再将分类内数组截断为 100 项。
- 概览按栏目显示成功或失败，列表提供重试；保存异常有明确反馈。用户列表继续从腾讯账号及资料表关联读取。
- 撤下账号删除、按邮箱/手机号清理认证账号、旧库初始化入口。服务端仍拒绝账号删除，没有实现新删除功能。
- 管理员及个人列表禁止缓存，个人列表不进入公开缓存；公开社区列表/详情只展示已审核内容。管理员身份判定、登录认证代码不变。
- 使用事件采集仍关闭，不开展画像、研究导出或新增采集；历史数据未删除。

## 数据路径与旧路径

管理页面 → /api/content 或 /api/admin-users → server/local-*.mjs → MariaDB。

实际存储继续使用现有 firestore_documents 表（名称沿用迁移格式，并不代表连接 Firebase），不新建业务表、不搬迁生产数据。

functions/api/content.js、functions/api/admin-users.js 只增加旧路径说明，不同步实现腾讯事务。它们不是腾讯生产数据源，也不再作为后台自动备用。旧环境回退必须单独验证，不能直接用当前后台切回。Firebase 旧账号首次登录的密码兼容桥接未改。

## 验证结果与边界

- 最终 npm run check 全部通过。后台客户端 30 项、腾讯后台行为 29 项，其他既有检查一并通过。
- 新测试覆盖：原留言保留、公告时间保留、301 条完整保存、非法请求不删除数据、写入中断回滚、同版本并发保存仅一个成功、101 项素材不截断、读取错误、缓存隔离、非管理员拒绝、停用账号删除。
- 浏览器实际点击：标记留言后原文和联系方式仍在；编辑工具保存成功；模拟 503 时显示重试且其他概览数值正常；解除故障后列表恢复；用户列表显示两位虚构用户且无删除入口。
- 发布前已补充真实 MariaDB 隔离验收：服务器上随机创建专属测试库/账号，29 项全部通过，包括跨连接命名锁、同时保存冲突、失败回滚、301 条及 101 项完整保留。测试库及账号自动清理，未对业务库执行测试写入。
- 本地开发阶段未部署、写生产数据、发邮件或调用模型；用户后续明确授权上线，发布过程通过 SSH 进行，状态见下方。测试浏览器已关闭，本轮 8768 演示服务已停止，自动生成的浏览器日志已删除。演示程序及测试夹具属于可重复验收的正式交付文件。

## 你可以自己点看的本地验收

在项目目录运行：

```sh
npm run preview:admin
```

打开 http://127.0.0.1:8768/admin 。顶部标明“全部为虚构数据”，自动进入演示管理员界面，不需要真实账号。

1. 联系留言：点“标记已处理”，核对原文仍在。
2. 工具管理：编辑演示工具名称并保存，核对列表更新。
3. 用户列表：核对显示用户、没有删除或清理账号入口。
4. 概览：核对没有旧数据库初始化按钮。

此演示只监听本机、内存保存；重启恢复虚构数据，不连接腾讯、Firebase、邮件或模型。结束时在运行窗口按 Ctrl+C。

## 后续与决策

用户已授权发布。提交 `a9d02b0` 已发布到腾讯服务器：正式 API 继续监听 3001，Nginx 两份配置已恢复 3001；回滚备份为 `/home/ubuntu/t-training/backups/20261003-admin-a9d02b0`，发布目录为 `/home/ubuntu/t-training/releases/t-training-admin-release-20261003`。公网检查通过 117 项。候选进程、临时静态目录和隔离测试目录已清理，PM2 已保存。旧页面缺少版本号会被拒绝保存，刷新后台即可；共享 data.js 版本 `20261003-tencent-admin`、Service Worker `20261003-v33` 已上线。

## 文件清单

- `AGENTS.md`
- `README.md`
- `admin.html`
- `agents.html`
- `article.html`
- `articles.html`
- `classroom-tools.html`
- `functions/api/admin-users.js`
- `functions/api/content.js`
- `index.html`
- `js/data.js`
- `multimodal.html`
- `news.html`
- `package.json`
- `paths.html`
- `privacy.html`
- `prompts.html`
- `reports/2026-10-03-tencent-admin.md`
- `resources.html`
- `scripts/check-site.mjs`
- `scripts/fixtures/admin-store.mjs`
- `scripts/fixtures/admin-mariadb.mjs`
- `scripts/check-production.mjs`
- `scripts/preview-tencent-admin.mjs`
- `scripts/test-admin-content-client.mjs`
- `scripts/test-tencent-admin.mjs`
- `server/local-admin-users.mjs`
- `server/local-content.mjs`
- `server/local-firestore-store.mjs`
- `sw.js`
- `tools.html`
- `workspace.html`

除 admin.html 外，其他 HTML 只统一更新 data.js 的缓存版本。
