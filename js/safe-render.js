/* ===== Safe rendering helpers =====
   Treat every value from users, Firestore, RSS feeds, and model output as untrusted.
   This project intentionally has no build step, so the sanitizer is small and local. */
(function initSafeRender(global) {
    'use strict';

    const ALLOWED_TAGS = new Set([
        'a', 'b', 'blockquote', 'br', 'code', 'del', 'details', 'em', 'h1', 'h2', 'h3',
        'h4', 'h5', 'h6', 'hr', 'i', 'img', 'li', 'ol', 'p', 'pre', 's', 'span',
        'strong', 'summary', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul'
    ]);
    const DROP_WITH_CONTENT = new Set([
        'base', 'button', 'embed', 'form', 'iframe', 'input', 'link', 'math', 'meta',
        'object', 'option', 'script', 'select', 'style', 'svg', 'template', 'textarea'
    ]);
    const ALLOWED_ATTRS = {
        a: new Set(['href', 'title']),
        code: new Set(['class']),
        img: new Set(['alt', 'height', 'loading', 'src', 'title', 'width']),
        td: new Set(['colspan', 'rowspan']),
        th: new Set(['colspan', 'rowspan'])
    };

    function escape(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[ch]));
    }

    function safeUrl(value, options = {}) {
        const raw = String(value ?? '').trim();
        if (!raw) return '';
        if (options.allowHash !== false && raw.startsWith('#')) return raw;

        const compact = raw.replace(/[\u0000-\u0020\u007f]+/g, '');
        if (/^(javascript|vbscript|file|blob):/i.test(compact)) return '';
        if (/^data:/i.test(compact)) {
            return options.allowDataImage === true && /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(compact)
                ? raw
                : '';
        }

        try {
            const parsed = new URL(raw, global.location?.href || 'https://ai.teachailab.com/');
            if (!['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol)) return '';
            return raw;
        } catch {
            return '';
        }
    }

    function classNames(value, fallback = '') {
        const safe = String(value ?? '')
            .split(/\s+/)
            .filter(token => /^[a-z0-9_-]{1,64}$/i.test(token))
            .join(' ');
        return safe || fallback;
    }

    function sanitizeHtml(value) {
        if (typeof document === 'undefined') return escape(value);
        const template = document.createElement('template');
        template.innerHTML = String(value ?? '');

        const visit = node => {
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            const tag = node.tagName.toLowerCase();

            if (!ALLOWED_TAGS.has(tag)) {
                if (DROP_WITH_CONTENT.has(tag)) {
                    node.remove();
                    return;
                }
                const parent = node.parentNode;
                if (!parent) return;
                while (node.firstChild) parent.insertBefore(node.firstChild, node);
                node.remove();
                return;
            }

            const allowed = ALLOWED_ATTRS[tag] || new Set();
            for (const attr of Array.from(node.attributes)) {
                const name = attr.name.toLowerCase();
                if (!allowed.has(name) || name.startsWith('on') || ['style', 'srcdoc', 'formaction'].includes(name)) {
                    node.removeAttribute(attr.name);
                }
            }

            if (tag === 'a') {
                const href = safeUrl(node.getAttribute('href'));
                if (href) node.setAttribute('href', href); else node.removeAttribute('href');
                if (/^https?:/i.test(href)) {
                    node.setAttribute('target', '_blank');
                    node.setAttribute('rel', 'noopener noreferrer nofollow');
                }
            }
            if (tag === 'img') {
                const src = safeUrl(node.getAttribute('src'), { allowDataImage: true });
                if (src) node.setAttribute('src', src); else node.remove();
                if (node.isConnected || node.parentNode) {
                    node.setAttribute('loading', 'lazy');
                    node.setAttribute('decoding', 'async');
                }
            }
            if (tag === 'code' && node.hasAttribute('class')) {
                const className = node.getAttribute('class') || '';
                if (!/^language-[a-z0-9_-]{1,32}$/i.test(className)) node.removeAttribute('class');
            }
            if (['td', 'th'].includes(tag)) {
                for (const attrName of ['colspan', 'rowspan']) {
                    const raw = node.getAttribute(attrName);
                    if (raw && !/^\d{1,2}$/.test(raw)) node.removeAttribute(attrName);
                }
            }
        };

        const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT);
        const elements = [];
        while (walker.nextNode()) elements.push(walker.currentNode);
        elements.forEach(visit);
        return template.innerHTML;
    }

    function markdown(value, options = {}) {
        const source = String(value ?? '');
        if (!global.marked?.parse) return escape(source).replace(/\n/g, '<br>');
        try {
            return sanitizeHtml(global.marked.parse(source, { breaks: true, gfm: true, ...options }));
        } catch {
            return escape(source).replace(/\n/g, '<br>');
        }
    }

    global.SafeRender = Object.freeze({ classNames, escape, markdown, safeUrl, sanitizeHtml });
})(globalThis);
