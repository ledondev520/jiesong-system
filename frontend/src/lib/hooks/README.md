# 前端共享 Hooks

`useContractFileAccess.ts` 为合同附件和船司归档原件提供共享认证二进制下载，以及临时 PDF/栅格图片预览。请求不走 JSON GET 缓存；同一文件下载进行中禁止重复提交。关闭、scope 变化、认证代次变化及卸载取消请求并释放 URL，60 秒后释放已触发下载的 URL；旧媒体 onError 必须匹配原 URL。

`useContractFileAccess.test.ts` 直接验证旧媒体错误不会撤销新预览。组件层分别覆盖合同附件和核对原件的流程；其余业务 Hooks 保持既有职责。
