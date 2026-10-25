/* Contextual help. Text stays in the page/copy registry; no network or persistence. */
(function (root) {
    const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    function button(text, label = '查看说明') {
        return `<button type="button" class="ui-note-trigger" data-ui-note="${esc(text)}" aria-label="${esc(label)}" aria-expanded="false"><i class="ph ph-info" aria-hidden="true"></i></button>`;
    }
    let anchor, tip, timer, pinned = false, sequence = 0, previousDescription = null, dismissed = null;
    function close() {
        clearTimeout(timer);
        if (anchor) {
            anchor.setAttribute('aria-expanded', 'false');
            if (previousDescription === null) anchor.removeAttribute('aria-describedby');
            else anchor.setAttribute('aria-describedby', previousDescription);
        }
        tip?.remove();
        anchor = tip = null; pinned = false; previousDescription = null;
    }
    function place() {
        if (!anchor || !tip) return;
        const r = anchor.getBoundingClientRect();
        if (!anchor.isConnected || !r.width || r.bottom < 0 || r.top > innerHeight) { close(); return; }
        const t = tip.getBoundingClientRect();
        tip.style.left = Math.max(12, Math.min(innerWidth - t.width - 12, r.left)) + 'px';
        tip.style.top = (r.bottom + t.height + 12 <= innerHeight ? r.bottom + 6 : Math.max(12, r.top - t.height - 6)) + 'px';
    }
    function read(b) {
        return b.dataset.noteSource ? document.getElementById(b.dataset.noteSource)?.textContent.trim() : b.dataset.uiNote;
    }
    function later() {
        if (!pinned && document.activeElement !== anchor) {
            clearTimeout(timer); timer = setTimeout(close, 180);
        }
    }
    function open(b) {
        clearTimeout(timer);
        if (b === dismissed) return;
        const value = read(b);
        if (!value) { close(); return; }
        if (b !== anchor) {
            close(); anchor = b;
            previousDescription = b.getAttribute('aria-describedby');
            tip = document.createElement('div'); tip.className = 'ui-note-popover';
            tip.id = 'ui-note-' + (++sequence); tip.setAttribute('role', 'tooltip');
            (b.closest('dialog') || document.body).append(tip);
            tip.addEventListener('pointerenter', () => clearTimeout(timer));
            tip.addEventListener('pointerleave', later);
        }
        tip.textContent = value;
        b.setAttribute('aria-expanded', 'true');
        b.setAttribute('aria-describedby', [previousDescription, tip.id].filter(Boolean).join(' '));
        place();
    }
    const selector = '[data-ui-note],[data-note-source]';
    document.addEventListener('pointerover', e => {
        const b = e.target.closest(selector);
        if (b && e.pointerType !== 'touch' && !b.contains(e.relatedTarget)) { dismissed = null; open(b); }
        else if (e.target.closest('[data-research-note]')) close();
    });
    document.addEventListener('pointerout', e => {
        const b = e.target.closest(selector);
        if (b && !b.contains(e.relatedTarget) && !e.relatedTarget?.closest('.ui-note-popover')) { dismissed = null; later(); }
    });
    document.addEventListener('focusin', e => { const b = e.target.closest(selector); if (b) open(b); else if (!pinned || e.target.closest('[data-research-note]')) close(); });
    document.addEventListener('focusout', e => { if (e.target.closest(selector)) { dismissed = null; later(); } });
    document.addEventListener('click', e => {
        const b = e.target.closest(selector);
        if (b) {
            e.preventDefault();
            if (anchor === b && pinned) { dismissed = b; close(); }
            else { dismissed = null; open(b); pinned = !!anchor; }
        } else if (!e.target.closest('.ui-note-popover')) close();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && anchor) { dismissed = document.activeElement === anchor ? anchor : null; close(); e.preventDefault(); e.stopPropagation(); }
    }, true);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    window.addEventListener('hashchange', close);
    window.addEventListener('pagehide', close);
    document.documentElement.classList.add('ui-notes-ready');
    root.UiNotes = Object.freeze({button, close});
})(globalThis);
