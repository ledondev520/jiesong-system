若本文件夹结构或内容变化，请更新本文件。

# 业务对话框

- `ExportPacketExcelDialog.tsx` / `.test.tsx`｜Excel出四单｜单票上传自动下载，多票选择EXP，保持源行和人工报价；两种利润率分开展示，缺项仅在界面提示。关闭或换文件取消迟到结果，修改参数后须重新计算才可下载。
- `ExportPacketWorkbenchDialog.tsx`｜现有合同四单工作台｜共用已保存单价优先、成本加价率及销售毛利率。

业务操作的确认、校验和失败恢复交互。后端继续执行单证与附件权限校验。

- `PackingListCheckDialog.tsx`｜船司 PDF 核对｜展示核对历史、差异、原件与人工复核结果
- `PackingListCheckDialog.test.tsx`｜核对交互回归｜覆盖读取、核对、人工结果和原件下载/关闭隔离

`PackingListCheckDialog.tsx` 展示归档船司 PDF 的核对历史、逐项差异与人工复核。原件下载通过共享认证二进制文件请求，仍由后端权限校验；关闭、切换合同/核对记录和会话变化取消迟到下载并释放临时 URL。

`PackingListCheckDialog.test.tsx` 使用合成数据覆盖读取、核对、人工结果和认证原件下载/关闭隔离。其他对话框维持各自现有业务职责。
