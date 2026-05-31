# AGENTS.md

## Project Snapshot

- Project: `t-training`, a teacher-facing AI training site (AI tools, prompts, learning paths, teaching cases, articles, design resources, classroom tools, contact feedback).
- Local path: `/Users/wangxingyu/C-C/t-training`
- Production: `https://xylaoshi.pages.dev/`
- GitHub remote: `git@github.com:wxy128-git/t-training.git`
- Deployment: push to `main` → Cloudflare Pages auto-builds and ships static files + `functions/`.
- Backend services: Firebase Auth (email/password) and Cloud Firestore.

## Architecture

- Plain HTML/CSS/JS, no bundler. Pages render skeletons, then JS pulls data from Firestore via the global `DB` object in `js/data.js`.
- Three Cloudflare Pages Functions under `functions/api/`:
  - `auth-proxy.js` — server-side login/register fallback when the browser can't reach Firebase Auth directly. Stores an ID token in `localStorage` under the key in `window.PROXY_AUTH_SESSION_KEY`. **Should now only run as a network-failure fallback** (see "Auth Lesson" below).
  - `admin-users.js` — admin-only full deletion of a user (both Authentication account and Firestore profile). Requires a Firebase service account configured via Cloudflare environment variables.
  - `rss-proxy.js` — generic CORS-friendly RSS fetcher for the news page; used as one of several loaders.
- Frontend always calls these via `/api/...` paths.

## Deployment History

- 2026-05-30: migrated off Netlify after the team credit limit was exceeded; rewrote the three Netlify Functions as Cloudflare Pages Functions (Node `crypto`/`Buffer` swapped for Web Crypto API + `atob`/`TextEncoder`).
- 2026-05-31: removed the legacy `netlify/functions/` directory once CF was stable; configured `FIREBASE_SERVICE_ACCOUNT` on CF so admin user deletion works.
- Old Netlify site (`xylaoshi.netlify.app`) is currently 503 (team credit limit). If/when it comes back, follow up on a redirect — strategy is to commit a `netlify.toml` with a 301 to pages.dev, since CF Pages ignores that file. Until the Netlify side is reachable, no redirect can be installed.

## Auth Lesson (Important)

**The single biggest bug we hit during the migration**: production logins were routed through `/api/auth-proxy` first, which only stashes the ID token in `localStorage` and never calls the Firebase JS SDK. That left `firebase.auth().currentUser` as `null`, so every Firestore request went out unauthenticated — `getUsers`, article writes, subscribe lookups all 403'd even though the UI showed the admin as "logged in".

**Fix**: `shouldUseAuthProxyFirst()` in `js/auth.js` now always returns `false`. The Firebase JS SDK runs first; the proxy is only invoked from the `auth/network-request-failed` fallback branch. If you ever consider re-enabling proxy-first, remember it cannot satisfy Firestore security rules that read `request.auth`.

To verify auth is healthy: in DevTools console, `firebase.auth().currentUser` should be a non-null object after login.

## Auth & Admin

- Admin email: `admin@xylaoshi.com`. Password is **not** in the repo — reset via Firebase Authentication if forgotten.
- `users/{uid}` documents must contain `isAdmin: true` (boolean) for the admin user — Firestore rules check this with `get(.../users/$(request.auth.uid)).data.isAdmin == true`.
- "Forgot password" flow not yet implemented.
- Cloudflare env var `FIREBASE_SERVICE_ACCOUNT` (Type: Secret) holds the full Firebase Admin SDK JSON. Watch for **leading whitespace in the variable Name** — CF does not auto-trim and it silently breaks reads. Accepted alternate names: `FIREBASE_ADMIN_CREDENTIALS`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_CREDENTIALS`, or `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`.

## Firestore Collections

| Collection | Purpose | Who can write |
|---|---|---|
| `users` | profile per uid | self or admin |
| `tools` | AI tool entries | admin only |
| `prompts` | curated prompts | admin only |
| `paths` | structured learning paths | admin only |
| `announcements` | site announcements | admin only |
| `articles` | featured articles | admin only |
| `community_prompts` | user-submitted prompts | logged-in users (create), author or admin (update) |
| `showcases` | teacher case studies | logged-in users (create), admin (moderate) |
| `tool_ratings` | per-tool 5-star ratings (not currently shown in UI) | logged-in users |
| `subscribers` | newsletter sign-ups | anyone (create), admin (read/delete) |
| `contact_messages` | contact-form submissions, added during the migration | logged-in users (create), admin (read/update/delete) |

Rules live in Firebase Console → Firestore → Rules. They are the source of truth — keep them in mind whenever a write fails.

## Pages

| File | Purpose |
|---|---|
| `index.html` | Homepage: hero, contact band, feature nav, tools/paths/articles previews, subscribe section |
| `tools.html` | AI tool listing — **renders `DEFAULT_TOOLS` synchronously first**, then replaces with Firestore data |
| `classroom-tools.html` | 4 self-contained classroom widgets (see below) |
| `paths.html` | Full learning-path detail page |
| `prompts.html` | Prompt library |
| `news.html` | RSS-aggregated industry news |
| `showcase.html` | Teacher case showcase |
| `articles.html` + `article.html` | Featured article list + detail |
| `resources.html` | Curated design resources |
| `admin.html` | Admin dashboard (overview, announcements, community prompts, showcases, subscribers, **联系留言**, articles, tools, prompts, paths, users) |

## Key JS Files

- `js/data.js` — `DEFAULT_TOOLS / DEFAULT_PROMPTS / DEFAULT_PATHS / DEFAULT_ARTICLES` constants are used as fallbacks/seeds; `DB` object wraps all Firestore reads/writes (one method per collection).
- `js/firebase-config.js` — initializes Firebase, exposes `auth` and `db`, defines `_currentUser`, `onAuthReady`, dispatches `authChanged` events.
- `js/auth.js` — `Auth` object (login/register/logout, getIdToken), `renderNav` / `renderFooter`, `requireLogin`, `showAuthModal`, **`showWelcomeOverlay`** (the celebration overlay on register/login).
- `js/assistant.js` — floating AI-assistant launcher + the contact-feedback modal that writes to `contact_messages`.

## Design Language (2026-05-31 redesign)

**Typography** — one sans family across the whole site:
- Latin: Plus Jakarta Sans (variable, weights 400–800, has italic).
- Chinese: Noto Sans SC + system fallbacks (PingFang SC, Hiragino Sans GB).
- Mono (digits, timestamps, kicker labels): JetBrains Mono.
- No serif, no Fraunces. `--font-display` is aliased to `--font-sans`; hierarchy comes from weight (700–800 for display, 500 for labels) and size, not font family.

**Color tokens** (defined in `css/style.css :root`):
- Background: paper cream `--soft #faf7f0`. Surfaces white.
- Ink: warm dark `--ink #1a1612` (not cold blue).
- Brand: cinnabar red `--brand #c0392b` — used sparingly as the only accent (italic highlight in hero, section accent stripes, hover/active states, "新" markers).
- Avoid generic AI-design tropes: no purple-to-pink gradients, no Inter, no neon glow.

**Component conventions**:
- Radius scale 8 / 12 / 18 / 24 px.
- Cards: 1px `--line` border, soft hover lift (`translateY(-3px)` + `--shadow-md`).
- Section headers: top hairline + auto-counter "01 / 02 / 03" italic numeral in brand color (uses CSS counter on `.home-section`).
- Hero is on `--soft` with a faint dot-grid radial mask; title 800-weight with the `.highlight` span italic + brand color; staggered fade-in animation on `.hero-content > *`.
- Cards never reuse the SaaS purple gradient. All path / article / showcase covers were repalleted to warm earth tones — see `DEFAULT_PATHS` gradients and `COVER_GRADIENTS` arrays.

**Welcome overlay**: registration and login both call `showWelcomeOverlay(kind, name)` from `js/auth.js`. It renders a centered card ("欢迎回来 / 欢迎加入" + the user's name + a 3-dot pulse) for ~1.7s before reloading. This is what makes the login moment feel like something happened.

## Classroom Tools (`classroom-tools.html`)

Single-page experience. Home grid shows 4 tool cards; clicking one swaps in its UI under `#ct-stage-content`. A back button returns home; a fullscreen toggle hides nav/footer for projector use. URL hash (`#countdown` / `#picker` / `#wheel` / `#balls`) deep-links directly to a tool.

The four tools:

1. **倒计时** — mono-numeric display, 1/3/5/10/15-min presets + custom MM:SS, start/pause/resume/reset, last 10s pulse, 3-beep AudioContext chime at zero.
2. **随机点名** — roster textarea (any whitespace/punctuation separator), spinning ticker before landing, "抽过不再抽" mode with chip-list history. Roster persists in `localStorage` (`ctPickerRoster`).
3. **转盘抽奖** — Hi-DPI canvas wheel using the editorial palette, cubic-ease 4.2s deceleration, top pointer, auto-truncated labels.
4. **音浪小球** — **microphone-driven**, not a roulette. See below.

### 音浪小球 details

- Audio pipeline: `getUserMedia({audio: { echoCancellation:false, noiseSuppression:false, autoGainControl:false }})` → `AudioContext` → `AnalyserNode` (fftSize 1024, smoothing 0.5). Each frame computes RMS over the time-domain buffer, applies a noise-floor cutoff, smooths exponentially, scales by the sensitivity slider, produces an `impulse` value in [0, 1.4].
- Ball sizes are bucketed for strong visual variance: ~38% small (sizeMul 0.45–0.70), ~44% medium (0.80–1.10), ~18% large (1.25–1.80). Every ball stores `mass = sizeMul²`.
- Physics: gravity + wall damping (0.78) + ground friction (0.96). Audio impulse is `(impulse * 26 * groundBias) / mass` — same sound throws tiny balls high, barely nudges big ones. Ball-ball collisions are mass-weighted elastic impulse with restitution 0.86; overlap separation is inverse-mass weighted.
- Themes: `ball` (3D radial gradient + specular highlight), `bubble` (translucent soap-film with shimmer dots — see lesson below), `emoji` (rotating set of 30 themed emoji), `number` (numbered balls 1–N).
- Controls bar: mic toggle (pulses red when active), sensitivity slider (0.3×–3.0×), count slider (5–60), 4-way theme segmented control.
- Stage uses `ResizeObserver` on `.ct-balls-stage` to react to fullscreen toggles (CSS-only size changes don't fire `window.resize`).
- `syncCanvas()` resizes the canvas backbuffer and **clamps** existing balls into the new bounds rather than rebuilding — preserves the live state through fullscreen transitions.

### Classroom Tools lesson

If a render call throws (we hit this when the bubble theme built `"rgb(...)55"` strings that aren't valid CSS colors), the next `requestAnimationFrame(loop)` line never executes and the whole animation freezes silently. Always wrap canvas render loops in `try/catch` and prefer the local `rgbaFromHex(hex, alpha, lightenAmt?)` helper over string concatenation when alpha is involved.

## Known Quirks / Conventions

- The contact form writes directly to Firestore — no server, no email. Admin reviews via the **联系留言** panel in `admin.html`.
- Auth-protected pages are listed in `PROTECTED_PAGE_NAMES` inside `js/auth.js`. When adding a new page that needs login gating, add it there.
- Many homepage previews and tools use inline gradients passed from `js/data.js` (`path.gradient`, `article.coverColor`). When restyling, change those constants too — CSS selectors can't reach inline backgrounds.
- `DB.getMessages()` reads `contact_messages` ordered by `createdAt desc`. The contact field uses `firebase.firestore.FieldValue.serverTimestamp()` so the order is reliable.
- Five-star tool ratings UI was removed but the `tool_ratings` collection and rules remain (in case it's reintroduced).
- Article and path data flow: if Firestore is empty, `DEFAULT_ARTICLES` / `DEFAULT_PATHS` provide content. Otherwise Firestore wins. Default teaching-tip articles are merged in only if Firestore doesn't already have an entry with the same id.

## Future Follow-Ups

- Add a 忘记密码 flow to the login modal.
- When the old Netlify site recovers, commit a `netlify.toml` that 301-redirects to `pages.dev` (CF Pages ignores it, so it's safe).
- Consider extracting the classroom-tools sub-tools into separate JS modules — `classroom-tools.html` is already large (~1100 lines).
- If we ever need real-time updates on `contact_messages`, switch the admin panel to `onSnapshot`.
- Cloud storage for user-uploaded showcase images is not wired up yet — currently URLs only.
- `tool_ratings` is dormant; either restore the UI or delete the collection + its security rule.
