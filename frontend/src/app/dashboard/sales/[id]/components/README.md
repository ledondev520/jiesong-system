# 出口合同详情组件

- `SalesDetailPageContent.tsx`：出口专项单详情；推进阶段保留Axios错误DTO中的后端库存/权限门禁原因，失败保留阶段并可重试
- `../page.test.tsx`：阶段错误与原样重试；隔离延迟加载的退税准备弹窗，失败不打开、成功后明确等待打开，避免依赖异步导入时序
- `SalesFinancePanel.tsx` / `.test.tsx`：统一财务结算和 USD 收款登记。保存失败向共用付款弹窗传回原始原因；已保存后的合同刷新错误不得诱导再次收款登记
- `ImportPurchaseItemsDialog.tsx` / `.test.tsx`：采购商品导入

收款登记是内部记录，不执行银行转账。
