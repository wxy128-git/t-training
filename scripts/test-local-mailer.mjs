import assert from 'node:assert/strict';
import { buildTencentSesRequest, sendPasswordResetMail, sendVerificationMail } from '../server/local-mailer.mjs';

const token = 'A'.repeat(43);
const env = {
    T_TRAINING_EMAIL_TRANSPORT: 'tencent-ses',
    T_TRAINING_MAIL_FROM: 'no-reply@notify.teachailab.com',
    T_TRAINING_MAIL_FROM_NAME: 'AI 教师培训中心',
    T_TRAINING_TENCENT_SES_VERIFY_TEMPLATE_ID: '10001',
    T_TRAINING_TENCENT_SES_RESET_TEMPLATE_ID: '10002'
};

const verify = buildTencentSesRequest(env, {
    to: 'Teacher@Example.com',
    subject: '验证您的邮箱｜AI 教师培训中心',
    token,
    templateKind: 'verify'
});
assert.deepEqual(verify.Destination, ['teacher@example.com']);
assert.equal(verify.FromEmailAddress, 'AI 教师培训中心 <no-reply@notify.teachailab.com>');
assert.equal(verify.Template.TemplateID, 10001);
assert.deepEqual(JSON.parse(verify.Template.TemplateData), { token });
assert.equal(verify.TriggerType, 1);
assert.equal(verify.Unsubscribe, '0');

const sent = [];
const fakeClient = { async SendEmail(request) { sent.push(request); return { MessageId: `test-${sent.length}` }; } };
let result = await sendVerificationMail(env, { to: 'teacher@example.com', token }, { sesClient: fakeClient });
assert.equal(result.messageId, 'test-1');
assert.equal(sent[0].Template.TemplateID, 10001);
result = await sendPasswordResetMail(env, { to: 'teacher@example.com', token }, { sesClient: fakeClient });
assert.equal(result.messageId, 'test-2');
assert.equal(sent[1].Template.TemplateID, 10002);

assert.throws(() => buildTencentSesRequest({ ...env, T_TRAINING_TENCENT_SES_VERIFY_TEMPLATE_ID: '' }, {
    to: 'teacher@example.com', subject: 'test', token, templateKind: 'verify'
}), /邮箱验证模板尚未配置/);
assert.throws(() => buildTencentSesRequest(env, {
    to: 'not-an-email', subject: 'test', token, templateKind: 'verify'
}), /收件邮箱格式不正确/);

console.log('腾讯云 SES 邮件构造回归通过：模板、发件人、收件人、触发类型与双模板共 16 项断言。');
