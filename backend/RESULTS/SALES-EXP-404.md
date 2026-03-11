# SALES-EXP-404 Result

## Outcome
- 销售 Excel 导出与 PDF 导出在合同缺失时都返回 404 业务错误。
- 路由层测试证明导出 handler 会把 404 错误传给 `next`，不会再被包装成 500。

## Evidence
- 修改文件：`src/services/exportService.js`、`src/services/pdfExportService.js`、`src/routes/sales.test.js`、`src/services/exportService.test.js`、`src/services/pdfExportService.test.js`
- 验证命令：`cd backend && node --test src/routes/sales.test.js src/services/exportService.test.js src/services/pdfExportService.test.js src/services/dataImportService.test.js`
- 验证结果：`12/12` 通过（包含销售导出 404 回归用例）。
