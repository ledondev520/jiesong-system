# HSCODE-01 Results

## 交付

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260308035256_add_hs_codes_table/migration.sql`
- `backend/scripts/seed-hscodes.js`
- `backend/src/services/hsCodeService.js`
- `backend/src/routes/hsCodes.js`
- `backend/src/routes/index.js`
- `backend/src/controllers/productController.js`
- `frontend/src/services/hsCode.service.ts`
- `frontend/src/types/index.ts`
- `frontend/src/app/dashboard/products/components/ProductDialog.tsx`

## 结果

- 支持按商品名称搜索 HSCode 建议
- 支持按编码查询税率详情
- 商品弹窗支持“HSCode 智能匹配”按钮与自动推荐
- 选中后自动填充 `hsCode` 和 `taxRate`
- 商品保存时 `hsCode` / `declaration` 可持久化

## 验证

- 后端：`7/7`
- 前端：`6/6`
- 本地种子：`100`
