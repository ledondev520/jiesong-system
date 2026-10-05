# 前端共享 Hooks

`useBrowserQuery.ts` 为嵌入报关筛选和退税页签提供浏览器权威查询、SSR 快照与原生浅历史提交。应用专用提交事件同步父子视图；不合成 `popstate`，真正 Back/Forward 仍由原生事件驱动。每次提交后重查地址，兼容 Next 在 insertion effect 中才更新 canonical URL 的顺序。

`useContractFileAccess.ts` 为合同附件和船司归档原件提供共享认证二进制下载，以及临时 PDF/栅格图片预览。请求不走 JSON GET 缓存；同一文件下载进行中禁止重复提交。关闭、scope 变化、认证代次变化及卸载取消请求并释放 URL，60 秒后释放已触发下载的 URL；旧媒体 onError 必须匹配原 URL。

`useContractFileAccess.test.ts` 直接验证旧媒体错误不会撤销新预览。组件层分别覆盖合同附件和核对原件的流程；其余业务 Hooks 保持既有职责。

`useBrowserQuery.ts` 同样为工作台范围和经营报表已应用期间读取实际浏览器地址，调用方显式提供 Next 服务端查询快照。`replaceBrowserQuery` 只修改所属字段、保留其他参数/片段，并通过同一 `replaceBrowserUrl` 和应用专用事件提交，不启动路由请求或增加第二套通知。
