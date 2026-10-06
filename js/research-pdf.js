/* 选择文件后才载入 PDF.js；文件与提取全文不落库。 */
(function (root) {
    let library;
    async function extract(file, { maxPages = 60, maxChars = 60000, onProgress, signal } = {}) {
        if (/\.caj$/i.test(file.name)) throw new Error('知网 .caj 格式无法读取，请在知网下载页选择 PDF');
        if (file.size > 20 * 1024 * 1024) throw new Error('文件超过 20 MB');
        const data = new Uint8Array(await file.arrayBuffer());
        if (new TextDecoder().decode(data.slice(0, 4)) !== '%PDF') throw new Error('不是有效的 PDF 文件');
        library ||= import('/vendor/pdfjs/6.4.299/pdf.min.mjs');
        const pdfjs = await library;
        pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/6.4.299/pdf.worker.min.mjs';
        const task = pdfjs.getDocument({ data, isEvalSupported: false });
        const abort = () => { void task.destroy(); };
        signal?.addEventListener('abort', abort, { once: true });
        try {
            if (signal?.aborted) throw new Error('已停止提取');
            const doc = await task.promise;
            let text = '', pagesRead = 0, truncated = doc.numPages > maxPages;
            for (let n = 1; n <= Math.min(maxPages, doc.numPages); n++) {
                if (signal?.aborted) throw new Error('已停止提取');
                const page = await doc.getPage(n);
                const content = await page.getTextContent();
                const part = content.items.map(i => (i.str || '') + (i.hasEOL ? '\n' : ' ')).join('');
                text = (text + '\n\n' + part).replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/ {2,}/g,' ').replace(/\n{3,}/g,'\n\n').trim();
                pagesRead = n;
                onProgress?.({ pagesRead, pageCount: doc.numPages, charCount: text.length });
                page.cleanup();
                if (text.length >= maxChars) {
                    truncated ||= text.length > maxChars || n < doc.numPages;
                    let end = maxChars;
                    if (/[\uD800-\uDBFF]/.test(text[end-1] || '')) end--;
                    text = text.slice(0,end);
                    break;
                }
            }
            return { text, pageCount: doc.numPages, pagesRead, charCount: text.length, truncated, scanned: text.replace(/\s/g,'').length < 200 };
        } finally {
            signal?.removeEventListener('abort', abort);
            await task.destroy();
        }
    }
    root.ResearchPdf = { extract };
})(globalThis);
