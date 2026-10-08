/* 科研阅读视图：仅呈现现有数据，不生成、不持久化文献全文。 */
(function (root) {
    const esc = value => SafeRender.escape(String(value ?? ''));
    const labels = {citation:'cardCitation',question:'cardQuestion',sample:'cardSample',method:'cardMethod',viewpoints:'cardViewpoints',findings:'cardFindings',keyReferences:'cardReferences',limitations:'cardLimitations',relevance:'cardRelevance',verdict:'cardVerdict'};
    const help = {citation:'helpCitation',question:'helpQuestion',sample:'helpSample',method:'helpMethod',viewpoints:'helpViewpoints',findings:'helpFindings',keyReferences:'helpReferences',limitations:'helpLimitations',relevance:'helpRelevance',verdict:'helpVerdict'};
    function note(key, copy, label = 'noteLabel', text = '') {
        return `<button type="button" class="rs-note-trigger" data-research-note="${esc(key)}"${text ? ` data-note-text="${esc(text)}"` : ''} data-note-label="${esc(label)}" aria-label="${esc(copy[label])}" aria-expanded="false"><span aria-hidden="true">ⓘ</span></button>`;
    }
    // Split explicit item separators only; never turn sentence punctuation into invented claims.
    function items(value) {
        if (Array.isArray(value)) return value.length ? value : ['原文未明确'];
        const text = String(value || '原文未明确');
        return text.split(/(?:\r?\n\s*(?:[-•]|\d+[.、])\s*|[；;](?!\s*\d+;))/).map(s => s.trim()).filter(Boolean);
    }
    function prose(value) {
        const list = items(value);
        const render = text => {
            const explicitLabel = text.match(/^([^：:\n*]{1,16})[：:]\s*(.+)$/);
            return SafeRender.markdown(explicitLabel ? `**${esc(explicitLabel[1])}**：${esc(explicitLabel[2])}` : esc(text));
        };
        return Array.isArray(value) || list.length > 1 ? `<ul>${list.map(item => `<li>${render(item)}</li>`).join('')}</ul>` : render(list[0]);
    }
    function cardHTML(card, question, copy, editable = false, context = '') {
        const c = card.citation;
        let html = `<article class="rs-reading-document"><header class="rs-document-header"><h3 class="rs-document-title">${esc(c.title)}</h3><p class="rs-document-meta"><span data-card-authors>${esc(c.authors)}</span> <span data-card-year>（${esc(c.year)}）</span></p><p class="rs-document-meta"><span data-card-journal>${esc(c.journal)}</span> <span class="rs-core-label"><span data-site-copy="citationCore">${esc(copy.citationCore)}</span>：<span data-card-core>${esc(c.isCore)}</span></span>${note('helpCitation',copy)}</p></header><div class="rs-research-question"><strong data-site-copy="myQuestion">${esc(copy.myQuestion)}</strong><p>${esc(question)}</p></div>`;
        if (editable) html += `<details class="rs-details rs-citation-correction"><summary data-site-copy="editCitation">${esc(copy.editCitation)}</summary><div class="rs-citation-edit">${['authors','year','title','journal'].map(key => `<label for="rs-citation-${key}"><span data-site-copy="citation${key[0].toUpperCase()+key.slice(1)}">${esc(copy['citation'+key[0].toUpperCase()+key.slice(1)])}</span><input id="rs-citation-${key}" class="rs-input" data-citation="${key}" maxlength="600" value="${esc(c[key])}"></label>`).join('')}<label for="rs-citation-core"><span data-site-copy="citationCore">${esc(copy.citationCore)}</span><select id="rs-citation-core" class="rs-input" data-citation="isCore">${['是','否','未知'].map(v => `<option${v === c.isCore ? ' selected' : ''}>${v}</option>`).join('')}</select></label></div></details>`;
        for (const key of Object.keys(labels).filter(key => key !== 'citation')) {
            let body;
            if (key === 'relevance') body = ['borrow','challenge','gap'].map(k => `<div class="rs-relation-item"><strong data-site-copy="relation${k[0].toUpperCase()+k.slice(1)}">${esc(copy['relation'+k[0].toUpperCase()+k.slice(1)])}</strong>${editable ? `<textarea id="rs-edit-${k}" class="rs-input" data-relation="${k}" aria-label="${esc(copy['relation'+k[0].toUpperCase()+k.slice(1)])}" maxlength="7200" rows="3">${esc(card.relevance[k].join('\n'))}</textarea>` : prose(card.relevance[k])}</div>`).join('');
            else if (key === 'verdict' && editable) body = `<textarea id="rs-edit-verdict" class="rs-input" data-verdict aria-label="${esc(copy.cardVerdict)}" maxlength="600" rows="3">${esc(card.verdict)}</textarea>`;
            else body = prose(card[key]);
            html += `<section class="rs-reading-section${['relevance','verdict'].includes(key) ? ' rs-teacher-section' : ''}"><div class="rs-section-heading"><h4 data-site-copy="${labels[key]}">${esc(copy[labels[key]])}</h4>${note(help[key],copy)}${card.sources[key] ? `<span class="rs-source-note"><span data-site-copy="sourceLabel">${esc(copy.sourceLabel)}</span>${note('',copy,'sourceLabel',card.sources[key])}</span>` : ''}</div><div class="rs-section-content">${body}</div></section>`;
        }
        if (context) html += `<p class="rs-error" role="status">${esc(context)}</p>`;
        return html + '</article>';
    }
    function bindNotes(getCopy) {
        let anchor = null, tip = null, pinned = false, timer = 0, sequence = 0;
        function close() {
            clearTimeout(timer);
            if (anchor) { anchor.setAttribute('aria-expanded','false'); anchor.removeAttribute('aria-describedby'); }
            tip?.remove(); anchor = tip = null; pinned = false;
        }
        function place() {
            if (!anchor || !tip) return;
            const r = anchor.getBoundingClientRect();
            if (!anchor.isConnected || !r.width || r.bottom < 0 || r.top > innerHeight) {close();return;}
            const w = tip.getBoundingClientRect().width;
            tip.style.left = Math.max(12,Math.min(innerWidth-w-12,r.left))+'px';
            const h = tip.getBoundingClientRect().height;
            tip.style.top = (r.bottom+h+12 <= innerHeight ? r.bottom+8 : Math.max(12,r.top-h-8))+'px';
        }
        function open(button) {
            clearTimeout(timer);
            if (button !== anchor) {
                close(); anchor = button; tip = document.createElement('div');tip.className='rs-note-popover';tip.id='rs-note-'+(++sequence);tip.setAttribute('role','tooltip');
                // Modal-dialog descendants remain in the top layer, outside scroll clipping.
                (button.closest('dialog') || document.body).append(tip);
                tip.addEventListener('pointerenter',()=>clearTimeout(timer));
                tip.addEventListener('pointerleave',later);
            }
            tip.textContent = button.dataset.noteText || getCopy()[button.dataset.researchNote] || '';
            button.setAttribute('aria-describedby',tip.id); button.setAttribute('aria-expanded','true'); place();
        }
        function later() { if (!pinned && document.activeElement !== anchor) {clearTimeout(timer);timer=setTimeout(close,160);} }
        document.addEventListener('pointerover',event=>{const b=event.target.closest('[data-research-note]');if(b && event.pointerType !== 'touch')open(b);});
        document.addEventListener('pointerout',event=>{if(event.target.closest('[data-research-note]') && !event.relatedTarget?.closest('.rs-note-popover'))later();});
        document.addEventListener('focusin',event=>{const b=event.target.closest('[data-research-note]');if(b)open(b);else if(!pinned)close();});
        document.addEventListener('focusout',later);
        document.addEventListener('click',event=>{const b=event.target.closest('[data-research-note]');if(b){if(anchor===b && pinned)close();else{open(b);pinned=true;}}else if(!event.target.closest('.rs-note-popover'))close();});
        document.addEventListener('keydown',event=>{if(event.key==='Escape' && anchor){event.preventDefault();event.stopPropagation();close();}},true);
        window.addEventListener('scroll',place,true);window.addEventListener('resize',place);
        return {close,refresh(){document.querySelectorAll('[data-research-note]').forEach(b=>b.setAttribute('aria-label',getCopy()[b.dataset.noteLabel || 'noteLabel']));if(anchor)open(anchor);}};
    }
    root.ResearchPresentation = {note,items,prose,cardHTML,bindNotes};
})(globalThis);
