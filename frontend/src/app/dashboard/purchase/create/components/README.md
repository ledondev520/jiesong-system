# 采购创建与更正表单

- `CreatePurchasePageContent.tsx`：共用采购新增与草稿更正表单。新增页的只读合同编号仅用于预览，提交时不携带该编号，由后端原子分配；更正继续保留原合同编号
- `CreatePurchasePageContent.test.tsx`：使用合成目录与 API 响应验证新增不发送过期预览、前后切步保留表单，以及草稿更正保留显式编号
