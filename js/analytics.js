/* Research collection is paused. Keep the public call surface for existing pages. */
(function () {
    try { localStorage.removeItem('xylaoshiAnalyticsVisitor'); } catch {}
    try { sessionStorage.removeItem('xylaoshiAnalyticsSession'); } catch {}
    window.Analytics = Object.freeze({
        async track() { return {recorded:false, reason:'research_paused'}; }
    });
})();
