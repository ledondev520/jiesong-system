# AI会话UI

AIAssistant 的直接SSE POST同时支持本标签Bearer与HttpOnly Cookie。Cookie请求携带credentials及仅内存保存的CSRF证明；凭据不从Cookie读取。业务执行与原权限/确认流程不变。

## 停靠面板（Spec §10）
`LazyAIAssistantMount.tsx` 挂在 `app/dashboard/layout.tsx` 内容列右侧：桌面是可拖动/键盘调宽（320–640px）的一列，内容区随之变窄；手机是点按后的全屏面板。首次打开前不加载 `AIAssistant`，打开过后收起只隐藏、保留对话。开关来自顶栏按钮、`Ctrl/⌘+J` 或 `?ai=1`（旧 `/dashboard/ai` 重定向到 `/dashboard?ai=1`）；开合与宽度由 `store/ai-panel.store.ts` 按浏览器记忆，手机不会因记忆自动弹出。BOSS 不挂载。提问时附带 `lib/ai-page-context.ts` 生成的路由与记录 id，不新增权限。`AIAssistant` 的 floating / workspace 形态暂留（已无调用方，由清理卡删除）。

B42: `AIAssistant.tsx` 开场白如实列出能力（查询、起草采购/报关/核销/退税草稿；签约、付款、实物状态变更先确认），并说明汇率与报价参数不能在助手里修改（`UpdateSystemConfig` 本就排除报价参数）。

B77: 助手 SSE `done` 与「确认执行」成功后都调用 `clearApiGetCache()`（`@/lib/axios`）和 `clearAllCache()`（`@/lib/api-cache`），避免 3 分钟 GET 缓存让列表/看板显示写入前的旧数据；确认按钮用同步 ref 拦截重复点击，BOSS 只读时不渲染「确认执行」；卸载、新建对话、切换会话会中止进行中的 SSE（切换会话以序号丢弃过期历史）。`nginx/nginx.conf` 为 `/api/v1/ai/agents/prompt-stream` 单独关闭 `proxy_buffering`（后端 SSE 头本已带 `X-Accel-Buffering: no`）。
