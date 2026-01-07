/*
 * Input: DOM元素
 * Output: 页面交互逻辑
 * Pos: Demo交互脚本
 * 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

// 登录表单提交
document.getElementById('login-form').addEventListener('submit', function(e) {
    e.preventDefault();
    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');
});

// 退出登录
document.getElementById('logout-btn').addEventListener('click', function() {
    document.getElementById('main-app').classList.add('hidden');
    document.getElementById('login-page').classList.remove('hidden');
});

// 侧边栏导航切换
document.querySelectorAll('.sidebar-item').forEach(item => {
    item.addEventListener('click', function(e) {
        e.preventDefault();
        
        // 更新侧边栏状态
        document.querySelectorAll('.sidebar-item').forEach(i => {
            i.classList.remove('active');
            i.querySelector('svg')?.classList.remove('text-primary-500');
        });
        this.classList.add('active');
        this.querySelector('svg')?.classList.add('text-primary-500');
        
        // 切换页面内容
        const page = this.dataset.page;
        document.querySelectorAll('.page-content').forEach(p => p.classList.add('hidden'));
        const targetPage = document.getElementById('page-' + page);
        if (targetPage) {
            targetPage.classList.remove('hidden');
        } else {
            document.getElementById('page-dashboard').classList.remove('hidden');
        }
    });
});

// AI助手窗口切换
document.getElementById('ai-btn').addEventListener('click', function() {
    document.getElementById('ai-chat').classList.toggle('hidden');
});

document.getElementById('close-chat').addEventListener('click', function() {
    document.getElementById('ai-chat').classList.add('hidden');
});

// 聊天输入框回车发送
document.getElementById('chat-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter' && this.value.trim()) {
        const messagesDiv = document.getElementById('chat-messages');
        
        // 添加用户消息
        const userMsg = document.createElement('div');
        userMsg.className = 'flex items-start justify-end';
        userMsg.innerHTML = `
            <div class="bg-primary-500 text-white rounded-2xl rounded-tr-none px-4 py-3 max-w-[80%]">
                <p class="text-sm">${this.value}</p>
            </div>
        `;
        messagesDiv.appendChild(userMsg);
        
        // 模拟AI回复
        setTimeout(() => {
            const aiMsg = document.createElement('div');
            aiMsg.className = 'flex items-start space-x-3';
            aiMsg.innerHTML = `
                <div class="w-8 h-8 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                    </svg>
                </div>
                <div class="bg-gray-100 rounded-2xl rounded-tl-none px-4 py-3 max-w-[80%]">
                    <p class="text-sm text-gray-700">这是Demo演示，实际系统中我会连接Kimi API来回答您的问题。</p>
                </div>
            `;
            messagesDiv.appendChild(aiMsg);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }, 500);
        
        this.value = '';
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
});
