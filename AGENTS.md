# AGENTS.md

## Project Snapshot

- Project: `t-training`, a static teacher AI training website for sharing AI tools, prompts, learning paths, teaching cases, articles, design resources, and teacher feedback.
- Local path: `/Users/wangxingyu/C-C/t-training`
- Production site: `https://xylaoshi.netlify.app/index.html`
- GitHub remote: `git@github.com:wxy128-git/t-training.git`
- Deployment: push to GitHub `main`, Netlify auto-deploys the static site.
- Firebase is used for authentication and Firestore-backed data.

## Latest Deployment

- Latest deployment includes registration hardening: Firebase Auth account creation is no longer blocked by a failed Firestore profile write.
- Deployment flow remains GitHub `main` push followed by Netlify auto-deploy.

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
- Auth-related scripts use a `v=20260530-auth` query string to avoid stale browser cache.
- `AGENTS.md` is intentionally kept as a handoff note for future sessions.

## Auth Notes

- Admin email configured in code: `admin@xylaoshi.com`
- Password is not stored in the repo. Reset it through Firebase Authentication if forgotten.

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
