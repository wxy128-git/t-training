/* Independent aggregate operations channel; the research tracker stays paused. */
(function (root) {
    let status;
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
                headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'operations-track',counter}),
                signal:AbortSignal.timeout(5000),keepalive:true});
            return response.ok ? await response.json() : {recorded:false};
        } catch { return {recorded:false}; }
    }
    root.OperationsAnalytics = Object.freeze({track});
    let viewed=false;
    const pageView=()=>{
        if(viewed || document.visibilityState === 'hidden') return;
        viewed=true; void track('page_view',{path:location.pathname});
    };
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',pageView,{once:true});
    else pageView();
    document.addEventListener('visibilitychange',pageView);
})(globalThis);
