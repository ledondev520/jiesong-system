# 采购创建与更正表单

- `CreatePurchasePageContent.tsx`：共用采购新增与草稿更正表单。新增页的只读合同编号仅用于预览，提交时不携带该编号，由后端原子分配；更正继续保留原合同编号
- `purchaseFormParts.tsx`：表单校验 schema、内联供应商初始值、步骤指示器与价格汇总（无状态，自表单拆出）
- `CreatePurchasePageContent.test.tsx`：使用合成目录与 API 响应验证新增不发送过期预览、前后切步保留表单，以及草稿更正保留显式编号
- `PurchaseItemsStep.tsx` / `PurchaseContractStep.tsx`：步骤 1（AI 智能录入与采购明细）与步骤 2（合同详情与提交）的展示 Module，状态与提交逻辑仍在 `CreatePurchasePageContent.tsx`
- `BatchProductDialog.tsx` / `NewSupplierDialog.tsx` / `SaveTemplateDialog.tsx`：批量选商品、内联新增供应商、保存模板弹窗（纯展示，经 props 接收状态）
