/* 生成响应必须包含明确的完成事件；部分文字永不等同于完成。 */
(function (root) {
    async function request({ payload, signal, onToken, onResponse, firstTimeout = 90000, idleTimeout = 60000 }) {
        const controller = new AbortController();
        let timer, reader, full = '', completed = false;
        const abort = () => controller.abort(signal?.reason || new Error('已停止生成'));
        const arm = ms => {
            clearTimeout(timer);
            timer = setTimeout(() => controller.abort(new Error('等待生成超时，请稍后重试')), ms);
        };
        if (signal?.aborted) abort();
        else signal?.addEventListener('abort', abort, { once: true });
        try {
            arm(firstTimeout);
            const response = await fetch('/api/agent', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...payload, streamProtocol: 'events-v1' }), signal: controller.signal
            });
            if (!response.ok || !response.body) {
                const data = await response.json().catch(() => ({}));
                const error = new Error(data.msg || `请求失败（${response.status}）`);
                if (data.curriculum) error.curriculum = data.curriculum;
                throw error;
            }
            if (!response.headers.get('Content-Type')?.includes('application/x-ndjson')) {
                throw new Error('生成服务版本不一致，请保存当前内容后刷新重试');
            }
            onResponse?.(response);
            reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            const consume = line => {
                if (!line.trim()) return;
                const event = JSON.parse(line);
                if (event.type === 'delta' && typeof event.text === 'string') {
                    full += event.text;
                    onToken?.(full);
                } else if (event.type === 'done') completed = true;
                else if (event.type === 'error') throw new Error(event.message || '生成中断，请重试');
                else throw new Error('生成响应格式异常，请重试');
            };
            while (!completed) {
                arm(idleTimeout);
                const { value, done } = await reader.read();
                buffer += decoder.decode(value, { stream: !done });
                const lines = buffer.split('\n');
                buffer = lines.pop();
                for (const line of lines) consume(line);
                if (done) { if (buffer.trim()) consume(buffer); break; }
            }
            if (!completed) throw new Error('连接提前结束，内容尚未生成完整');
            if (!full.trim()) throw new Error('模型没有返回内容，请稍后重试');
            return full;
        } catch (cause) {
            const error = controller.signal.aborted ? new Error(controller.signal.reason?.message || '已停止生成') : cause;
            error.partial = full;
            error.cancelled = !!signal?.aborted;
            throw error;
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', abort);
            await reader?.cancel().catch(() => {});
            controller.abort();
        }
    }
    root.AgentStream = { request };
})(globalThis);
