# Firebase → 腾讯服务器迁移进度（第一阶段）

本阶段只做备份、盘点和隔离目标库准备，没有切换生产登录、没有修改 Firebase 数据，也没有删除任何账号。

## 已完成

- 在腾讯服务器建立受限回滚快照：`/home/ubuntu/t-training/backups/20260923-pre-migration-firebase`。
- 快照统计：Firebase Authentication 358 个账号；Firestore 11 个顶层集合、10,729 条文档，其中 `users` 350 条、`works` 145 条、`analytics_events` 10,190 条。
- 账号快照保留原 UID、邮箱验证状态、账号状态和密码哈希字段；不含明文密码。
- 腾讯服务器安装并启用 MariaDB，数据库只监听 `127.0.0.1:3306`，建立隔离库 `t_training_migration`。
- 已将快照导入隔离库并核对数量：`auth_users` 358、`user_profiles` 350、`firestore_documents` 10,729。线上 `t-training-api` 仍使用 Firebase。
- 新增 `migration/schema.sql`、`migration/import-firebase.mjs` 和对应依赖，导入脚本使用 upsert，可重复执行，不删除目标数据。

## 进入账号并行迁移前的人工步骤

Firebase 当前服务账号可以读取用户记录和密码哈希，但不能读取 Firebase 专用 SCRYPT 哈希参数。若要让用户继续使用原密码，需要由有 Google Cloud IAM 权限的管理员给服务账号增加只读权限 `firebaseauth.configs.getHashConfig`。Firebase 官方要求通过自定义 IAM 角色授予该权限，见 [Firebase 用户管理文档](https://firebase.google.com/docs/auth/admin/manage-users) 和 [Firebase 密码导入文档](https://firebase.google.com/docs/auth/admin/import-users)。

服务账号标识：

`firebase-adminsdk-fbsvc@xylaoshi-28f6c.iam.gserviceaccount.com`

不要把服务账号 JSON、私钥或密码发送给我。授权完成后先只读验证哈希参数，再继续编写本地登录校验和灰度接口；如果不授予该权限，只能保留账号和资料并要求用户重置密码，不能无损保留原密码登录。

## 尚未执行

- 未把腾讯 MariaDB 接入生产 API。
- 未停止 Firebase Authentication 或 Firestore。
- 未修改 DNS、Nginx、PM2、Firestore Rules 或任何线上账号资料。
- 未发送迁移通知邮件，未调用模型。
