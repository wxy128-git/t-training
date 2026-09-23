# 腾讯云邮件推送模板

个人实名认证账号通过腾讯云 SES API 发信。控制台需要创建并审核两个 HTML 富文本模板：

- `verify-email.html`：模板名“AI教师培训中心-邮箱验证”
- `reset-password.html`：模板名“AI教师培训中心-密码重置”

两个模板都只使用 `{{token}}` 变量，链接域名和操作类型固定在模板内。审核通过后，把两个模板 ID 分别写入服务器的 `T_TRAINING_TENCENT_SES_VERIFY_TEMPLATE_ID` 和 `T_TRAINING_TENCENT_SES_RESET_TEMPLATE_ID`。不要把 API 密钥写入仓库。
