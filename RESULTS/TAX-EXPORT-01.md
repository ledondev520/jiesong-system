# TAX-EXPORT-01 结果

## 产出

- `TaxRefund` 模型新增字段：
  - `relation_no`
  - `invoice_no`
  - `vat_rate_type`
  - `match_status`
- 新增退税导出前校验服务：`backend/src/services/taxRefundExportService.js`
- 新增导出接口：`POST /api/v1/tax-refunds/export`

## 关键结论

- P0：缺关联号、缺发票号、`vat_rate_type` 非法、税率与采购合同不一致时，返回 `409` 并阻断导出。
- P1：同关联号多发票冲突、金额异常会进入 `warnings`，当前先日志 + 返回告警。
- P2：`relation_no` / `invoice_no` 会做空格、前导 0 规范化，并在 `fixes` 中返回可修复提示。
- 导出成功时仅返回 `match_status=passed` 记录，并附带 CSV 文本。

## 验证

- 命令：
  - `cd backend && node --test src/services/taxRefundExportService.test.js src/services/taxRefundService.test.js src/controllers/taxRefundController.test.js src/routes/taxModules.test.js`
- 结果：
  - `18/18` 通过

## 待办 / 约束

- 真实环境上线前需执行 Prisma schema 同步（至少 `prisma generate` 与数据库结构更新）。
