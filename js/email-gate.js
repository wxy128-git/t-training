/* 邮箱验证门：保留原 UID，发送邮件不等于验证完成。 */
(function () {
    let dialog, ownerUid = '', pendingCheck = null, checkedUid = '', cooldownTimer;
    const pendingKey = uid => `xylaoshiPendingEmail:${uid}`;
    function rememberedEmail(user) {
        try { return sessionStorage.getItem(pendingKey(user.uid)) || user.email || ''; }
        catch { return user.email || ''; }
    }
    function message(text, error = false) {
        const box = dialog.querySelector('#email-gate-message');
        box.textContent = text;
        box.className = error ? 'form-error' : 'email-gate-message';
    }
    function syncButtons() {
        if (!dialog) return;
        const seconds = Math.max(0, Math.ceil(((dialog.sentAt || 0) - Date.now()) / 1000));
        const send = dialog.querySelector('#email-gate-send');
        send.disabled = !!dialog.busy || seconds > 0;
        send.textContent = dialog.busy === 'send' ? '正在发送…' : seconds ? `${seconds} 秒后可重发` : dialog.sentTo ? '重新发送验证邮件' : '发送验证邮件';
        dialog.querySelector('#email-gate-check').disabled = !!dialog.busy;
        dialog.querySelector('#email-gate-check').textContent = dialog.busy === 'check' ? '正在确认…' : '我已验证，继续使用';
    }
    function makeDialog(user) {
        if (dialog) dialog.remove();
        dialog = document.createElement('dialog');
        dialog.className = 'email-gate'; dialog.id = 'email-gate';
        dialog.setAttribute('aria-labelledby', 'email-gate-title');
        dialog.setAttribute('aria-describedby', 'email-gate-intro');
        dialog.innerHTML = `<div class="email-gate-brand"><i class="ph ph-envelope-simple" aria-hidden="true"></i> 账号完善</div>
            <h2 id="email-gate-title">${user.email ? '验证邮箱后继续' : '补全并验证邮箱'}</h2>
            <p id="email-gate-intro">${user.email ? '请验证您能收到邮件的邮箱，用于登录和找回密码。' : '您的旧手机号账号需要绑定邮箱。绑定后，请使用邮箱和原密码登录。'}原有作品和草稿会保留。</p>
            <form id="email-gate-form">
                <label class="form-label" for="email-gate-address">您的邮箱</label>
                <input class="form-input" id="email-gate-address" type="email" inputmode="email" autocomplete="email" maxlength="254" required placeholder="填写您能收到邮件的邮箱">
                <div id="email-gate-password-row" hidden><label class="form-label" for="email-gate-password">再次输入当前登录密码</label><input class="form-input" id="email-gate-password" type="password" autocomplete="current-password" maxlength="128"><p class="auth-email-hint">登录时间较久，需要再次确认是您本人。</p></div>
                <button class="btn-primary" type="submit" id="email-gate-send">发送验证邮件</button>
            </form>
            <p class="email-gate-tip">收到邮件后可直接点击验证链接。链接打不开时无需连接 VPN：长按或右键复制邮件按钮的完整链接，再到本站处理。</p>
            <p id="email-gate-message" class="email-gate-message" role="status" aria-live="polite"></p>
            <a class="email-gate-check" href="/api/email-action" target="_blank" rel="noopener">邮件链接打不开？在本站粘贴处理</a>
            <button type="button" class="email-gate-check" id="email-gate-check">我已验证，继续使用</button>
            <button type="button" class="email-gate-logout" id="email-gate-logout">退出 / 换个账号登录</button>`;
        dialog.querySelector('#email-gate-address').value = rememberedEmail(user);
        dialog.addEventListener('cancel', event => event.preventDefault());
        dialog.addEventListener('keydown', event => {
            if (event.key !== 'Tab') return;
            const controls = [...dialog.querySelectorAll('input, button')].filter(el => !el.disabled && el.getClientRects().length);
            const first = controls[0], last = controls.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        });
        dialog.querySelector('form').addEventListener('submit', event => { event.preventDefault(); sendAccountVerification(); });
        dialog.querySelector('#email-gate-check').addEventListener('click', () => checkAccountEmail(true));
        dialog.querySelector('#email-gate-logout').addEventListener('click', async () => {
            const email = dialog.querySelector('#email-gate-address').value.trim();
            const button = dialog.querySelector('#email-gate-logout'); button.disabled = true;
            try {
                await Auth.logout(); syncEmailGate(); showAuthModal('login');
                document.getElementById('li-email').value = email;
            } catch { message('退出未完成，请稍后重试。', true); button.disabled = false; }
        });
        document.body.appendChild(dialog);
        ownerUid = user.uid;
    }
    function syncEmailGate() {
        const user = Auth.getCurrentUser();
        if (!user || Auth.canUseFeatures()) {
            clearInterval(cooldownTimer);
            if (dialog?.open) dialog.close();
            if (!user) { ownerUid = ''; checkedUid = ''; }
            else { try { sessionStorage.removeItem(pendingKey(user.uid)); } catch {} }
            return;
        }
        if (!dialog || ownerUid !== user.uid) makeDialog(user);
        if (!dialog.open) {
            dialog.showModal();
            clearInterval(cooldownTimer);
            cooldownTimer = setInterval(syncButtons, 1000);
        }
        syncButtons();
    }
    async function sendAccountVerification() {
        syncEmailGate();
        const user = Auth.getCurrentUser();
        if (!user || Auth.canUseFeatures() || dialog.busy || (dialog.sentAt || 0) > Date.now()) return;
        const email = AccountPolicy.realEmail(dialog.querySelector('#email-gate-address').value);
        if (!email) { message('请填写能够接收邮件的有效邮箱，不能使用手机号。', true); return; }
        const passwordInput = dialog.querySelector('#email-gate-password');
        const password = dialog.querySelector('#email-gate-password-row').hidden ? '' : passwordInput.value;
        dialog.busy = 'send'; syncButtons(); message('正在发送验证邮件，请稍候…');
        try {
            const result = await callAuthProxy('verify-email', { idToken: await Auth.getIdToken(), email, password }, { expectedUid: user.uid });
            if (Auth.getCurrentUser()?.uid !== user.uid) return;
            passwordInput.value = '';
            if (result.alreadyVerified) { syncEmailGate(); return; }
            dialog.sentTo = result.sentTo; dialog.sentAt = Date.now() + (result.retryAfter || 60) * 1000;
            try { sessionStorage.setItem(pendingKey(user.uid), result.sentTo); } catch {}
            message(`验证邮件已发送至 ${result.sentTo}。如果邮件按钮打不开，请复制按钮链接并使用下方“在本站粘贴处理”。`);
        } catch (error) {
            if (Auth.getCurrentUser()?.uid !== user.uid) return;
            if (error.retryAfter) dialog.sentAt = Date.now() + error.retryAfter * 1000;
            if (error.reauthRequired) { dialog.querySelector('#email-gate-password-row').hidden = false; passwordInput.focus(); }
            message(error.message || '发送未成功，请稍后重试。', true);
        } finally {
            if (ownerUid === user.uid) { dialog.busy = ''; syncButtons(); }
        }
    }
    async function checkAccountEmail(manual = false) {
        const user = Auth.getCurrentUser();
        if (!user || (pendingCheck && pendingCheck.uid === user.uid)) return;
        if (dialog?.busy) return;
        const run = { uid: user.uid }; pendingCheck = run;
        if (dialog?.open) { dialog.busy = 'check'; syncButtons(); }
        try {
            const result = await callAuthProxy('email-status', { idToken: await Auth.getIdToken() }, { expectedUid: user.uid });
            if (Auth.getCurrentUser()?.uid !== user.uid || result.stale) return;
            checkedUid = user.uid;
            if (AccountPolicy.hasVerifiedEmail(result.user)) {
                // 刷新代理与 SDK 的旧声明，让直接 Firestore 请求也携带已验证状态。
                if ((manual || !AccountPolicy.hasVerifiedEmail(user)) && getStoredProxyAuthSession({ allowExpired: true })) {
                    const refreshed = await refreshProxyAuthSession().catch(() => null);
                    if (Auth.getCurrentUser()?.uid !== user.uid) return;
                    if (!refreshed) {
                        await Auth.logout(); syncEmailGate(); showAuthModal('login');
                        document.getElementById('li-email').value = result.user.email;
                        showToast('邮箱已验证，请用邮箱和原密码重新登录');
                        return;
                    }
                }
                if (auth.currentUser?.uid === user.uid) {
                    const sdkUser = auth.currentUser;
                    sdkUser.reload().then(() => sdkUser.getIdToken(true)).catch(() => {});
                }
                syncEmailGate(); refreshAuthUI();
                document.dispatchEvent(new CustomEvent('authRefresh', { detail: Auth.getCurrentUser() }));
                if (manual) showToast('邮箱已验证，可以继续使用');
            } else if (AccountPolicy.isAdmin(result.user)) {
                syncEmailGate(); refreshAuthUI();
                document.dispatchEvent(new CustomEvent('authRefresh', { detail: Auth.getCurrentUser() }));
            } else if (manual) message('暂未确认邮箱验证成功。请点击邮件里的链接，再回来确认；失效链接可以重新发送。', true);
        } catch (error) {
            if (Auth.getCurrentUser()?.uid !== user.uid) return;
            if (manual && dialog?.open) message(error.status === 401 ? '登录状态已过期。如果已完成绑定，请退出后用新邮箱和原密码登录。' : (error.message || '暂时无法确认，请稍后重试。'), true);
        } finally {
            if (pendingCheck === run) pendingCheck = null;
            if (ownerUid === user.uid && dialog) { dialog.busy = ''; syncButtons(); }
            syncEmailGate();
        }
    }
    function onChange() {
        syncEmailGate();
        const user = Auth.getCurrentUser();
        if (user && Auth.canUseFeatures() && checkedUid !== user.uid) checkAccountEmail();
    }
    window.syncEmailGate = syncEmailGate;
    window.sendAccountVerification = sendAccountVerification;
    document.addEventListener('authChanged', onChange);
    document.addEventListener('authRefresh', onChange);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && dialog?.open) checkAccountEmail(); });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onChange, { once: true });
    else onChange();
})();
