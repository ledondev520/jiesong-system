/**
 * 捷淞进销存系统 - Demo交互逻辑
 * 适配风格：极简黑白灰 (Linear/Notion Style)
 */

document.addEventListener('DOMContentLoaded', () => {
    // === 核心功能函数 ===
    
    // 显示 Toast 提示
    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = 'toast';
        
        let icon = '✨';
        if (type === 'success') icon = '✓';
        if (type === 'error') icon = '✕';
        if (type === 'loading') icon = '⟳';

        toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
        container.appendChild(toast);

        // 3秒后自动消失
        setTimeout(() => {
            toast.classList.add('hidden');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // 格式化金额
    function formatMoney(amount) {
        return '¥' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    // === 登录逻辑 ===
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const btn = loginForm.querySelector('button');
            const originalText = btn.innerText;
            btn.innerText = 'Signing in...';
            btn.style.opacity = '0.7';
            
            setTimeout(() => {
                document.getElementById('login-page').classList.add('hidden');
                document.getElementById('main-app').classList.remove('hidden');
                showToast('登录成功', 'success');
                // 默认选中 Dashboard
                document.querySelector('.nav-item[data-page="dashboard"]').click();
            }, 800);
        });
    }

    // === 退出登录 ===
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if(confirm('Confirm logout?')) {
                document.getElementById('main-app').classList.add('hidden');
                document.getElementById('login-page').classList.remove('hidden');
                showToast('已安全退出');
            }
        });
    }

    // === 侧边栏导航 ===
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const pageId = item.dataset.page;
            if (!pageId) return;

            // 更新导航状态
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // 切换页面
            document.querySelectorAll('.page-content').forEach(page => {
                page.classList.add('hidden');
            });

            const targetPage = document.getElementById(`page-${pageId}`);
            if (targetPage) {
                targetPage.classList.remove('hidden');
            } else {
                // 如果页面未实现，显示提示并停留在当前页
                showToast(`${item.querySelector('span').innerText} 页面开发中`, 'info');
                // 恢复上一个选中状态（简化处理，暂不回滚DOM状态）
            }
        });
    });

    // === 页面内跳转按钮 ===
    // 绑定所有带有 data-page 属性的按钮
    document.body.addEventListener('click', (e) => {
        // 查找带有 data-page 的元素（可能是按钮本身或其父元素）
        const target = e.target.closest('[data-page]');
        if (target && !target.classList.contains('nav-item')) {
            const pageId = target.dataset.page;
            const navItem = document.querySelector(`.nav-item[data-page="${pageId}"]`);
            if (navItem) {
                navItem.click();
            } else {
                // 如果没有对应的导航项（例如 action-cancel 返回列表），手动切换
                document.querySelectorAll('.page-content').forEach(page => {
                    page.classList.add('hidden');
                });
                const targetContent = document.getElementById(`page-${pageId}`);
                if (targetContent) targetContent.classList.remove('hidden');
            }
        }
    });

    // === 功能按钮反馈 ===
    // 导入数据
    document.querySelectorAll('.action-import').forEach(btn => {
        btn.addEventListener('click', () => {
            showToast('正在打开导入向导...', 'loading');
            setTimeout(() => showToast('请选择 CSV 文件'), 1000);
        });
    });

    // 创建货柜/库存入库 等快捷操作
    document.querySelectorAll('.action-create').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // 如果按钮本身没有 data-page 跳转，则显示提示
            if (!e.target.closest('[data-page]')) {
                showToast('正在初始化创建表单...', 'loading');
            }
        });
    });

    // 列表操作按钮
    document.querySelectorAll('.action-view').forEach(btn => {
        btn.addEventListener('click', () => showToast('正在加载详情...'));
    });
    document.querySelectorAll('.action-edit').forEach(btn => {
        btn.addEventListener('click', () => showToast('进入编辑模式'));
    });

    // 商品查询
    document.querySelectorAll('.action-search').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelector('.search-input').focus();
            showToast('请输入关键词搜索');
        });
    });

    // Tab 切换
    const tabs = document.querySelectorAll('.tab-item');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tab.parentElement.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            showToast(`已筛选: ${tab.innerText}`);
        });
    });

    // === 表单交互 ===
    // 保存/提交
    document.querySelector('.action-save')?.addEventListener('click', () => {
        showToast('草稿保存成功', 'success');
    });

    document.querySelector('.action-submit')?.addEventListener('click', () => {
        showToast('正在提交合同...', 'loading');
        setTimeout(() => {
            showToast('提交成功！', 'success');
            // 返回列表页
            document.querySelector('.nav-item[data-page="purchase"]').click();
        }, 1500);
    });

    // 动态添加商品行
    const addItemBtn = document.getElementById('add-item-btn');
    const itemsList = document.getElementById('items-list');
    
    if (addItemBtn && itemsList) {
        addItemBtn.addEventListener('click', () => {
            const row = document.createElement('tr');
            row.className = 'item-row';
            row.innerHTML = `
                <td><input type="text" class="input-field" placeholder="输入名称"></td>
                <td><input type="text" class="input-field" placeholder="规格"></td>
                <td><input type="number" class="input-field col-qty" placeholder="0"></td>
                <td><input type="text" class="input-field" placeholder="单位"></td>
                <td><input type="number" class="input-field col-price" placeholder="0.00"></td>
                <td class="text-right font-medium col-total">0.00</td>
                <td class="text-right"><button class="btn-icon btn-del text-secondary hover:text-danger">×</button></td>
            `;
            itemsList.appendChild(row);
            // 绑定新行的删除事件
            const delBtn = row.querySelector('.btn-del');
            delBtn.addEventListener('click', () => {
                row.remove();
                updateTotal();
            });
        });
    }

    // 初始删除按钮
    document.querySelectorAll('.btn-del').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.target.closest('tr').remove();
            updateTotal();
        });
    });

    // 自动计算金额
    document.addEventListener('input', (e) => {
        if (e.target.classList.contains('col-qty') || e.target.classList.contains('col-price')) {
            const row = e.target.closest('tr');
            const qty = parseFloat(row.querySelector('.col-qty').value) || 0;
            const price = parseFloat(row.querySelector('.col-price').value) || 0;
            const total = qty * price;
            row.querySelector('.col-total').innerText = total.toFixed(2);
            updateTotal();
        }
    });

    function updateTotal() {
        let sum = 0;
        document.querySelectorAll('.col-total').forEach(el => {
            sum += parseFloat(el.innerText);
        });
        const totalEl = document.getElementById('total-amount');
        if (totalEl) totalEl.innerText = formatMoney(sum);
    }

    // === AI 助手交互 ===
    const aiBtn = document.getElementById('ai-btn');
    const aiPanel = document.getElementById('ai-chat');
    const closeChat = document.getElementById('close-chat');
    const chatInput = document.getElementById('chat-input');
    const chatArea = document.getElementById('chat-messages');

    aiBtn?.addEventListener('click', () => {
        aiPanel.classList.toggle('hidden');
        if (!aiPanel.classList.contains('hidden')) {
            setTimeout(() => chatInput.focus(), 100);
        }
    });

    closeChat?.addEventListener('click', () => {
        aiPanel.classList.add('hidden');
    });

    chatInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && chatInput.value.trim()) {
            const text = chatInput.value.trim();
            
            // 用户消息
            const userMsg = document.createElement('div');
            userMsg.className = 'chat-bubble user';
            userMsg.innerText = text;
            chatArea.appendChild(userMsg);
            
            chatInput.value = '';
            chatArea.scrollTop = chatArea.scrollHeight;

            // 模拟 AI 回复
            setTimeout(() => {
                const aiMsg = document.createElement('div');
                aiMsg.className = 'chat-bubble ai';
                
                if (text.includes('库存') || text.includes('多少')) {
                    aiMsg.innerHTML = '当前库存总计 <strong>42</strong> 种商品。其中瓷砖类库存较低，建议补货。';
                } else if (text.includes('采购')) {
                    aiMsg.innerHTML = '本月采购总额 <strong>¥128.5万</strong>，共签订 5 份合同。';
                } else {
                    aiMsg.innerText = '好的，我记下了。';
                }
                
                chatArea.appendChild(aiMsg);
                chatArea.scrollTop = chatArea.scrollHeight;
            }, 600);
        }
    });

    // === AI 辅助录入弹窗 ===
    const aiInputBtn = document.getElementById('ai-input-btn');
    const aiModal = document.getElementById('ai-input-modal');
    const modalCloseBtns = document.querySelectorAll('.modal-close');
    const aiParseBtn = document.getElementById('ai-parse-btn');

    aiInputBtn?.addEventListener('click', () => {
        aiModal.classList.remove('hidden');
    });

    modalCloseBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            aiModal.classList.add('hidden');
        });
    });

    aiParseBtn?.addEventListener('click', () => {
        const btn = aiParseBtn;
        const originalText = btn.innerText;
        btn.innerText = 'Parsing...';
        
        setTimeout(() => {
            aiModal.classList.add('hidden');
            btn.innerText = originalText;
            showToast('AI 解析成功！数据已填充', 'success');
            
            // 模拟填充第一行
            const firstRow = document.querySelector('.item-row');
            if (firstRow) {
                firstRow.querySelector('input[placeholder="输入名称"]').value = '瓷砖 800*800';
                firstRow.querySelector('input[placeholder="规格"]').value = '800x800mm';
                firstRow.querySelector('.col-qty').value = 500;
                firstRow.querySelector('input[placeholder="单位"]').value = '平米';
                firstRow.querySelector('.col-price').value = 78;
                firstRow.querySelector('.col-total').innerText = '39000.00';
                updateTotal();
            }
        }, 1000);
    });

    // === 设置页交互 ===
    document.querySelectorAll('.toggle-switch').forEach(toggle => {
        toggle.addEventListener('click', () => {
            toggle.classList.toggle('active');
            const state = toggle.classList.contains('active') ? '已开启' : '已关闭';
            showToast(state);
        });
    });

    // === 顶部搜索框 ===
    document.querySelector('.search-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            showToast(`正在搜索: ${e.target.value}...`, 'loading');
            setTimeout(() => {
                showToast(`找到 3 个关于 "${e.target.value}" 的结果`);
            }, 800);
        }
    });
});
