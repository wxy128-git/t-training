const HEADERS = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
    'Pragma': 'no-cache',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'none'; connect-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
};

export function parseEmailActionLink(raw) {
    let candidate;
    try { candidate = new URL(String(raw || '').trim()); }
    catch { throw new Error('请粘贴以 https:// 开头的完整邮件链接。'); }
    const allowedHosts = new Set(['xylaoshi-28f6c.firebaseapp.com', 'xylaoshi-28f6c.web.app', 'ai.teachailab.com']);
    const allowedModes = new Set(['verifyEmail', 'verifyAndChangeEmail', 'recoverEmail', 'resetPassword']);
    for (let depth = 0; depth < 3; depth++) {
        const mode = candidate.searchParams.get('mode') || '';
        const oobCode = candidate.searchParams.get('oobCode') || '';
        if (candidate.protocol === 'https:' && allowedHosts.has(candidate.hostname) && allowedModes.has(mode) && /^[A-Za-z0-9_-]{10,2048}$/.test(oobCode)) {
            return { mode, oobCode };
        }
        const nested = ['link', 'url', 'target', 'redirect', 'q']
            .map(key => candidate.searchParams.get(key))
            .find(Boolean);
        if (!nested) break;
        try { candidate = new URL(nested); }
        catch { break; }
    }
    throw new Error('没有识别到本站账号的有效邮箱操作链接，请复制邮件按钮本身的完整链接。');
}

const PAGE = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="no-referrer">
<meta name="theme-color" content="#17212b">
<title>处理邮箱验证 · AI 教师培训中心</title>
<style>
*{box-sizing:border-box}html{color-scheme:light}body{min-height:100vh;margin:0;display:grid;place-items:center;padding:24px;background:#f3f6f8;color:#3d4a57;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}.card{width:min(100%,560px);padding:clamp(28px,6vw,46px);border:1px solid #d7e0e6;border-radius:16px;background:#fff;box-shadow:0 16px 46px -34px rgba(23,33,43,.55)}.brand{display:flex;align-items:center;gap:10px;margin-bottom:28px;color:#17212b;font-size:14px;font-weight:750}.mark{display:grid;place-items:center;width:32px;height:32px;border-radius:8px;background:#b64235;color:#fff;font-size:17px}h1{margin:0 0 12px;color:#17212b;font-size:clamp(26px,7vw,36px);line-height:1.2}p{margin:0;color:#53616e;font-size:15px;line-height:1.75}.state{display:flex;align-items:center;gap:10px;margin:22px 0 0;padding:14px 16px;border-left:3px solid #245b78;background:#e7f0f5;color:#24313d;font-size:14px;line-height:1.65}.dot{width:9px;height:9px;flex:0 0 auto;border-radius:50%;background:#245b78;box-shadow:0 0 0 4px rgba(36,91,120,.12)}.state.success{border-color:#287a68;background:#e7f3ef}.state.success .dot{background:#287a68}.state.error{border-color:#b64235;background:#f8ece9}.state.error .dot{background:#b64235}.form{display:grid;gap:14px;margin-top:22px}.field{display:grid;gap:7px}.field label{color:#24313d;font-size:14px;font-weight:700}.field input{width:100%;min-height:46px;padding:0 13px;border:1px solid #bdcbd4;border-radius:8px;background:#fff;color:#17212b;font:inherit}.field input:focus{outline:3px solid rgba(36,91,120,.18);border-color:#245b78}.hint{font-size:13px;color:#667482}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:24px}.button{min-height:44px;display:inline-flex;align-items:center;justify-content:center;padding:0 18px;border:1px solid #245b78;border-radius:8px;background:#245b78;color:#fff;font:inherit;font-size:14px;font-weight:750;text-decoration:none;cursor:pointer}.button.secondary{border-color:#bdcbd4;background:#fff;color:#17212b}.button:disabled{opacity:.6;cursor:wait}.button:focus-visible{outline:3px solid rgba(36,91,120,.28);outline-offset:3px}[hidden]{display:none!important}@media(max-width:520px){body{padding:16px}.card{padding:28px 22px}.actions{display:grid}.button{width:100%}}
</style>
</head>
<body>
<main class="card">
<div class="brand"><span class="mark" aria-hidden="true">教</span><span>AI 教师培训中心</span></div>
<h1 id="title">正在确认链接</h1>
<p id="description">请稍候，系统正在通过本站安全完成操作。</p>
<div class="state" id="state" role="status" aria-live="polite"><span class="dot" aria-hidden="true"></span><span id="state-text">正在处理，请不要关闭页面…</span></div>
<form class="form" id="password-form" hidden>
<div class="field"><label for="new-password">设置新密码</label><input id="new-password" type="password" minlength="6" maxlength="256" autocomplete="new-password" required><span class="hint">至少 6 位，请不要使用容易猜到的密码。</span></div>
<div class="field"><label for="confirm-password">再次输入新密码</label><input id="confirm-password" type="password" minlength="6" maxlength="256" autocomplete="new-password" required></div>
<button class="button" id="submit-password" type="submit">确认修改密码</button>
</form>
<form class="form" id="link-form" hidden>
<div class="field"><label for="email-link">粘贴邮件里的完整链接</label><input id="email-link" type="url" inputmode="url" autocomplete="off" maxlength="4096" required placeholder="https://xylaoshi-28f6c.firebaseapp.com/…"><span class="hint">在邮件按钮上长按或右键复制链接，不需要先打开它。本站只读取其中的一次性验证码。</span></div>
<button class="button" id="submit-link" type="submit">在本站完成操作</button>
</form>
<div class="actions" id="actions" hidden><a class="button" id="continue-link" href="/">返回网站</a><a class="button secondary" href="/">返回首页</a></div>
</main>
<script>
(()=>{
const params=new URLSearchParams(location.search);let mode=params.get('mode')||'';let oobCode=params.get('oobCode')||'';let token=params.get('token')||'';const rawContinue=params.get('continueUrl')||'';const title=document.getElementById('title');const description=document.getElementById('description');const state=document.getElementById('state');const stateText=document.getElementById('state-text');const form=document.getElementById('password-form');const linkForm=document.getElementById('link-form');const linkInput=document.getElementById('email-link');const actions=document.getElementById('actions');const continueLink=document.getElementById('continue-link');let continueUrl='/';
try{const candidate=new URL(rawContinue,location.origin);if(candidate.origin===location.origin&&!candidate.pathname.startsWith('/api/email-action'))continueUrl=candidate.pathname+candidate.search+candidate.hash}catch{}
continueLink.href=continueUrl;history.replaceState({},'',location.pathname+(mode?'?mode='+encodeURIComponent(mode):''));
const labels={verifyEmail:['验证邮箱','邮箱验证成功'],verifyAndChangeEmail:['确认新邮箱','新邮箱验证成功'],recoverEmail:['恢复邮箱','邮箱地址已恢复'],resetPassword:['重置密码','密码已更新'],localVerifyEmail:['验证邮箱','邮箱验证成功'],localResetPassword:['重置密码','密码已更新']};
if(labels[mode])title.textContent=labels[mode][0];
function setState(kind,message){state.className='state'+(kind?' '+kind:'');stateText.textContent=message}
function showActions(){actions.hidden=false}
function showError(message){title.textContent='链接未能完成';description.textContent='请返回网站重新发送邮件，或稍后再试。';setState('error',message||'验证链接无效或已经过期。');form.hidden=true;linkForm.hidden=true;showActions()}
function showPasteForm(){title.textContent='在本站完成邮箱操作';description.textContent='邮件里的验证或重置按钮打不开时，把按钮链接复制到这里即可，不需要连接 VPN。';setState('','请复制邮件按钮的完整链接并粘贴到下方。');linkForm.hidden=false;actions.hidden=false;linkInput.focus()}
const readActionLink=${parseEmailActionLink.toString()};
async function complete(newPassword){
 const local=mode==='localVerifyEmail'||mode==='localResetPassword';
 const response=await fetch('/api/auth-proxy',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',cache:'no-store',body:JSON.stringify({action:local?'complete-local-email-action':'complete-email-action',mode,...(local?{token}:{oobCode}),...(newPassword?{newPassword}:{})})});
 const data=await response.json().catch(()=>({}));if(!response.ok||!data.ok)throw new Error(data.msg||'暂时无法完成操作，请稍后重试');return data;
}
async function start(){
 if(!mode&&!oobCode&&!token){showPasteForm();return}
 const local=mode==='localVerifyEmail'||mode==='localResetPassword';
 if(!labels[mode]||(local?!/^[A-Za-z0-9_-]{40,128}$/.test(token):!oobCode)){showError('验证链接不完整，请重新发送邮件。');return}
 try{
  const data=await complete();
  if((mode==='resetPassword'||mode==='localResetPassword')&&data.needsPassword){description.textContent=data.email?'正在为 '+data.email+' 设置新密码。':'请输入新的登录密码。';setState('',data.msg);form.hidden=false;document.getElementById('new-password').focus();return}
  title.textContent=labels[mode][1];description.textContent=data.email?'已完成 '+data.email+' 的操作。':'操作已经完成。';setState('success',data.msg);showActions();
 }catch(error){showError(error.message)}
}
linkForm.addEventListener('submit',event=>{event.preventDefault();try{const parsed=readActionLink(linkInput.value);mode=parsed.mode;oobCode=parsed.oobCode;token='';linkInput.value='';linkForm.hidden=true;actions.hidden=true;title.textContent=labels[mode][0];description.textContent='请稍候，系统正在通过本站安全完成操作。';setState('','正在处理，请不要关闭页面…');history.replaceState({},'',location.pathname+'?mode='+encodeURIComponent(mode));start()}catch(error){setState('error',error.message)}});
form.addEventListener('submit',async event=>{event.preventDefault();const password=document.getElementById('new-password').value;const confirmation=document.getElementById('confirm-password').value;if(password.length<6){setState('error','新密码至少需要 6 位。');return}if(password!==confirmation){setState('error','两次输入的密码不一致。');return}const submit=document.getElementById('submit-password');submit.disabled=true;setState('','正在更新密码…');try{const data=await complete(password);form.hidden=true;title.textContent=labels[mode][1];description.textContent=data.email?'账号 '+data.email+' 已可使用新密码登录。':'现在可以使用新密码登录。';setState('success',data.msg);showActions()}catch(error){setState('error',error.message);submit.disabled=false}});
start();
})();
</script>
</body>
</html>`;

export async function onRequestGet() {
    return new Response(PAGE, { status: 200, headers: HEADERS });
}
