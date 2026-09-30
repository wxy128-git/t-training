/* Consent choices are read from the server, never trusted from browser storage. */
(function () {
    let state=null, uid='', revision=0, pending=null;
    let dialogRevision=0, dialogUid='', saving=false;
    async function api(action, choice) {
        const requestUid=window.SiteAuth?.getCurrentUser?.()?.uid;
        const controller=new AbortController();
        let timer;
        try {
            return await Promise.race([
                (async()=>{
                    const idToken=await window.SiteAuth?.getIdToken?.();
                    if(controller.signal.aborted) throw new Error('请求超时，请重试');
                    if(!idToken || !requestUid || requestUid!==window.SiteAuth?.getCurrentUser?.()?.uid) throw new Error('登录状态已变化，请重新打开后确认');
                    const response=await fetch('/api/privacy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,idToken,choice}),cache:'no-store',signal:controller.signal});
                    const data=await response.json();
                    if(!response.ok || !data.ok) throw new Error(data.msg || '暂时无法保存，请稍后重试');
                    if(action==='save' && (data.privacy?.version!==PrivacyPolicy.VERSION || !data.privacy?.acceptedAt)) throw new Error('未收到确认记录，请重试');
                    return data.privacy;
                })(),
                new Promise((_,reject)=>{timer=setTimeout(()=>{reject(new Error('请求超时，请重试；如已保存，重新打开即可查看确认记录。'));controller.abort();},12000);})
            ]);
        } finally {clearTimeout(timer);}
    }
    function clearIds() {
        try {localStorage.removeItem('xylaoshiAnalyticsVisitor');sessionStorage.removeItem('xylaoshiAnalyticsSession');} catch {}
    }
    async function refresh() {
        const current=window.SiteAuth?.getCurrentUser?.()?.uid || '';
        const dialog=document.getElementById('privacy-dialog');
        // A same-account refresh must not invalidate the dialog's own request.
        if(dialog?.open && current===dialogUid)return;
        if(dialog?.open && current!==dialogUid)dialog.close();
        const turn=++revision;
        if(uid!==current || !current) clearIds();
        uid=current;state=null;
        if(!uid) {renderNotice();return;}
        try {const result=await api('get');if(turn===revision) state=result;} catch {}
        if(turn===revision) {if(!PrivacyPolicy.allows(state))clearIds();renderNotice();}
    }
    function renderNotice() {
        let notice=document.getElementById('privacy-notice');
        if(!uid || state?.version===PrivacyPolicy.VERSION && state?.acceptedAt) {notice?.remove();return;}
        if(!notice) {
            notice=document.createElement('aside');notice.id='privacy-notice';notice.className='privacy-notice';
            notice.innerHTML='<p>请阅读并确认新版隐私政策，了解账号和教学服务如何处理信息。</p><button class="btn-primary" type="button">查看政策</button><button class="btn-login" type="button" data-later>稍后</button>';
            notice.querySelector('.btn-primary').onclick=open;
            notice.querySelector('[data-later]').onclick=()=>notice.remove();
            document.body.appendChild(notice);
        }
    }
    async function allowed() {
        if(!window.SiteAuth?.getCurrentUser?.()?.uid) return false;
        if(pending) await pending;
        return uid===window.SiteAuth?.getCurrentUser?.()?.uid && PrivacyPolicy.allows(state);
    }
    async function open() {
        if(!window.SiteAuth?.getCurrentUser?.()) {window.showAuthModal?.('login');return;}
        let dialog=document.getElementById('privacy-dialog');
        if(!dialog) {
            dialog=document.createElement('dialog');dialog.id='privacy-dialog';dialog.className='privacy-dialog';dialog.setAttribute('aria-labelledby','privacy-dialog-title');
            dialog.innerHTML='<h2 id="privacy-dialog-title">隐私政策确认</h2><p>这里记录您已阅读并同意的政策版本和确认时间。</p><p><a href="/privacy" target="_blank" rel="noopener">阅读隐私政策（新窗口）</a></p><label class="privacy-choice"><input type="checkbox" id="privacy-accept"><span>我已阅读并同意当前隐私政策</span></label><p id="privacy-record"></p><p id="privacy-message" role="status" aria-live="polite"></p><div class="privacy-actions"><button class="btn-primary" type="button" id="privacy-save">确认政策</button><button class="btn-login" type="button" id="privacy-close">关闭</button></div>';
            dialog.querySelector('#privacy-close').onclick=()=>dialog.close();
            dialog.querySelector('#privacy-save').onclick=save;
            dialog.addEventListener('close',()=>{++dialogRevision;dialogUid='';saving=false;});
            document.body.appendChild(dialog);
        }
        if(dialog.open)return;
        dialogUid=window.SiteAuth.getCurrentUser()?.uid;
        const openingRevision=++dialogRevision;++revision;
        saving=false;
        dialog.showModal();
        const saveButton=dialog.querySelector('#privacy-save');saveButton.disabled=true;saveButton.textContent='正在读取…';
        dialog.querySelector('#privacy-accept').disabled=false;
        dialog.querySelector('#privacy-accept').checked=false;
        dialog.querySelector('#privacy-record').textContent='';
        dialog.querySelector('#privacy-message').textContent='正在读取您的选择…';
        const openingUid=window.SiteAuth.getCurrentUser()?.uid;
        try {
            const result=await api('get');
            if(openingRevision!==dialogRevision || !dialog.open)return;
            if(openingUid!==window.SiteAuth.getCurrentUser()?.uid){dialog.close();return;}
            uid=openingUid;state=result;
            dialog.querySelector('#privacy-accept').checked=state?.version===PrivacyPolicy.VERSION && !!state.acceptedAt;
            dialog.querySelector('#privacy-record').textContent=state?.acceptedAt ? `已确认版本：${state.version}；时间：${new Date(state.acceptedAt).toLocaleString('zh-CN')}`:'尚未记录政策同意。';
            dialog.querySelector('#privacy-message').textContent='关闭窗口不会改变您的选择。';saveButton.disabled=false;
        } catch(error){if(openingRevision===dialogRevision && dialog.open)dialog.querySelector('#privacy-message').textContent=error.message;}
        finally {if(openingRevision===dialogRevision && dialog.open){saveButton.disabled=false;saveButton.textContent='确认政策';}}
    }
    async function save() {
        const dialog=document.getElementById('privacy-dialog');
        if(!dialog?.open || saving)return;
        const message=dialog.querySelector('#privacy-message');
        const button=dialog.querySelector('#privacy-save');
        const checkbox=dialog.querySelector('#privacy-accept');
        if(!checkbox.checked){message.textContent='请先阅读并勾选隐私政策';return;}
        const savingUid=window.SiteAuth?.getCurrentUser?.()?.uid;
        const turn=++dialogRevision;++revision;
        saving=true;button.disabled=true;checkbox.disabled=true;
        button.textContent='正在保存…';message.textContent='正在保存您的确认，请稍候…';
        state=null;clearIds();
        try {
            const result=await api('save',{accepted:true,version:PrivacyPolicy.VERSION});
            if(turn!==dialogRevision || !dialog.open)return;
            if(savingUid!==window.SiteAuth?.getCurrentUser?.()?.uid){dialog.close();return;}
            state=result;uid=savingUid;
            renderNotice();dialog.close();
            window.showToast?.('已确认隐私政策');
        } catch(error) {
            if(turn===dialogRevision && dialog.open)message.textContent=error.message;
        } finally {
            if(turn===dialogRevision && dialog.open){saving=false;button.disabled=false;checkbox.disabled=false;button.textContent='确认政策';}
        }
    }
    function sync(){pending=refresh();}
    window.PrivacyUI={open,allowed,refresh:sync};
    document.addEventListener('authChanged',sync);document.addEventListener('authRefresh',sync);
    window.addEventListener('pageshow',sync);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')sync();});
    if(typeof window.onAuthReady==='function') window.onAuthReady(sync);
})();
