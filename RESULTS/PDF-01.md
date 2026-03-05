# PDF-01 结果

## 交付内容
- 合同详情页导出：
  - 销售详情页新增 `导出 PDF` 按钮，调用 `/api/v1/sales/:id/export-pdf`。
  - 采购详情页新增 `导出 PDF` 按钮，调用 `/api/v1/contract-doc/pdf/:id`。
- 财务报表导出：
  - 应付账款页新增 `导出 PDF` 按钮，导出 `purchases` 报表。
  - 应收账款页新增 `导出 PDF` 按钮，导出 `sales` 报表。
- 下载机制：全部通过 `downloadResponseBlob` 处理 blob 下载。
- 交互反馈：新增 loading 状态（spinner + disabled）与错误提示（toast）。

## 代码位置
- Services:
  - `frontend/src/services/sales.service.ts`
  - `frontend/src/services/contractDoc.service.ts`
  - `frontend/src/services/finance.service.ts`
- Pages:
  - `frontend/src/app/dashboard/sales/[id]/components/SalesDetailPageContent.tsx`
  - `frontend/src/app/dashboard/purchase/[id]/page.tsx`
  - `frontend/src/app/dashboard/finance/payable/page.tsx`
  - `frontend/src/app/dashboard/finance/receivable/page.tsx`
- Tests:
  - `frontend/src/app/dashboard/sales/[id]/page.test.tsx`
  - `frontend/src/app/dashboard/purchase/[id]/page.test.tsx`
  - `frontend/src/app/dashboard/finance/payable/page.test.tsx`
  - `frontend/src/app/dashboard/finance/receivable/page.test.tsx`

## 验收结论
- 目标功能实现完成。
- 定向 lint/test 全部通过。
- 全量 `next build` 未通过，原因是仓库既有语法问题与网络受限，不属于本任务引入。
