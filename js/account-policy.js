/* 浏览器与 API 共用；验证状态必须来自 Firebase Auth，不能来自个人资料。 */
(function (root) {
    // 既有 Firebase 管理员账号的不可变 UID；绑定邮箱不能转移管理权限。
    const ADMIN_UID = 'MCUSTieySYczODKB9hkERtyvtZG2';
    function realEmail(value) {
        const email = String(value || '').trim().toLowerCase();
        return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
            && !/@xylaoshi\.tel$/.test(email) ? email : '';
    }
    function hasVerifiedEmail(user) {
        return !!realEmail(user?.email) && user?.emailVerified === true;
    }
    function isAdmin(user) {
        return (user?.localId || user?.uid) === ADMIN_UID;
    }
    function canUseFeatures(user) {
        // 仅原管理员免邮箱完善；邮箱验证状态仍如实保留，不授予其他账号例外。
        return isAdmin(user) || hasVerifiedEmail(user);
    }
    function assertCanUseFeatures(user) {
        if (canUseFeatures(user)) return;
        const error = new Error('请先绑定并验证邮箱，再使用网站功能');
        error.statusCode = 403;
        error.code = 'EMAIL_VERIFICATION_REQUIRED';
        throw error;
    }
    root.AccountPolicy = Object.freeze({ ADMIN_UID, realEmail, hasVerifiedEmail, isAdmin, canUseFeatures, assertCanUseFeatures });
})(globalThis);
