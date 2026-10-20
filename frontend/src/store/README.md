# 前端状态

`auth.store.ts` 接收服务端确认的用户资料及标签Bearer或内存CSRF。HttpOnly会话凭据不可见且不落入JS存储，Cookie模式持久化的token字段为null。登录、退出和会话失效按认证代次隔离/清理业务缓存，避免旧请求或缓存影响新账号。

主动退出先由导航中的authService确认逐浏览器服务端撤销，再清理本地状态；本地logout也用于已确定失效的会话。完整边界见 `docs/security/browser-sessions.md`。
