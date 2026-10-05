# 前端业务 API 服务

此目录封装业务 API 和 DTO，界面通过服务调用后端；鉴权仍由共享 Axios 和后端校验。

## 收付请求

`finance.service.ts` / `.test.ts`：创建付款前复制平面输入，使用 `lib/idempotentRequest.ts` 的异步 SHA-256 标识。HTTP 标识固定 83 个 ASCII 字符，完整 UTF-8 JSON 内容参与摘要；相同 JSON 重试稳定、不同长备注不截断。失败清除短期本地缓存，再次点击沿用同一标识。

`purchaseReceipt.service.ts` 仅复用已有 `runIdempotentRequest`，其请求编号与后端协议不变。

## 浏览器会话

`auth.service.ts` 提供无缓存恢复、可取消登录和单次退出请求；Axios、合同附件multipart、退税POST导出和AI流式POST均兼容HttpOnly Cookie与内存CSRF。未勾选保持登录仍使用本标签Bearer。完整安全边界见 `docs/security/browser-sessions.md`。

## 合同附件二进制

`contractFile.service.ts` 的 `fetchContractFileBlob` 复用共享 Axios 的标签 Bearer/可选 Cookie 请求与取消信号，明确关闭 JSON GET 缓存；JSON Blob 错误保留可读的服务端错误，空响应/成功 JSON 不冒充文件。`isContractFilePreviewMime` 只允许 PDF 和栅格图片嵌入；角色和受保护文档权限仍由后端实时执行。测试使用真实 Axios 拦截器和本地合成 adapter，不访问业务文件。
