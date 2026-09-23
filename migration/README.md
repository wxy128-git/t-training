# Firebase → 腾讯 MariaDB 迁移

此目录提供可重复的只读导出、事务导入和目标库结构。生产切换前，Firebase 仍是线上事实来源；迁移库与候选 API 保持隔离。

## 1. 生成只读快照

服务器环境需要提供 `FIREBASE_SERVICE_ACCOUNT`。目标必须是不存在或为空的目录：

```bash
node migration/export-firebase.mjs /path/to/new-backup
```

导出包含 Firebase Authentication 用户、所有顶层 Firestore 集合、逐文件 SHA-256 和数量清单。目录权限设为 `700`，数据文件设为 `600`。脚本不修改 Firebase。

## 2. 准备数据库

以数据库管理员身份执行：

```bash
mysql < migration/schema.sql
```

目标库保存账号、资料、Firestore 原始文档、本地会话和一次性邮箱操作令牌。`auth_users.raw_json` 保留 Firebase 原始用户记录，但不保存明文密码；本地密码使用独立 `scrypt` 哈希。

## 3. 导入

日常复跑默认只 upsert，不删除目标库已有记录：

```bash
node migration/import-firebase.mjs /path/to/backup
```

正式切换前的最后一次同步可显式启用严格镜像：

```bash
T_TRAINING_IMPORT_RECONCILE=1 node migration/import-firebase.mjs /path/to/final-backup
```

严格镜像会在同一事务中删除快照里已经不存在的账号、资料和 Firestore 文档，并核对账号及文档总数。它只适合生产仍以 Firebase 为事实来源、尚未允许腾讯库产生正式新数据时使用；本地注册启用后不得再次运行严格镜像。

## 密码迁移策略

Firebase 当前服务账号能导出密码哈希字段，但没有读取项目专用 SCRYPT 参数的权限。候选实现采用首次登录迁移：旧账号第一次登录时由 Firebase 校验一次原密码，成功后腾讯服务器保存新的本地 `scrypt` 哈希，之后登录不再依赖 Firebase。明文密码只在该次 HTTPS 请求的内存中参与校验和哈希，不写入数据库或日志。

如以后获得 `firebaseauth.configs.getHashConfig`，可另做离线批量哈希兼容；它不是当前无损迁移的前置条件。

## 生产切换边界

正式启用本地注册与邮箱前，还必须配置腾讯云 SES API、审核邮箱验证与密码重置两个模板、验证真实投递，并完成最终快照。个人实名认证账号不支持 SMTP，生产使用 `T_TRAINING_EMAIL_TRANSPORT=tencent-ses`；模板文件位于 `deploy/tencent/ses-templates/`。切换分两段：先启用本地会话和本地数据，保留 Firebase 注册/邮件桥接；稳定后再启用 `T_TRAINING_REGISTRATION_BACKEND=local` 与 `T_TRAINING_EMAIL_BACKEND=local`。服务器环境密钥不得写入仓库或备份清单。
