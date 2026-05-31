# AGENTS.md

## Project Snapshot

- Project: `t-training`, a static teacher AI training website for sharing AI tools, prompts, learning paths, teaching cases, articles, design resources, and teacher feedback.
- Local path: `/Users/wangxingyu/C-C/t-training`
- Production site: `https://xylaoshi.pages.dev/`
- GitHub remote: `git@github.com:wxy128-git/t-training.git`
- Deployment: push to GitHub `main`, Cloudflare Pages auto-deploys the static site and `functions/` directory.
- Firebase is used for authentication and Firestore-backed data.
- Migrated off Netlify on 2026-05-30 after the Netlify team credit limit was exceeded. The legacy `netlify/functions/` directory was removed on 2026-05-31 once the Cloudflare deployment was confirmed stable.

## Latest Deployment

- 2026-05-30: Migrated hosting and functions from Netlify to Cloudflare Pages. New host is `xylaoshi.pages.dev`.
- Netlify Functions (`netlify/functions/*.js`) were rewritten as Cloudflare Pages Functions in `functions/api/*.js` (auth-proxy, admin-users, rss-proxy). Frontend calls now use `/api/...` paths.
- `admin-users.js` had to swap Node's `crypto.createSign` and `Buffer` for Web Crypto API + atob/TextEncoder because Cloudflare Workers do not expose Node built-ins.
- Contact form was previously a Netlify Forms submission; it now writes to Firestore collection `contact_messages` (fields: name, contact, message, page, userId, userEmail, userPhone, createdAt, handled). An admin panel ("联系留言") was added on 2026-05-31 to browse, toggle handled state, and delete messages.
- Deployment flow: push to GitHub `main` → Cloudflare Pages auto-deploys.

## Completed In Recent Work

- Homepage hero copy updated to: `按需查找、学习和分享`.
- Removed the duplicated stats bar below the homepage hero.
- Replaced the English homepage news preview with a Chinese `AI 教学使用技巧` section.
- Added three clickable teaching-tip article entries:
  - `tip-classroom-profile`
  - `tip-question-design`
  - `tip-courseware-workflow`
- Added fallback article content in `js/data.js`, so article list/detail pages still have content when Firestore has no published articles.
- Added cache-busting query string `js/data.js?v=20260528-tips` across pages.
- Removed five-star ratings from tool cards.
- Added site-wide login gating for protected functions and pages.
- Contact messages, learning path expansion, prompt copying, subscriptions, article links, tools, resources, and the AI teaching assistant require login.
- AI teaching assistant widget and contact module are already present.
- Registration flow now saves the display name to Firebase Auth first, caches the profile locally, then tries to merge the Firestore user document without blocking account creation.
- `firebase-config.js` now falls back to Firebase Auth/local cached profile data if Firestore cannot read the `users` document.
- `functions/api/auth-proxy.js` (formerly `netlify/functions/auth-proxy.js`) handles login/register when browser-side Firebase Auth is slow or unreachable.
- `functions/api/admin-users.js` (formerly `netlify/functions/admin-users.js`) handles full admin user deletion, including orphaned Auth accounts by email or phone.
- Auth-related scripts use a `v=20260530-admin-delete` query string to avoid stale browser cache.
- `AGENTS.md` is intentionally kept as a handoff note for future sessions.

## Auth Notes

- Admin email configured in code: `admin@xylaoshi.com`
- Password is not stored in the repo. Reset it through Firebase Authentication if forgotten.
- Full admin deletion requires a Firebase service account configured as Cloudflare Pages environment variables (Settings → Variables and Secrets, Type: Secret). Accepted variable names: `FIREBASE_SERVICE_ACCOUNT` / `FIREBASE_ADMIN_CREDENTIALS` / `GOOGLE_SERVICE_ACCOUNT_JSON` / `GOOGLE_CREDENTIALS`, or `FIREBASE_CLIENT_EMAIL` plus `FIREBASE_PRIVATE_KEY`. `FIREBASE_SERVICE_ACCOUNT` was wired up on 2026-05-31. Watch out for leading whitespace in the Name field — CF does not auto-trim, which silently breaks reads.

## Current Behavior To Remember

- Homepage remains visible publicly, but clicking functional entries while logged out should open the login dialog.
- Protected pages may still render content, but unauthenticated users should be prompted to log in before using/navigating features.
- Article pages rely on `article.html?id=...`; fallback article IDs are defined in `DEFAULT_ARTICLES` inside `js/data.js`.
- If Firestore has articles, fallback teaching-tip articles are merged in unless an article with the same ID already exists.

## Future Follow-Ups

- Consider adding a `忘记密码` flow to the login modal.
- If the user wants external expert resources, add curated Chinese links or citations to the teaching-tip articles.
- If more pages are added, include their filenames in the login gate in `js/auth.js`.
- For future edits, preview locally first when practical, then deploy only after the user explicitly asks.
