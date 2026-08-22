# Vendored browser dependencies

These exact versions are served from the Tencent origin so the critical page path does not depend on overseas CDNs.

- Firebase JavaScript SDK compat 10.12.0 (`www.gstatic.com/firebasejs/10.12.0/`), Apache-2.0
- Marked 9.1.6 (`cdn.jsdelivr.net/npm/marked@9.1.6/`), MIT
- Phosphor Icons Web 2.1.2 (`unpkg.com/@phosphor-icons/web@2.1.2/`), MIT

Only the regular, fill, bold and light Phosphor font families used by this project are included. Keep versions in directory names and update every HTML reference, `css/style.css`, `sw.js`, and `scripts/check-site.mjs` together when upgrading.
