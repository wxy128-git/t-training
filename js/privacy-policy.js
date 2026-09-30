/* Shared consent contract. No content, identity details or browser attributes. */
(function () {
    const VERSION = '2026-09-30.1';
    const RETENTION_DAYS = 180;
    function registration(value) {
        if (value?.accepted !== true || value?.version !== VERSION || (value?.research !== undefined && value?.research !== false)) {
            throw Object.assign(new Error('请阅读并同意当前版本隐私政策'), { statusCode:400, code:'PRIVACY_CONSENT_REQUIRED' });
        }
        return value;
    }
    function update(previous, input, now = new Date().toISOString()) {
        if (input?.version !== VERSION || (input?.research !== undefined && input?.research !== false) || typeof input?.accepted !== 'boolean') {
            throw Object.assign(new Error('隐私政策版本或选择无效，请刷新页面后重试'), {statusCode:400});
        }
        const old = previous || {};
        const accepted = input.accepted ? {version:VERSION, acceptedAt:old.version === VERSION && old.acceptedAt || now} : {version:old.version || '', acceptedAt:old.acceptedAt || ''};
        return {...accepted, research:false, researchVersion:VERSION, researchUpdatedAt:now};
    }
    // Research collection is paused by the site owner's explicit decision.
    function allows() { return false; }
    globalThis.PrivacyPolicy = Object.freeze({VERSION, RETENTION_DAYS, registration, update, allows});
})();
