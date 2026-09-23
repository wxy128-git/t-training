import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import tencentcloudSes from 'tencentcloud-sdk-nodejs-ses';

const transporters = new Map();
const sesClients = new Map();
const SesClient = tencentcloudSes.ses.v20201002.Client;

function mailError(message, code = 'LOCAL_MAIL_NOT_CONFIGURED', statusCode = 501) {
    const error = new Error(message); error.code = code; error.statusCode = statusCode; return error;
}

function publicOrigin(env) {
    const value = String(env.PUBLIC_ORIGIN || 'https://ai.teachailab.com').trim().replace(/\/+$/, '');
    return /^https:\/\//i.test(value) || /^http:\/\/127\.0\.0\.1(?::\d+)?$/i.test(value) ? value : 'https://ai.teachailab.com';
}

function transporter(env) {
    if (env.T_TRAINING_EMAIL_TRANSPORT === 'json') return nodemailer.createTransport({ jsonTransport: true });
    const host = String(env.T_TRAINING_SMTP_HOST || '').trim();
    const port = Number(env.T_TRAINING_SMTP_PORT || 465);
    const user = String(env.T_TRAINING_SMTP_USER || '').trim();
    const pass = String(env.T_TRAINING_SMTP_PASSWORD || '');
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !user || !pass) {
        throw mailError('邮件发送服务尚未配置，请联系网站管理员');
    }
    const secure = String(env.T_TRAINING_SMTP_SECURE || (port === 465 ? 'true' : 'false')).toLowerCase() === 'true';
    const key = crypto.createHash('sha256').update(`${host}\0${port}\0${secure}\0${user}\0${pass}`).digest('hex');
    if (!transporters.has(key)) {
        transporters.set(key, nodemailer.createTransport({
            host, port, secure,
            auth: { user, pass },
            connectionTimeout: 8000,
            greetingTimeout: 8000,
            socketTimeout: 15000,
            pool: true,
            maxConnections: 3,
            maxMessages: 50
        }));
    }
    return transporters.get(key);
}

function sender(env) {
    const address = String(env.T_TRAINING_MAIL_FROM || env.T_TRAINING_SMTP_USER || '').trim();
    if (!address || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw mailError('邮件发件地址尚未配置');
    const name = String(env.T_TRAINING_MAIL_FROM_NAME || 'AI 教师培训中心').replace(/[\r\n":]/g, '').trim().slice(0, 80);
    return { name, address };
}

function positiveInteger(value, label) {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) throw mailError(`${label}尚未配置`);
    return parsed;
}

function tencentSesClient(env) {
    const secretId = String(env.T_TRAINING_TENCENT_SECRET_ID || '').trim();
    const secretKey = String(env.T_TRAINING_TENCENT_SECRET_KEY || '').trim();
    const region = String(env.T_TRAINING_TENCENT_SES_REGION || 'ap-guangzhou').trim();
    if (!secretId || !secretKey) throw mailError('腾讯云邮件 API 身份尚未配置');
    if (!new Set(['ap-guangzhou', 'ap-hongkong']).has(region)) throw mailError('腾讯云邮件地域配置不正确');
    const key = crypto.createHash('sha256').update(`${secretId}\0${secretKey}\0${region}`).digest('hex');
    if (!sesClients.has(key)) {
        sesClients.set(key, new SesClient({
            credential: { secretId, secretKey },
            region,
            profile: {
                signMethod: 'TC3-HMAC-SHA256',
                httpProfile: { reqMethod: 'POST', reqTimeout: 15, endpoint: 'ses.tencentcloudapi.com' }
            }
        }));
    }
    return sesClients.get(key);
}

export function buildTencentSesRequest(env, { to, subject, token, templateKind }) {
    const recipient = String(to || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) throw mailError('收件邮箱格式不正确', 'INVALID_EMAIL', 400);
    if (!/^[A-Za-z0-9_-]{40,128}$/.test(String(token || ''))) throw mailError('邮件操作令牌格式不正确', 'INVALID_MAIL_TOKEN', 500);
    const templateIds = {
        verify: env.T_TRAINING_TENCENT_SES_VERIFY_TEMPLATE_ID,
        reset: env.T_TRAINING_TENCENT_SES_RESET_TEMPLATE_ID
    };
    if (!Object.hasOwn(templateIds, templateKind)) throw mailError('邮件模板类型不正确', 'INVALID_MAIL_TEMPLATE', 500);
    const from = sender(env);
    return {
        FromEmailAddress: from.name ? `${from.name} <${from.address}>` : from.address,
        Destination: [recipient],
        Subject: String(subject || '').replace(/[\r\n]/g, '').trim().slice(0, 200),
        Template: {
            TemplateID: positiveInteger(templateIds[templateKind], templateKind === 'verify' ? '邮箱验证模板' : '密码重置模板'),
            TemplateData: JSON.stringify({ token: String(token) })
        },
        Unsubscribe: '0',
        TriggerType: 1
    };
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function mailHtml({ heading, intro, actionLabel, actionUrl, expiresText }) {
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"></head><body style="margin:0;background:#f3f6f8;color:#3d4a57;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif"><div style="max-width:560px;margin:0 auto;padding:32px 18px"><div style="background:#fff;border:1px solid #d7e0e6;border-radius:14px;padding:30px"><div style="font-size:14px;font-weight:700;color:#17212b;margin-bottom:22px">AI 教师培训中心</div><h1 style="font-size:26px;line-height:1.35;color:#17212b;margin:0 0 14px">${escapeHtml(heading)}</h1><p style="font-size:15px;line-height:1.8;margin:0 0 22px">${escapeHtml(intro)}</p><p style="margin:0 0 22px"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#245b78;color:#fff;text-decoration:none;font-weight:700">${escapeHtml(actionLabel)}</a></p><p style="font-size:13px;line-height:1.7;color:#667482;margin:0">${escapeHtml(expiresText)} 如果这不是您本人操作，请忽略此邮件。</p><p style="font-size:12px;line-height:1.7;color:#7c8994;word-break:break-all;margin:18px 0 0">按钮无法点击时，请复制此地址到浏览器：<br>${escapeHtml(actionUrl)}</p></div></div></body></html>`;
}

async function sendTencentSes(env, message, options = {}) {
    const request = buildTencentSesRequest(env, message);
    try {
        const result = await (options.sesClient || tencentSesClient(env)).SendEmail(request);
        return { messageId: String(result?.MessageId || ''), accepted: 1 };
    } catch (error) {
        const providerCode = String(error?.code || error?.name || 'UNKNOWN').slice(0, 120);
        console.error(`[local-mailer] Tencent SES send failed: ${providerCode}`);
        throw mailError('邮件暂时未能发送，请稍后再试', 'LOCAL_MAIL_SEND_FAILED', 502);
    }
}

async function send(env, { to, subject, text, html, token, templateKind }, options = {}) {
    if (env.T_TRAINING_EMAIL_TRANSPORT === 'tencent-ses') {
        return sendTencentSes(env, { to, subject, token, templateKind }, options);
    }
    const result = await transporter(env).sendMail({ from: sender(env), to, subject, text, html });
    return { messageId: result.messageId || '', accepted: Array.isArray(result.accepted) ? result.accepted.length : 1 };
}

export async function sendVerificationMail(env, { to, token }, options = {}) {
    const url = `${publicOrigin(env)}/api/email-action?mode=localVerifyEmail&token=${encodeURIComponent(token)}`;
    return send(env, {
        to,
        subject: '验证您的邮箱｜AI 教师培训中心',
        token,
        templateKind: 'verify',
        text: `请在 30 分钟内打开以下链接完成邮箱验证：\n${url}\n\n如果这不是您本人操作，请忽略此邮件。`,
        html: mailHtml({ heading: '验证您的邮箱', intro: '完成验证后，您就可以继续使用智能体、备课本和其他网站功能。', actionLabel: '验证邮箱', actionUrl: url, expiresText: '此链接 30 分钟内有效，且只能使用一次。' })
    }, options);
}

export async function sendPasswordResetMail(env, { to, token }, options = {}) {
    const url = `${publicOrigin(env)}/api/email-action?mode=localResetPassword&token=${encodeURIComponent(token)}`;
    return send(env, {
        to,
        subject: '重置登录密码｜AI 教师培训中心',
        token,
        templateKind: 'reset',
        text: `请在 30 分钟内打开以下链接设置新密码：\n${url}\n\n如果这不是您本人操作，请忽略此邮件。`,
        html: mailHtml({ heading: '重置登录密码', intro: '请打开下面的链接设置新密码。修改成功后，其他设备上的旧登录会话将失效。', actionLabel: '设置新密码', actionUrl: url, expiresText: '此链接 30 分钟内有效，且只能使用一次。' })
    }, options);
}
