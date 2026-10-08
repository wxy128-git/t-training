/* 可在浏览器与 Node 中运行的科研工具纯函数。 */
(function (root) {
    const FOCUS = '## 研究问题聚焦结果', TITLES = '## 五种结构的标题';
    const KEYS = ['citation','question','sample','method','viewpoints','findings','keyReferences','limitations','relevance','verdict','sources','unclear'];
    const SOURCE_KEYS = ['question','sample','method','viewpoints','findings','keyReferences','limitations'];
    const LABELS = ['文献信息','研究问题','对象与情境','研究方法','核心观点','主要结论','关键引用','局限','与我的研究的关系','一句话评价'];
    const MISSING = '原文未明确';
    function truncateText(text, max = 60000) {
        text = String(text || '');
        let end = Math.max(0, max);
        if (text.length > end && /[\uD800-\uDBFF]/.test(text[end - 1] || '')) end--;
        return { text: text.slice(0, end), truncated: text.length > max };
    }
    const clean = v => truncateText(typeof v === 'string' ? v.replace(/[\r\n]+/g, ' ').trim() : '', 600).text;
    const list = v => Array.isArray(v) ? v.map(clean).filter(Boolean).slice(0, 12) : [];
    const object = v => v && typeof v === 'object' && !Array.isArray(v);
    function detectFunnelPhase(history = []) {
        const assistants = history.filter(h => h.role === 'assistant');
        const round = assistants.filter(h => !h.content.includes(FOCUS) && !h.content.includes(TITLES)).length;
        const latest = assistants.at(-1)?.content || '';
        const phase = latest.includes(TITLES) ? 'titles'
            : latest.includes(FOCUS) ? 'focused'
            : history.some(h => h.role === 'user') ? 'probing' : 'start';
        return { phase, round };
    }
    function extractFunnelResult(history = []) {
        let focus = '', titles = '';
        for (const h of history.filter(h => h.role === 'assistant')) {
            const f = h.content.indexOf(FOCUS), t = h.content.indexOf(TITLES);
            if (f >= 0) { focus = h.content.slice(f, t > f ? t : undefined).trim(); titles = ''; }
            if (t >= 0) titles = h.content.slice(t).trim();
        }
        const question = focus.match(/研究问题[（(]疑问句[）)][*]*[：:][*]*\s*(.+)/)?.[1]?.replace(/\*\*/g, '').trim() || '';
        return { focus, titles, question };
    }
    function buildFunnelMessages(system, history) {
        let selected = history;
        if (history.length > 29) {
            // Reserve anchors for the original concern and latest focus, plus recent exchanges.
            const indices = new Set(Array.from({length:27}, (_, i) => history.length - 27 + i));
            const first = history.findIndex(h => h.role === 'user');
            const focus = history.findLastIndex(h => h.role === 'assistant' && h.content.includes(FOCUS));
            if (first >= 0) indices.add(first);
            if (focus >= 0) indices.add(focus);
            selected = [...indices].sort((a,b) => a-b).map(i => history[i]);
        }
        return [{ role: 'system', content: system }, ...selected.map(({role, content}) => ({ role, content }))];
    }
    function parseReadingCard(raw) {
        let data;
        try {
            const text = String(raw).replace(/```(?:json)?/gi, '').replace(/```/g, '');
            data = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
            if (!object(data)) return null;
        } catch { return null; }
        const warnings = new Set(), card = {};
        const missing = key => { warnings.add(key); return MISSING; };
        const str = (v, key) => clean(v) || missing(key);
        for (const key of KEYS) {
            if (key === 'citation') {
                const c = object(data.citation) ? data.citation : {};
                card.citation = Object.fromEntries(['authors','year','title','journal'].map(k => [k, str(c[k], key)]));
                const value = clean(c.isCore);
                card.citation.isCore = /非|否/.test(value) ? '否' : /是|核心/.test(value) ? '是' : '未知';
                if (!value) warnings.add(key);
            } else if (['question','sample','method','verdict'].includes(key)) card[key] = str(data[key], key);
            else if (key === 'sources') {
                const s = object(data.sources) ? data.sources : {};
                card.sources = Object.fromEntries(SOURCE_KEYS.map(k => [k, str(s[k], key)]));
            } else if (key === 'relevance') {
                const r = object(data.relevance) ? data.relevance : {};
                card.relevance = Object.fromEntries(['borrow','challenge','gap'].map(k => {
                    if (!Array.isArray(r[k])) warnings.add(key);
                    return [k, list(r[k])];
                }));
            } else {
                if (!Array.isArray(data[key])) warnings.add(key);
                card[key] = list(data[key]);
            }
        }
        card.unclear = [...new Set([...card.unclear.filter(k => KEYS.includes(k)), ...warnings])];
        return { card, warnings: [...warnings] };
    }
    const joined = v => Array.isArray(v) ? (v.join('；') || MISSING) : String(v || MISSING);
    function citationText(c) { return `${c.authors}（${c.year}）${c.title} · ${c.journal} · ${c.isCore === '是' ? '核心' : c.isCore === '否' ? '非核心' : '未知'}`; }
    function cardRows(card) {
        const values = [citationText(card.citation), card.question, card.sample, card.method, ...['viewpoints','findings','keyReferences','limitations'].map(k => joined(card[k])),
            ['borrow','challenge','gap'].map((k,i) => `${['可借鉴','可质疑','留下的空白'][i]}：${joined(card.relevance[k])}`).join('；'), card.verdict];
        const keys = ['citation','question','sample','method','viewpoints','findings','keyReferences','limitations','relevance','verdict'];
        return LABELS.map((label,i) => ({ label, key: keys[i], value: values[i], source: card.unclear.includes(keys[i]) ? '未给出' : card.sources[keys[i]] || '教师核对 / 改写' }));
    }
    const md = v => String(v).replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
    function cardToMarkdown(card, { question = '' } = {}) {
        return `# 精读卡：${md(card.citation.authors)}（${md(card.citation.year)}）${md(card.citation.title)}\n\n我的研究问题：${md(question)}\n\n| 栏目 | 内容 | 依据位置 |\n| --- | --- | --- |\n${cardRows(card).map(r => `| ${r.label} | ${md(r.value)} | ${md(r.source)} |`).join('\n')}`;
    }
    const CSV_HEADERS = ['序号','作者','年份','题目','期刊','核心期刊','研究问题','对象与情境','研究方法','核心观点','主要结论','关键引用','局限','可借鉴','可质疑','留下的空白','一句话评价','我的研究问题','保存时间'];
    function savedDate(value) {
        if (value?.toDate) value = value.toDate();
        else if (value?.seconds) value = new Date(value.seconds * 1000);
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? '' : d.toISOString();
    }
    function cardCells(work, index = 0) {
        const raw = work.inputs?._card;
        const parsed = object(raw) ? parseReadingCard(JSON.stringify(raw)) : null;
        const c = parsed?.card;
        if (!c) return [index+1, '', '', work.title || '', '', '', '', '', '', '', '', '', '', '', '', '', '结构化数据缺失', work.inputs?._researchQuestion || '', savedDate(work.createdAt)];
        return [index+1, c.citation.authors, c.citation.year, c.citation.title, c.citation.journal, c.citation.isCore,
            c.question, c.sample, c.method, joined(c.viewpoints), joined(c.findings), joined(c.keyReferences), joined(c.limitations),
            joined(c.relevance.borrow), joined(c.relevance.challenge), joined(c.relevance.gap), c.verdict, work.inputs?._researchQuestion || '', savedDate(work.createdAt)];
    }
    function csvCell(value) {
        let s = String(value ?? '');
        // 避免教师编辑的文本被 Excel 当成公式执行。
        if (/^[\s]*[=+\-@]/.test(s)) s = "'" + s;
        return /[,"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    function cardsToCsv(works) { return '\uFEFF' + [CSV_HEADERS, ...works.map(cardCells)].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'; }
    function cardToTsv(card, question = '') {
        return cardCells({inputs:{_card:card,_researchQuestion:question}}, 0).map(v => {
            const s = String(v).replace(/[\t\r\n]+/g,' ');
            return /^[\s]*[=+\-@]/.test(s) ? "'"+s : s;
        }).join('\t');
    }
    function extractTitles(text) {
        const values = text.split('\n').filter(l => /^\s*\|\s*(问题式|关系式|机制式|路径式|对比式)\s*\|/.test(l)).map(l => l.split('|')[2]?.trim());
        return values.length === 5 && values.every(Boolean) ? values : null;
    }
    function checkFunnelTitles(text) {
        const titles = extractTitles(text), issues = [];
        const structures = text.split('\n').filter(l => /^\s*\|\s*(问题式|关系式|机制式|路径式|对比式)\s*\|/.test(l)).map(l => l.split('|')[1].trim());
        if (!titles || structures.join(',') !== '问题式,关系式,机制式,路径式,对比式') issues.push('请核对五种结构是否齐全且顺序正确');
        if (titles) titles.forEach((title, i) => {
            const plain = title.replace(/\*\*|`/g,'').trim();
            if (!plain.endsWith('研究')) issues.push(`第 ${i+1} 个题名应以“研究”结尾`);
            if ([...plain].length > 30) issues.push(`第 ${i+1} 个题名超过 30 字`);
            if (/^基于/.test(plain)) issues.push(`第 ${i+1} 个题名需改为更具体的表达`);
        });
        return { valid: issues.length === 0, titles, issues };
    }
    root.ResearchCore = { detectFunnelPhase, extractFunnelResult, buildFunnelMessages, checkFunnelTitles, parseReadingCard, cardRows, cardToMarkdown, cardsToCsv, cardToTsv, truncateText, extractTitles, citationText, savedDate, CSV_HEADERS };
})(globalThis);
