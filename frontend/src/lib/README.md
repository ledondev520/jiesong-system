# 前端认证与缓存

`auth-token.ts` 继续管理未勾选保持登录时的标签级Bearer。`browser-session.ts` 只在内存保存CSRF和认证代次，永不读取HttpOnly持久凭据。`auth-session.ts` 清理当前标签认证、所有业务缓存并阻止旧代次的失效提示/跳转影响新登录。

`axios.ts` 为Cookie请求携带credentials/CSRF，GET缓存忽略旧代次晚到响应，恢复会话明确绕过缓存；只有当前认证请求的401可清理登录。`api-cache.ts` 与 `idempotentRequest.ts` 按认证代次隔离，登录/退出/失效清空，后者不改变HTTP幂等键。

设计与部署边界见 `docs/security/browser-sessions.md`；单元测试与工具文件同目录。
