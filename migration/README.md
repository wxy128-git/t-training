# Firebase → 腾讯 MariaDB 迁移（隔离阶段）

这里保存迁移目标数据库的结构和导入脚本。当前脚本只把 Firebase 的账号记录和 Firestore 原始文档导入独立的 `t_training_migration` 数据库；线上 API 仍使用 Firebase，不能把此目录的数据库接入生产，直到登录、权限和回滚测试全部通过。

导入保留两份信息：

- `auth_users.raw_json` 保存 Firebase Authentication 原始用户记录，包含 UID、邮箱验证状态和密码哈希字段；不保存明文密码。
- `firestore_documents.raw_json` 保存每个 Firestore 文档原始结构，同时为用户资料建立 `user_profiles` 查询表。

生产切换前必须完成：密码哈希参数核对、登录/注册/验证/找回密码实现、所有 API 的权限复刻、双写或灰度验证，以及 Firebase 回滚方案。导入脚本使用 upsert，可重复执行；不会删除目标表中的记录。
