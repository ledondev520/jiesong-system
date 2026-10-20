若本文件夹结构或内容变化，请更新本文件。

# 业务对话框

业务操作的确认、校验和失败恢复交互。后端继续执行单证与附件权限校验。

- `GenerateThreeFormsDialog.tsx`｜出口单证确认｜校验全部装箱行；兼容展开的后端错误正文、Axios 响应和网络 Error，失败保留草稿供显式重试，不自动重放生成
- `GenerateThreeFormsDialog.test.tsx`｜单证交互回归｜覆盖历史 HS、全量门禁、无退税警示、400 具体错误可见性和保留草稿的单次显式重试
- `PackingListCheckDialog.tsx`｜船司 PDF 核对｜展示核对历史、差异、原件与人工复核结果
- `PackingListCheckDialog.test.tsx`｜核对交互回归｜覆盖读取、核对、人工结果和原件下载/关闭隔离

`PackingListCheckDialog.tsx` 展示归档船司 PDF 的核对历史、逐项差异与人工复核。原件下载通过共享认证二进制文件请求，仍由后端权限校验；关闭、切换合同/核对记录和会话变化取消迟到下载并释放临时 URL。

`PackingListCheckDialog.test.tsx` 使用合成数据覆盖读取、核对、人工结果和认证原件下载/关闭隔离。其他对话框维持各自现有业务职责。
