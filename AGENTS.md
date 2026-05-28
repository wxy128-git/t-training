# AGENTS.md

## Project Snapshot

- Project: `t-training`, a static teacher AI training website for sharing AI tools, prompts, learning paths, cases, articles, and teacher feedback.
- Local path: `/Users/wangxingyu/C-C/t-training`
- Production site: `https://xylaoshi.netlify.app/index.html`
- Deployment flow: GitHub repository + Netlify, with Firebase used for auth/data features.
- Current instruction from user: make the next round of edits locally first, do not deploy until the user previews and confirms.

## Completed Recently

- Homepage visual redesign and copy cleanup.
- AI teaching assistant widget added.
- Contact/message module added, and留言 requires login/registration.
- Learning path cards/icons adjusted; learning path expansion requires login.
- Hero wording changed to: `按需查找、学习和分享`.
- Previous local server was stopped when the user ended the prior session.

## Pending Issues To Fix

- Homepage: top hero metric cards and the stats bar below are content-repetitive; remove or redesign the repeated stats area.
- Homepage: replace the English global AI news preview with Chinese teacher-facing content, such as AI teaching tips or practical usage methods.
- Tools page: remove the five-star rating display from every tool card.
- Site-wide: using website functions should require login; unauthenticated users should see the login dialog before navigating/using protected features.

## Important Notes

- Do not deploy until the user explicitly says to deploy.
- Keep edits scoped and avoid changing unrelated files.
- If preview is needed, start a local server and give the user the localhost URL.
