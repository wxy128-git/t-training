# AGENTS.md

## Project Snapshot

- Project: `t-training`, a teacher-facing AI training site (AI tools, prompts, learning paths, teaching cases, articles, design resources, classroom tools, contact feedback).
- Local path: `/Users/wangxingyu/C-C/t-training`
- Production: `https://xylaoshi.pages.dev/`
- GitHub remote: `git@github.com:wxy128-git/t-training.git`
- Deployment: push to `main` → Cloudflare Pages auto-builds and ships static files + `functions/`.
- Backend services: Firebase Auth (email/password) and Cloud Firestore.

## Architecture

- Plain HTML/CSS/JS, no bundler. Pages render skeletons (or in-code defaults), then JS pulls data from Firestore via the global `DB` object in `js/data.js`.
- Three Cloudflare Pages Functions under `functions/api/`:
  - `auth-proxy.js` — server-side login/register fallback when the browser can't reach Firebase Auth directly. Stores an ID token in `localStorage` under the key in `window.PROXY_AUTH_SESSION_KEY`. **Should now only run as a network-failure fallback** (see "Auth Lesson" below).
  - `admin-users.js` — admin-only full deletion of a user (both Authentication account and Firestore profile). Requires a Firebase service account configured via Cloudflare environment variables.
  - `rss-proxy.js` — generic CORS-friendly RSS fetcher for the news page; used as one of several loaders.
- Frontend always calls these via `/api/...` paths.

## Deployment History

- **2026-05-30**: Migrated off Netlify after the team credit limit was exceeded; rewrote the three Netlify Functions as Cloudflare Pages Functions (Node `crypto`/`Buffer` swapped for Web Crypto API + `atob`/`TextEncoder`).
- **2026-05-31**: Removed the legacy `netlify/functions/` directory once CF was stable; configured `FIREBASE_SERVICE_ACCOUNT` on CF so admin user deletion works. Editorial visual redesign + four classroom tools shipped.
- **2026-06-01**: Hamburger drawer replaces 1080px-and-below horizontal scroll nav. Four more classroom tools added (groups / seating / applause / whiteboard). Paths and articles split into warm-vs-cool color families. Admin gets a 设计资源 management panel; resources migrate to Firestore.
- **2026-06-02**: Firestore rules updated to include `resource_categories`. Path gradients enforced at render time by slug, bypassing any legacy data in Firestore.
- **2026-06-04**: Per-page OG share cards shipped (10 editorial 1200×630 JPGs under `assets/og/`, generated from `assets/og/template.html` via headless screenshots — see "SEO / OG"). Added `twitter:card`/`twitter:image` + `og:image:width/height` to all content pages; added missing `canonical` to `index.html`. CSS got a self-contained "Refinement layer" at the end of `style.css` (softer card motion, springy button press, more editorial spacing, CSS-only scroll-reveal). `style.css` is now cache-busted with `?v=YYYYMMDD` on every page — bump it whenever the stylesheet changes.
- Old Netlify site (`xylaoshi.netlify.app`) is currently 503 (team credit limit). If/when it comes back, follow up on a redirect — strategy is to commit a `netlify.toml` with a 301 to pages.dev, since CF Pages ignores that file.

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
| `resource_categories` | design resource categories with embedded items array (added 2026-06-01) | admin only |
| `community_prompts` | user-submitted prompts | logged-in users (create), author or admin (update) |
| `showcases` | teacher case studies | logged-in users (create), admin (moderate) |
| `tool_ratings` | per-tool 5-star ratings (not currently shown in UI) | logged-in users |
| `subscribers` | newsletter sign-ups | anyone (create), admin (read/delete) |
| `contact_messages` | contact-form submissions | logged-in users (create), admin (read/update/delete) |

Rules live in Firebase Console → Firestore → Rules. They are the source of truth — keep them in mind whenever a write fails.

## Pages

| File | Purpose |
|---|---|
| `index.html` | Homepage: hero, feature nav (8 cards in 4×2), paths preview, tools preview, prompts preview, articles, showcases, contact band, subscribe |
| `tools.html` | AI tool listing — **renders `DEFAULT_TOOLS` synchronously first**, then replaces with Firestore data |
| `classroom-tools.html` | Eight self-contained classroom widgets (see below) |
| `paths.html` | Full learning-path detail page |
| `prompts.html` | Prompt library (official + community submissions) |
| `news.html` | RSS-aggregated industry news |
| `showcase.html` | Teacher case showcase |
| `articles.html` + `article.html` | Featured article list + detail |
| `resources.html` | Design resources (now Firestore-backed, falls back to `DEFAULT_RESOURCES`) |
| `admin.html` | Admin dashboard: dashboard, announcements, community prompts, showcases, subscribers, **联系留言**, articles, tools, prompts, paths, **设计资源**, users |

## Key JS Files

- `js/data.js` — `DEFAULT_TOOLS / DEFAULT_PROMPTS / DEFAULT_PATHS / DEFAULT_ARTICLES / DEFAULT_RESOURCES` are used as fallbacks/seeds; `DB` object wraps all Firestore reads/writes (one or more methods per collection).
- `js/firebase-config.js` — initializes Firebase, exposes `auth` and `db`, defines `_currentUser`, `onAuthReady`, dispatches `authChanged` events.
- `js/auth.js` — `Auth` object (login/register/logout, getIdToken), `renderNav` / `renderFooter` (every page calls these), `requireLogin`, `showAuthModal`, `showWelcomeOverlay`, **hamburger drawer state** (`openNavDrawer` / `closeNavDrawer`).
- `js/assistant.js` — floating AI-assistant launcher + the contact-feedback modal that writes to `contact_messages`.

## Design Language

**Typography** — one sans family across the whole site:
- Latin: Plus Jakarta Sans (variable, weights 400–800, italic).
- Chinese: Noto Sans SC + system fallbacks (PingFang SC, Hiragino Sans GB).
- Mono (digits, timestamps, kicker labels): JetBrains Mono.
- `--font-display` is aliased to `--font-sans`; hierarchy comes from weight (700–800 for display, 500 for labels) and size, not font family.

**Base color tokens** (defined in `css/style.css :root`):
- Background: paper cream `--soft #faf7f0`. Surfaces white.
- Ink: warm dark `--ink #1a1612` (not cold blue).
- Brand: cinnabar red `--brand #c0392b` — used sparingly as the only accent (italic highlight in hero, section accent stripes, hover/active states).
- Avoid generic AI-design tropes: no purple-to-pink gradients, no Inter, no neon glow.

**Two card-color families** (introduced 2026-06-02 to give homepage sections distinct identities while staying within the editorial palette):

- **Warm "growth" family — used by learning paths** (path-card-head + path-nav-card + path-detail-head):
  - starter: `#2d4a3a → #1a3528` (deep emerald)
  - teacher: `#4a3625 → #2c1f15` (deep walnut)
  - creator: `#7a2e28 → #4d1812` (deep burgundy)
- **Cool "knowledge" family — used by article covers** (six gradients cycled by `id` hash):
  - indigo `#1f2f4a → #101a2e`
  - petrol `#1f3a3e → #102225`
  - violet `#332945 → #1c1530`
  - slate `#2c2f3a → #181a22`
  - dark plum-rose `#3d242a → #231016`
  - charcoal `#252830 → #14171d`

Both families are enforced at render time, **not** trusted from Firestore. Path renders look the gradient up from a `PATH_PALETTE[slug]` map in `index.html` and `paths.html`; article rendering ignores `coverColor` and hashes `id → COVER_GRADIENTS`. This means legacy Firestore values don't need to be migrated — they're simply overridden.

**Component conventions**:
- Radius scale 8 / 12 / 18 / 24 px.
- Cards: 1px `--line` border, soft hover lift (`translateY(-3px)` + `--shadow-md`).
- Section headers: top hairline + auto-counter "01 / 02 / 03" italic numeral in brand color (uses CSS counter on `.home-section`).
- Hero is on `--soft` with a faint dot-grid radial mask; title 800-weight with the `.highlight` span italic + brand color; staggered fade-in animation on `.hero-content > *`.

**Welcome overlay**: registration and login both call `showWelcomeOverlay(kind, name)` from `js/auth.js`. It renders a centered card ("欢迎回来 / 欢迎加入" + the user's name + a 3-dot pulse) for ~1.7s before reloading. This is what makes the login moment feel like something happened.

## Navigation & Mobile

- Desktop (≥1081px): the standard horizontal `.site-nav` in `renderNav()` shows all entries.
- Tablet / mobile (≤1080px): `.site-nav` is hidden via CSS, a 40px `ph-list` hamburger button appears in `.auth-area`. Clicking it opens a right-slide drawer (`.nav-drawer`) that fades in with a backdrop. The drawer holds the full nav list with mono "导航" / "其他" kickers between sections.
- Drawer dismissal: backdrop click, ESC key, internal link click, or the close button.
- `resources.html` formerly had its own inline nav markup; it now uses `renderNav('resources')` like every other page so the hamburger works there too.

## Classroom Tools (`classroom-tools.html`)

Single-page experience. Home grid shows tool cards; clicking one swaps in its UI under `#ct-stage-content`. A back button returns home; a fullscreen toggle hides nav/footer for projector use. URL hash deep-links directly to a tool (`#countdown` / `#picker` / etc.). Transitions: home fades+slides out before stage fades+slides in (CSS `entering` / `leaving` classes + chained rAF). `prefers-reduced-motion` disables all of it.

The eight tools:

1. **倒计时** — mono-numeric display, 1/3/5/10/15-min presets + custom MM:SS, start/pause/resume/reset, last 10s pulse, 3-beep AudioContext chime at zero.
2. **随机点名** — roster textarea (any whitespace/punctuation separator), spinning ticker before landing, "抽过不再抽" mode with chip-list history. Roster persists in `localStorage` (`ctPickerRoster`).
3. **转盘抽奖** — Hi-DPI canvas wheel using the editorial palette, cubic-ease 4.2s deceleration, top pointer, auto-truncated labels.
4. **音浪小球** — microphone-driven bouncing visualization with four themes (ball / bubble / emoji / number). See "音浪小球 details" below.
5. **随机分组** — fisher-yates shuffle + round-robin OR per-group chunking. Roster persists in `localStorage` (`ctGroupsRoster`).
6. **座位表** — grid of `rows × cols` filled from a roster, click two seats to swap, prints via `window.print()` with `@media print` rules hiding everything else.
7. **课堂音效** — eight buttons, all sounds synthesized with Web Audio (no audio files): applause / cheer / bell / chime / time-up / drumroll / correct / wrong.
8. **简易白板** — 6-color palette + 4 brush sizes + eraser + undo (40-frame snapshot stack) + clear + save PNG. Supports both pointer and touch input. ResizeObserver preserves the drawing across fullscreen toggles.

### 音浪小球 details

- Audio pipeline: `getUserMedia({audio: { echoCancellation:false, noiseSuppression:false, autoGainControl:false }})` → `AudioContext` → `AnalyserNode` (fftSize 1024, smoothing 0.5). Each frame computes RMS over the time-domain buffer, applies a noise-floor cutoff, smooths exponentially, scales by the sensitivity slider, produces an `impulse` value in [0, 1.4].
- Ball sizes are bucketed for strong visual variance: ~38% small (sizeMul 0.45–0.70), ~44% medium (0.80–1.10), ~18% large (1.25–1.80). Every ball stores `mass = sizeMul²`.
- Physics: gravity + wall damping (0.78) + ground friction (0.96). Audio impulse is `(impulse * 26 * groundBias) / mass` — same sound throws tiny balls high, barely nudges big ones. Ball-ball collisions are mass-weighted elastic impulse with restitution 0.86; overlap separation is inverse-mass weighted.
- Controls bar: mic toggle (pulses red when active), sensitivity slider (0.3×–3.0×), count slider (5–60), 4-way theme segmented control.
- Stage uses `ResizeObserver` on `.ct-balls-stage` to react to fullscreen toggles (CSS-only size changes don't fire `window.resize`).
- `syncCanvas()` resizes the canvas backbuffer and **clamps** existing balls into the new bounds rather than rebuilding — preserves the live state through fullscreen transitions.

### Classroom Tools lesson

If a render call throws (we hit this when the bubble theme built `"rgb(...)55"` strings that aren't valid CSS colors), the next `requestAnimationFrame(loop)` line never executes and the whole animation freezes silently. Always wrap canvas render loops in `try/catch` and prefer the local `rgbaFromHex(hex, alpha, lightenAmt?)` helper over string concatenation when alpha is involved.

## SEO / OG

- Every page has `<meta name="description">`, complete OpenGraph tags (og:title / description / type / url / image + image:width/height), `twitter:card` (summary_large_image) + `twitter:image`, and `<link rel="canonical">`.
- **Per-page OG cards (done 2026-06-04)**: each content page points `og:image`/`twitter:image` at its own `assets/og/<slug>.jpg` (1200×630). Slugs: `index, tools, prompts, paths, news, showcase, articles, article, resources, classroom`. `admin.html` / `main.html` are internal and have no OG card.
- **How to regenerate a card**: edit the page's entry in the `PAGES` map inside `assets/og/template.html`, serve the folder locally (`python3 -m http.server`), open `assets/og/template.html?p=<slug>` at a 1200×630 viewport, and screenshot to `assets/og/<slug>.jpg`. The template uses the editorial palette (cream + dot-grid + cinnabar italic highlight + mono kicker + bottom brand stripe). No build step, no runtime function — the cards are static JPGs.
- Old shared image `assets/hero-teacher-workspace.jpg` is still used as the hero preload, just no longer as the OG image.

## Known Quirks / Conventions

- The contact form writes directly to Firestore — no server, no email. Admin reviews via the **联系留言** panel in `admin.html`.
- Auth-protected pages are listed in `PROTECTED_PAGE_NAMES` inside `js/auth.js`. When adding a new page that needs login gating, add it there.
- **Render-time palette enforcement** is the standard pattern for cards whose backgrounds were originally stored in Firestore — see paths (slug → gradient) and articles (id-hash → gradient). When updating colors, change the local map; don't bother migrating the database row.
- `DB.getMessages()` reads `contact_messages` ordered by `createdAt desc`. The contact field uses `firebase.firestore.FieldValue.serverTimestamp()` so the order is reliable.
- Five-star tool ratings UI was removed but the `tool_ratings` collection and rules remain (in case it's reintroduced).
- Article and path data flow: if Firestore is empty, `DEFAULT_*` constants in `js/data.js` provide content. Otherwise Firestore wins.
- Resources data flow same: `resources.html` paints `DEFAULT_RESOURCES` immediately, then swaps in whatever Firestore returns. Admin saves go to `resource_categories`.
- Cache-busting query strings on `data.js` (`?v=...`), `auth.js`, and now `css/style.css` (`?v=YYYYMMDD`) are updated whenever those files change; bump the version in every page that loads them.
- The end of `css/style.css` has a clearly fenced "2026-06-04 · Refinement layer" — motion/spacing/polish overrides plus a pure-CSS scroll-reveal (`@supports (animation-timeline: view())`, degrades to fully-visible on unsupported browsers, disabled under `prefers-reduced-motion`). It's self-contained and safe to revert as a block.

## Future Follow-Ups

- Add a 忘记密码 flow to the login modal.
- When the old Netlify site recovers, commit a `netlify.toml` that 301-redirects to `pages.dev` (CF Pages ignores it, so it's safe).
- Consider extracting the classroom-tools sub-tools into separate JS modules — `classroom-tools.html` is large (~1700 lines now).
- If we ever need real-time updates on `contact_messages`, switch the admin panel to `onSnapshot`.
- Cloud storage for user-uploaded showcase images is not wired up yet — currently URLs only.
- `tool_ratings` is dormant; either restore the UI or delete the collection + its security rule.
