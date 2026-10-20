# 前端认证与缓存

`auth-token.ts` 继续管理未勾选保持登录时的标签级Bearer。`browser-session.ts` 只在内存保存CSRF和认证代次，永不读取HttpOnly持久凭据。`auth-session.ts` 清理当前标签认证、所有业务缓存并阻止旧代次的失效提示/跳转影响新登录。

`axios.ts` 为Cookie请求携带credentials/CSRF，GET缓存忽略旧代次晚到响应，恢复会话明确绕过缓存；只有当前认证请求的401可清理登录。`api-cache.ts` 与 `idempotentRequest.ts` 按认证代次隔离，登录/退出/失效清空，后者不改变HTTP幂等键。

设计与部署边界见 `docs/security/browser-sessions.md`；单元测试与工具文件同目录。

`browser-session.ts` 的认证代次订阅仅同步撤销内存文件视图；登录/退出/401 清理仍沿用原策略。`hooks/useContractFileAccess.ts` 为合同附件与船司原件共用认证 Blob 读取、取消和临时 URL 生命周期，不保存文件或新增凭据。

`run-await.ts` 以回调形式执行请求，成功/失败/收尾回调的微任务时机、同步抛错与回调抛错处理均与 `async try { await } catch finally` 一致；页面 effect 内的请求用它替代 `.then().catch().finally()` 链，避免同一轮多个请求的成功/失败处理顺序改变。
