# 业务对话框

`PackingListCheckDialog.tsx` 展示归档船司 PDF 的核对历史、逐项差异与人工复核。原件下载通过共享认证二进制文件请求，仍由后端权限校验；关闭、切换合同/核对记录和会话变化取消迟到下载并释放临时 URL。

`PackingListCheckDialog.test.tsx` 使用合成数据覆盖读取、核对、人工结果和认证原件下载/关闭隔离。其他对话框维持各自现有业务职责。
