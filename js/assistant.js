(() => {
    const FALLBACK_TOOLS = [
        { name: 'AI好记', desc: '分析优质公开课，智能总结课程精华', url: 'tools.html', category: 'teaching' },
        { name: '快出题', desc: '智能生成试题，快速组卷', url: 'tools.html', category: 'teaching' },
        { name: 'Gamma', desc: '一键生成 PPT', url: 'tools.html', category: 'creation' },
        { name: '飞象老师', desc: '生成教学动画和微课视频', url: 'tools.html', category: 'creation' },
        { name: '秘塔搜索', desc: '辅助资料检索和知识库建设', url: 'tools.html', category: 'search' }
    ];
    const QUICK_QUESTIONS = [
        'AI 可以怎样帮我备一节课？',
        '推荐几个适合出题和组卷的工具',
        '怎样用 AI 做课件和课堂素材？',
        '如何写一个好用的教学提示词？'
    ];

    let assistantPanel;
    let assistantMessages;
    let assistantInput;
    let contactModal;
    let contactForm;

    function getTools() {
        try {
            return typeof DEFAULT_TOOLS !== 'undefined' ? DEFAULT_TOOLS : FALLBACK_TOOLS;
        } catch {
            return FALLBACK_TOOLS;
        }
    }

    function getPrompts() {
        try {
            return typeof DEFAULT_PROMPTS !== 'undefined' ? DEFAULT_PROMPTS : [];
        } catch {
            return [];
        }
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function toast(message) {
        if (typeof showToast === 'function') {
            showToast(message);
            return;
        }
        let node = document.getElementById('site-toast');
        if (!node) {
            node = document.createElement('div');
            node.id = 'site-toast';
            node.className = 'toast';
            document.body.appendChild(node);
        }
        node.textContent = message;
        node.classList.add('show');
        setTimeout(() => node.classList.remove('show'), 2200);
    }

    function getCurrentUser() {
        try {
            if (typeof Auth !== 'undefined') return Auth.getCurrentUser();
        } catch {
            return null;
        }
        try {
            return typeof _currentUser !== 'undefined' ? _currentUser : null;
        } catch {
            return null;
        }
    }

    function isAuthReady() {
        try {
            return typeof _authReady !== 'undefined' && _authReady;
        } catch {
            return false;
        }
    }

    function promptRegister() {
        toast('请先注册或登录后再留言');
        if (typeof showAuthModal === 'function') {
            setTimeout(() => showAuthModal('register'), 80);
        }
    }

    function requireRegisteredUser(onReady) {
        const user = getCurrentUser();
        if (user) return user;
        if (typeof onAuthReady === 'function' && !isAuthReady()) {
            toast('正在确认登录状态...');
            onAuthReady(readyUser => {
                if (readyUser) onReady?.(readyUser);
                else promptRegister();
            });
            return null;
        }
        promptRegister();
        return null;
    }

    function requireAssistantLogin(onReady) {
        const user = getCurrentUser();
        if (user) return user;
        if (typeof requireLogin === 'function') {
            return requireLogin(onReady, '请先登录后使用智能助教');
        }
        if (typeof onAuthReady === 'function' && !isAuthReady()) {
            toast('正在确认登录状态...');
            onAuthReady(readyUser => {
                if (readyUser) onReady?.(readyUser);
                else promptRegister();
            });
            return null;
        }
        promptRegister();
        return null;
    }

    function addMessage(content, type = 'bot', html = false) {
        const wrap = document.createElement('div');
        wrap.className = `assistant-message ${type}`;
        const bubble = document.createElement('div');
        bubble.className = 'assistant-bubble';
        if (html) bubble.innerHTML = content;
        else bubble.textContent = content;
        wrap.appendChild(bubble);
        assistantMessages.appendChild(wrap);
        assistantMessages.scrollTop = assistantMessages.scrollHeight;
    }

    function normalize(text) {
        return text.trim().toLowerCase().replace(/\s+/g, '');
    }

    function matchTool(query) {
        const clean = normalize(query);
        return getTools().filter(tool => {
            const haystack = `${tool.name}${tool.desc}${tool.category || ''}`.toLowerCase();
            return clean.includes(tool.name.toLowerCase()) || haystack.includes(clean);
        }).slice(0, 3);
    }

    function findToolsByNames(names) {
        const tools = getTools();
        return names.map(name => tools.find(tool => tool.name.toLowerCase().includes(name.toLowerCase()))).filter(Boolean);
    }

    function toolLinks(tools) {
        if (!tools.length) return '<a href="tools.html">查看 AI资源精选</a>';
        return tools.map(tool => `<a href="${tool.url}" target="_blank" rel="noopener">${escapeHtml(tool.name)}</a>`).join('、');
    }

    function promptByLabel(label) {
        return getPrompts().find(prompt => prompt.label.includes(label));
    }

    function promptBlock(label) {
        const prompt = promptByLabel(label);
        if (!prompt) return '';
        return `<br><br><strong>可直接套用的提示词：</strong><br><span>${escapeHtml(prompt.text)}</span>`;
    }

    function buildScenarioAnswer(query) {
        const clean = normalize(query);
        const scenarios = [
            {
                keys: ['备课', '教案', '导入', '教学设计'],
                title: '备课可以用“三步走”',
                body: `1. 先让 AI 梳理知识点、易错点和教学目标。<br>2. 再让 AI 生成 2-3 个课堂导入或活动方案，你挑最贴近学生的一版。<br>3. 最后请 AI 检查教案中的知识准确性和课堂时间分配。<br><br>推荐工具：${toolLinks(findToolsByNames(['AI好记', 'PrompterHub', 'Prompt123']))}`,
                prompt: '备课助手'
            },
            {
                keys: ['出题', '组卷', '试题', '练习', '作业'],
                title: '出题组卷建议这样做',
                body: `先明确年级、学科、知识点、题型和难度比例，再让 AI 生成基础题、提高题和拓展题。生成后一定抽查答案和解题过程。<br><br>推荐工具：${toolLinks(findToolsByNames(['快出题', 'Prompt123']))}`,
                prompt: '智能出题'
            },
            {
                keys: ['ppt', '课件', '幻灯片', '展示'],
                title: '课件制作可以拆成“结构 + 美化 + 素材”',
                body: `先用 AI 生成课件大纲，再用 Gamma 快速生成 PPT 初稿。重点页建议手动补充真实课堂图片、例题和板书逻辑。需要图片、图标、免抠素材时，可以去 <a href="resources.html">课件素材</a>。<br><br>推荐工具：${toolLinks(findToolsByNames(['Gamma', '即梦AI', 'Nano Banana']))}`
            },
            {
                keys: ['动画', '视频', '微课', '数字人'],
                title: '视频类资源适合用在课前预习和难点讲解',
                body: `抽象概念可以用飞象老师做 3-5 分钟动画；知识点讲解或家长学校内容，可以尝试数字人视频。建议每段只讲一个核心概念，避免太长。<br><br>推荐工具：${toolLinks(findToolsByNames(['飞象老师', '飞影数字人', '即梦AI']))}`
            },
            {
                keys: ['图片', '绘本', '插图', '海报', '素材'],
                title: '图像素材建议先确定使用场景',
                body: `课件配图可以先找真实照片；故事、绘本和活动海报可以用 AI 生成系列图。做公开发布前，注意检查平台版权协议和人物肖像问题。<br><br>推荐入口：<a href="resources.html">课件素材</a>；推荐工具：${toolLinks(findToolsByNames(['anygen', 'Nano Banana']))}`
            },
            {
                keys: ['评语', '评价', '反馈', '学生评价'],
                title: '评语最好让 AI 写初稿，你做最后把关',
                body: `把学生的性格特点、学习优势、待改进点和具体事件告诉 AI，它能快速生成温暖、不空泛的初稿。发布前建议改成你自己的语气。`,
                prompt: '学生评语'
            },
            {
                keys: ['家长', '沟通', '通知', '家校'],
                title: '家校沟通要让 AI 帮你把语气“降温”',
                body: `把事实、期待家长配合的事项和希望的语气写清楚，让 AI 先出一版合作导向的话术。敏感问题要再人工调整，避免标签化学生。`,
                prompt: '家长沟通'
            },
            {
                keys: ['搜索', '资料', '知识库', '研究'],
                title: '资料检索可以从“问题清单”开始',
                body: `先列出你要解决的 3-5 个问题，再用搜索或知识库工具找资料。不要直接复制 AI 的结论，最好要求它给出来源线索和可核查依据。<br><br>推荐工具：${toolLinks(findToolsByNames(['秘塔搜索']))}`
            },
            {
                keys: ['提示词', 'prompt', '怎么问', '提问'],
                title: '好提示词可以用这个公式',
                body: `角色 + 任务 + 背景 + 输出格式。<br><br>例如：你是一位有经验的初中语文老师，请为七年级学生设计《春》的课堂导入，要求 5 分钟内完成，包含教师提问和学生可能回应。<br><br>更多模板可以看 <a href="prompts.html">提示词库</a>。`
            },
            {
                keys: ['学习路径', '入门', '怎么学', '新手'],
                title: '新手老师可以从入门路径开始',
                body: `建议先完成“AI 入门基础”，熟悉提示词和常用工具；再进入“AI 教学应用”，把 AI 放进备课、出题、评价、沟通等真实流程。<br><br><a href="paths.html">查看学习路径</a>`
            },
            {
                keys: ['联系', '留言', '反馈', '建议'],
                title: '可以直接给站长留言',
                body: `点击这里打开 <a href="#" data-contact-open>联系我们</a>，写下你的问题、建议或培训需求。`
            }
        ];

        const scenario = scenarios.find(item => item.keys.some(key => clean.includes(key)));
        if (!scenario) return null;
        return `<strong>${scenario.title}</strong><br>${scenario.body}${scenario.prompt ? promptBlock(scenario.prompt) : ''}`;
    }

    function answerQuestion(question) {
        const toolMatches = matchTool(question);
        if (toolMatches.length) {
            return `<strong>我找到了相关工具：</strong><br>${toolMatches.map(tool => `• <a href="${tool.url}" target="_blank" rel="noopener">${escapeHtml(tool.name)}</a>：${escapeHtml(tool.desc)}`).join('<br>')}<br><br>使用建议：先用一个真实教学任务试跑，再把效果好的提示词保存到你的个人模板里。`;
        }

        const scenario = buildScenarioAnswer(question);
        if (scenario) return scenario;

        return `<strong>可以从一个具体教学任务开始。</strong><br>你可以把问题改成：“我要为[年级][学科][主题]完成[备课/出题/课件/评价]，应该怎么用 AI？”<br><br>常用入口：<a href="paths.html">学习路径</a>、<a href="tools.html">AI资源精选</a>、<a href="prompts.html">提示词库</a>。`;
    }

    function sendQuestion(question) {
        if (!requireAssistantLogin(() => sendQuestion(question))) return;
        const text = question.trim();
        if (!text) return;
        addMessage(text, 'user');
        assistantInput.value = '';
        setTimeout(() => addMessage(answerQuestion(text), 'bot', true), 220);
    }

    function openAssistant() {
        if (!requireAssistantLogin(() => openAssistant())) return;
        assistantPanel.classList.add('open');
        assistantPanel.setAttribute('aria-hidden', 'false');
        setTimeout(() => assistantInput.focus(), 80);
    }

    function closeAssistant() {
        assistantPanel.classList.remove('open');
        assistantPanel.setAttribute('aria-hidden', 'true');
    }

    function buildAssistant() {
        const launcher = document.createElement('button');
        launcher.className = 'assistant-launcher';
        launcher.type = 'button';
        launcher.setAttribute('aria-label', '打开智能助教');
        launcher.innerHTML = `
            <span class="assistant-launcher-label"><strong>智能助教</strong><span>点我问 AI 教学</span></span>
            <span class="assistant-mascot" aria-hidden="true">
                <span class="mascot-ear mascot-ear-left"></span>
                <span class="mascot-ear mascot-ear-right"></span>
                <span class="mascot-tail"></span>
                <span class="mascot-screen">
                    <span class="mascot-eye mascot-eye-left"></span>
                    <span class="mascot-eye mascot-eye-right"></span>
                    <span class="mascot-nose"></span>
                    <span class="mascot-mouth"></span>
                </span>
                <span class="mascot-antenna"></span>
            </span>`;

        assistantPanel = document.createElement('aside');
        assistantPanel.className = 'assistant-panel';
        assistantPanel.setAttribute('aria-hidden', 'true');
        assistantPanel.innerHTML = `
            <div class="assistant-panel-head">
                <div class="assistant-mini" aria-hidden="true">
                    <span class="assistant-mini-ear left"></span>
                    <span class="assistant-mini-ear right"></span>
                    <span class="assistant-mini-face"></span>
                </div>
                <div>
                    <div class="assistant-panel-title">AI 教学助教</div>
                    <div class="assistant-panel-subtitle">回答 AI 教学应用与工具选择问题</div>
                </div>
                <div class="assistant-head-actions">
                    <button type="button" class="assistant-icon-button" data-open-contact aria-label="联系我们"><i class="ph ph-envelope-simple"></i></button>
                    <button type="button" class="assistant-icon-button" data-close-assistant aria-label="关闭"><i class="ph ph-x"></i></button>
                </div>
            </div>
            <div class="assistant-messages"></div>
            <div class="assistant-suggestions">
                ${QUICK_QUESTIONS.map(q => `<button type="button" class="assistant-chip" data-question="${escapeHtml(q)}">${escapeHtml(q)}</button>`).join('')}
            </div>
            <div class="assistant-composer">
                <textarea class="assistant-input" rows="1" placeholder="问问 AI 教学、工具选择或提示词..."></textarea>
                <button type="button" class="assistant-send" aria-label="发送"><i class="ph ph-paper-plane-tilt"></i></button>
            </div>`;

        document.body.appendChild(launcher);
        document.body.appendChild(assistantPanel);
        assistantMessages = assistantPanel.querySelector('.assistant-messages');
        assistantInput = assistantPanel.querySelector('.assistant-input');

        addMessage('你好，我是你的 AI 教学助教。你可以问我：AI 怎样帮我备课、出题、做课件，或者哪个工具更适合某个教学任务。', 'bot');
        launcher.addEventListener('click', openAssistant);
        assistantPanel.querySelector('[data-close-assistant]').addEventListener('click', closeAssistant);
        assistantPanel.querySelector('[data-open-contact]').addEventListener('click', () => openContactModal());
        assistantPanel.querySelector('.assistant-send').addEventListener('click', () => sendQuestion(assistantInput.value));
        assistantPanel.querySelectorAll('[data-question]').forEach(button => {
            button.addEventListener('click', () => sendQuestion(button.dataset.question || ''));
        });
        assistantMessages.addEventListener('click', event => {
            if (event.target.closest('[data-contact-open]')) {
                event.preventDefault();
                openContactModal();
            }
        });
        assistantInput.addEventListener('keydown', event => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendQuestion(assistantInput.value);
            }
        });
    }

    function buildContactModal() {
        contactModal = document.createElement('div');
        contactModal.className = 'contact-modal';
        contactModal.setAttribute('aria-hidden', 'true');
        contactModal.innerHTML = `
            <div class="contact-box" role="dialog" aria-modal="true" aria-labelledby="contact-title">
                <div class="contact-head">
                    <i class="ph-fill ph-envelope-simple" style="font-size:28px;color:#0f766e"></i>
                    <div>
                        <h3 id="contact-title">联系我们</h3>
                        <p>欢迎留下建议、问题或培训需求</p>
                    </div>
                    <button type="button" class="contact-close" aria-label="关闭">×</button>
                </div>
                <form class="contact-form" name="contact" method="POST">
                    <input type="hidden" name="form-name" value="contact">
                    <p style="display:none"><label>不要填写：<input name="bot-field"></label></p>
                    <input type="hidden" name="userId" value="">
                    <div class="contact-grid">
                        <div>
                            <label for="contact-name">姓名</label>
                            <input id="contact-name" name="name" type="text" placeholder="您的姓名">
                        </div>
                        <div>
                            <label for="contact-way">联系方式</label>
                            <input id="contact-way" name="contact" type="text" placeholder="邮箱 / 手机 / 微信">
                        </div>
                    </div>
                    <div style="margin-top:14px">
                        <label for="contact-message">留言内容 *</label>
                        <textarea id="contact-message" name="message" required placeholder="请写下您想交流的问题、资源建议或培训需求"></textarea>
                    </div>
                    <input type="hidden" name="page" value="${escapeHtml(location.href)}">
                    <p class="contact-note">提交后管理员可在后台查看您的留言并尽快回复。</p>
                    <div class="contact-actions">
                        <button type="button" class="contact-secondary">取消</button>
                        <button type="submit" class="contact-submit">提交留言</button>
                    </div>
                </form>
            </div>`;
        document.body.appendChild(contactModal);
        contactForm = contactModal.querySelector('.contact-form');

        contactModal.addEventListener('click', event => {
            if (event.target === contactModal) closeContactModal();
        });
        contactModal.querySelector('.contact-close').addEventListener('click', closeContactModal);
        contactModal.querySelector('.contact-secondary').addEventListener('click', closeContactModal);
        contactForm.addEventListener('submit', submitContact);
    }

    function prefillContactForm(user) {
        if (!contactForm || !user) return;
        const contactValue = user.email || user.phone || '';
        if (contactForm.elements.name && !contactForm.elements.name.value) {
            contactForm.elements.name.value = user.name || '';
        }
        if (contactForm.elements.contact && !contactForm.elements.contact.value) {
            contactForm.elements.contact.value = contactValue;
        }
        if (contactForm.elements.userId) contactForm.elements.userId.value = user.uid || '';
        if (contactForm.elements.page) contactForm.elements.page.value = location.href;
    }

    function openContactModal() {
        const user = requireRegisteredUser(() => openContactModal());
        if (!user) return;
        if (!contactModal) buildContactModal();
        prefillContactForm(user);
        contactModal.classList.add('open');
        contactModal.setAttribute('aria-hidden', 'false');
        setTimeout(() => contactModal.querySelector('#contact-name')?.focus(), 80);
    }

    function closeContactModal() {
        if (!contactModal) return;
        contactModal.classList.remove('open');
        contactModal.setAttribute('aria-hidden', 'true');
    }

    async function submitContact(event) {
        event.preventDefault();
        const user = getCurrentUser();
        if (!user) {
            closeContactModal();
            promptRegister();
            return;
        }
        prefillContactForm(user);
        const message = contactForm.message.value.trim();
        if (!message) {
            toast('请先填写留言内容');
            contactForm.message.focus();
            return;
        }

        const submitButton = contactForm.querySelector('.contact-submit');
        submitButton.disabled = true;
        submitButton.textContent = '提交中...';
        try {
            const data = Object.fromEntries(new FormData(contactForm).entries());
            await db.collection('contact_messages').add({
                name: data.name || user.name || '',
                contact: data.contact || user.email || user.phone || '',
                message,
                page: data.page || location.href,
                userId: user.uid || '',
                userEmail: user.email || '',
                userPhone: user.phone || '',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                handled: false
            });
            contactForm.reset();
            closeContactModal();
            toast('留言已提交，感谢您的反馈');
        } catch (error) {
            toast('提交失败，请稍后再试');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = '提交留言';
        }
    }

    window.openContactModal = openContactModal;
    window.closeContactModal = closeContactModal;
    globalThis.openContactModal = openContactModal;
    globalThis.closeContactModal = closeContactModal;

    document.addEventListener('DOMContentLoaded', () => {
        buildAssistant();
        buildContactModal();
    });

    document.addEventListener('click', event => {
        if (!event.target.closest('[data-contact-trigger]')) return;
        event.preventDefault();
        openContactModal();
    });
})();
