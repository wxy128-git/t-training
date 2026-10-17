/* Independent aggregate operations channel; the research tracker stays paused. */
(function (root) {
    let status;
    const P=root.OperationsPolicy, storageKey='tt_operations_source', maxAge=30*60*1000;
    let attribution,expiresAt=0,entryConsumed=false;
    function detectSource() {
        try {
            const entry=new URL(root.location.href);
            const marked=entry.searchParams.get('utm_source')?.toLowerCase();
            // Only fixed public channel names; never transmit arbitrary campaign values or URLs.
            const aliases={weixin:'wechat',wx:'wechat',weibo:'weibo',baidu:'baidu',bing:'bing',google:'google',wechat:'wechat',qq:'qq',douyin:'douyin',xiaohongshu:'xiaohongshu',bilibili:'bilibili',zhihu:'zhihu',share:'share'};
            if(marked && Object.hasOwn(aliases,marked))return {source:aliases[marked],external:true};
            if(!document.referrer)return {source:'direct',external:false};
            const ref=new URL(document.referrer);
            if(!['https:','http:'].includes(ref.protocol))return {source:'unknown',external:false};
            if(ref.origin===entry.origin)return {source:'unknown',external:false};
            const host=ref.hostname.toLowerCase();
            const rules={baidu:['baidu.com'],bing:['bing.com'],google:['google.com','google.com.hk','google.cn'],search:['sogou.com','so.com','sm.cn','duckduckgo.com','search.yahoo.com'],wechat:['weixin.qq.com','wechat.com'],qq:['qq.com'],weibo:['weibo.com','weibo.cn'],douyin:['douyin.com'],xiaohongshu:['xiaohongshu.com','xhslink.com'],bilibili:['bilibili.com','b23.tv'],zhihu:['zhihu.com']};
            for(const [channel,domains] of Object.entries(rules))if(domains.some(d=>host===d||host.endsWith('.'+d)))return {source:channel,external:true};
            return {source:'referral',external:true};
        } catch { return {source:'unknown',external:false}; }
    }
    function source() {
        const now=Date.now();
        if(attribution&&now<expiresAt)return attribution;
        const detected=entryConsumed?{source:'unknown',external:false}:detectSource();
        entryConsumed=true;
        try {
            const old=JSON.parse(root.sessionStorage.getItem(storageKey)||'null');
            if(!detected.external && old && P.source(old.source)===old.source && Number.isFinite(old.at) && now>=old.at && now-old.at<maxAge){attribution=old.source;expiresAt=old.at+maxAge;}
            else {
                attribution=detected.source;
                expiresAt=now+maxAge;
                root.sessionStorage.setItem(storageKey,JSON.stringify({source:attribution,at:now}));
            }
        } catch { attribution=detected.source;expiresAt=now+maxAge; }
        return attribution;
    }
    const headers=()=>({'X-Operations-Source':source()});
    function enabled() {
        return status ||= fetch('/api/analytics', {method:'POST',credentials:'omit',referrerPolicy:'no-referrer',
            headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'operations-status'}),
            signal:AbortSignal.timeout(5000)}).then(r=>r.ok?r.json():null).then(d=>d?.enabled===true).catch(()=>false);
    }
    async function track(action, data = {}) {
        let counter;
        try { counter = root.OperationsPolicy.normalize({...data,action}); } catch { return {recorded:false}; }
        if (!await enabled()) return {recorded:false};
        try {
            const response = await fetch('/api/analytics', {method:'POST',credentials:'omit',referrerPolicy:'no-referrer',
                headers:{'Content-Type':'application/json',...headers()},body:JSON.stringify({action:'operations-track',counter}),
                signal:AbortSignal.timeout(5000),keepalive:true});
            return response.ok ? await response.json() : {recorded:false};
        } catch { return {recorded:false}; }
    }
    root.OperationsAnalytics = Object.freeze({track,headers});
    let viewed=false;
    const pageView=()=>{
        if(viewed || document.visibilityState === 'hidden') return;
        viewed=true; void track('page_view',{path:location.pathname});
    };
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',pageView,{once:true});
    else pageView();
    document.addEventListener('visibilitychange',pageView);
})(globalThis);
