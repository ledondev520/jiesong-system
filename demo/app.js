/**
 * 捷淞进销存系统 - Demo交互逻辑
 * 功能：页面切换、AI助手交互、表单处理
 */

document.addEventListener('DOMContentLoaded', () => {
    // === 登录逻辑 ===
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const btn = loginForm.querySelector('button');
            const originalText = btn.innerText;
            btn.innerText = '登录中...';
            btn.disabled = true;
            
            // 模拟登录延迟
            setTimeout(() => {
                document.getElementById('login-page').classList.add('hidden');
                document.getElementById('main-app').classList.remove('hidden');
                btn.innerText = originalText;
                btn.disabled = false;
            }, 800);
        });
    }

    // === 退出登录 ===
    document.getElementById('logout-btn')?.addEventListener('click', () => {
        if(confirm('确定要退出系统吗？')) {
            document.getElementById('main-app').classList.add('hidden');
            document.getElementById('login-page').classList.remove('hidden');
            // 重置到首页
            document.querySelector('[data-page="dashboard"]').click();
        }
    });

    // === 侧边栏导航 ===
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            
            // 移除所有激活状态
            navItems.forEach(i => i.classList.remove('active'));
            // 激活当前项
            item.classList.add('active');
            
            // 页面切换
            const pageId = item.dataset.page;
            document.querySelectorAll('.page-content').forEach(page => {
                page.classList.add('hidden');
            });
            
            const targetPage = document.getElementById(`page-${pageId}`);
            if (targetPage) {
                targetPage.classList.remove('hidden');
            } else {
                // 如果页面不存在（开发中），显示Dashboard或占位
                document.getElementById('page-dashboard').classList.remove('hidden');
            }
            
            // 移动端收起侧边栏
            if (window.innerWidth <= 768) {
                document.querySelector('.sidebar').classList.remove('open');
            }
        });
    });

    // === 页面内链接跳转 ===
    document.querySelectorAll('[data-page]').forEach(link => {
        if (!link.classList.contains('nav-item')) { // 排除导航项，避免重复绑定
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const pageId = link.dataset.page;
                // 找到对应的导航项并点击，以保持状态同步
                const navItem = document.querySelector(`.nav-item[data-page="${pageId}"]`);
                if (navItem) navItem.click();
            });
        }
    });

    // === AI助手交互 ===
    const aiBtn = document.getElementById('ai-btn');
    const aiChat = document.getElementById('ai-chat');
    const closeChat = document.getElementById('close-chat');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.querySelector('.send-btn');
    const messagesContainer = document.getElementById('chat-messages');

    // 切换窗口
    aiBtn?.addEventListener('click', () => {
        aiChat.classList.toggle('hidden');
        if (!aiChat.classList.contains('hidden')) {
            setTimeout(() => chatInput.focus(), 100);
        }
    });

    closeChat?.addEventListener('click', () => {
        aiChat.classList.add('hidden');
    });

    // 发送消息
    function sendMessage() {
        const text = chatInput.value.trim();
        if (!text) return;

        // 添加用户消息
        addMessage(text, 'user');
        chatInput.value = '';

        // 模拟AI思考和回复
        showTyping();
        
        setTimeout(() => {
            removeTyping();
            const reply = getAIReply(text);
            addMessage(reply, 'ai');
        }, 1000 + Math.random() * 1000);
    }

    sendBtn?.addEventListener('click', sendMessage);
    chatInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    // 快捷提示词
    document.querySelectorAll('.prompt-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            chatInput.value = btn.innerText;
            sendMessage();
        });
    });

    function addMessage(text, type) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${type}`;
        
        const avatar = type === 'ai' ? '🤖' : '👤';
        
        msgDiv.innerHTML = `
            <div class="message-avatar">${avatar}</div>
            <div class="message-content">
                ${text}
            </div>
        `;
        
        messagesContainer.appendChild(msgDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function showTyping() {
        const typingDiv = document.createElement('div');
        typingDiv.id = 'typing-indicator';
        typingDiv.className = 'message ai';
        typingDiv.innerHTML = `
            <div class="message-avatar">🤖</div>
            <div class="message-content" style="color: #999;">
                思考中...
            </div>
        `;
        messagesContainer.appendChild(typingDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function removeTyping() {
        const typing = document.getElementById('typing-indicator');
        if (typing) typing.remove();
    }

    function getAIReply(text) {
        // 简单的关键词匹配模拟AI回复
        if (text.includes('库存') || text.includes('多少')) {
            return '<p>当前系统库存总数为 <strong>156</strong> 件。</p><ul><li>瓷砖 800*800: 500㎡</li><li>不锈钢门: 10套</li><li>火锅桌: 25张</li></ul>';
        }
        if (text.includes('采购') || text.includes('合同')) {
            return '<p>本月共签订采购合同 <strong>5</strong> 份，总金额 <strong>¥128.5万</strong>。</p><p>最近一份是与黎总签订的瓷砖采购。</p>';
        }
        if (text.includes('售价') || text.includes('计算')) {
            return '<p>根据公式：采购价 ÷ (6.8 - 0.2) × 1.3</p><p>如果您采购价是 ¥100，建议售价为 <strong>$19.69</strong></p>';
        }
        return '收到您的请求。在实际系统中，我会调用Kimi API来分析您的具体业务数据并给出准确回答。';
    }

    // === AI辅助录入模态框 ===
    const aiInputBtn = document.getElementById('ai-input-btn');
    const modal = document.getElementById('ai-input-modal');
    const modalCloseBtns = document.querySelectorAll('.modal-close');
    const aiParseBtn = document.getElementById('ai-parse-btn');

    aiInputBtn?.addEventListener('click', () => {
        modal.classList.remove('hidden');
    });

    modalCloseBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
    });

    aiParseBtn?.addEventListener('click', () => {
        const btn = aiParseBtn;
        const originalText = btn.innerText;
        btn.innerText = '🤖 解析中...';
        btn.disabled = true;

        // 模拟解析过程
        setTimeout(() => {
            modal.classList.add('hidden');
            btn.innerText = originalText;
            btn.disabled = false;
            
            // 填充表单（模拟）
            alert('解析成功！已自动填充商品明细：\n- 瓷砖 800*800\n- 数量：500平方米\n- 单价：78元');
            
            // 这里可以添加实际填充表单的逻辑
            const firstRow = document.querySelector('.table-row');
            if (firstRow) {
                firstRow.querySelector('.col-product').value = '瓷砖';
                firstRow.querySelector('.col-spec').value = '800*800';
                firstRow.querySelector('.col-qty').value = '500';
                firstRow.querySelector('.col-price').value = '78';
                firstRow.querySelector('.col-total').innerText = '39,000';
                document.querySelector('.total-amount').innerText = '¥39,000.00';
            }
        }, 1500);
    });

    // === 动态计算小计 ===
    document.addEventListener('input', (e) => {
        if (e.target.matches('.col-qty') || e.target.matches('.col-price')) {
            const row = e.target.closest('.table-row');
            const qty = parseFloat(row.querySelector('.col-qty').value) || 0;
            const price = parseFloat(row.querySelector('.col-price').value) || 0;
            const total = qty * price;
            
            row.querySelector('.col-total').innerText = total.toLocaleString();
            
            // 更新总计
            updateTotal();
        }
    });

    function updateTotal() {
        let sum = 0;
        document.querySelectorAll('.table-row').forEach(row => {
            const txt = row.querySelector('.col-total').innerText.replace(/,/g, '');
            sum += parseFloat(txt) || 0;
        });
        document.querySelector('.total-amount').innerText = '¥' + sum.toLocaleString(undefined, {minimumFractionDigits: 2});
    }

    // === 添加/删除商品行 ===
    const addItemBtn = document.getElementById('add-item-btn');
    const itemsList = document.getElementById('items-list');

    addItemBtn?.addEventListener('click', () => {
        const newRow = document.createElement('div');
        newRow.className = 'table-row';
        newRow.innerHTML = `
            <input type="text" class="col-product" placeholder="商品名称">
            <input type="text" class="col-spec" placeholder="规格">
            <input type="number" class="col-qty" placeholder="0">
            <select class="col-unit">
                <option>平方米</option>
                <option>件</option>
                <option>个</option>
            </select>
            <input type="number" class="col-price" placeholder="0">
            <span class="col-total">0</span>
            <button type="button" class="btn-icon-sm danger">✕</button>
        `;
        itemsList.appendChild(newRow);
        
        // 绑定删除事件
        newRow.querySelector('.danger').addEventListener('click', function() {
            this.closest('.table-row').remove();
            updateTotal();
        });
    });

    // 初始绑定现有删除按钮
    document.querySelectorAll('.btn-icon-sm.danger').forEach(btn => {
        btn.addEventListener('click', function() {
            this.closest('.table-row').remove();
            updateTotal();
        });
    });
    
    // 状态筛选切换
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
        });
    });
});
