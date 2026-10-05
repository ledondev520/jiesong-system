# 财务交互组件

此目录提供收付管理共用弹窗和概览组件，不执行真实银行转账。

- `PaymentDialog.tsx` / `.test.tsx`：合同付款/收款表单；调用方保存成功后关闭弹窗并 resolve，失败必须 reject。失败保留金额、日期、方式、备注，余额刷新不覆盖草稿。提交中阻止重复提交及关闭；取消后再次打开创建新草稿。
- `ReceiptDialog.tsx`：无合同到账记录表单
- `AllocateDialog.tsx` / `.test.tsx`：到账款分配
- `FinanceOverviewCharts.tsx`：财务概览图表

支付请求标识由 `services/finance.service.ts` 生成，中文内容只进入 JSON body。
