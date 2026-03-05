# INV-01 库存联动修复结果

## 目标
- 统一库存快照服务命名为 `inventorySnapshot`
- 实现销售状态 `out_stock` 自动触发出库扣减
- 创建 `inventorySnapshot.js` 服务文件
- 补齐销售财务金额/成本口径对齐

## 交付
- 新增主服务：`backend/src/services/inventorySnapshot.js`
- 兼容别名：`backend/src/services/inventorySnapshotService.js`
- 引用切换：
  - `backend/src/services/salesService.js`
  - `backend/src/controllers/purchaseController.js`
  - `backend/src/controllers/inventoryController.js`
- 财务对齐：`reconcileSalesFinancials` 改为 `quantity * sellingPrice` 汇总合同金额，并计算 `quantity * costPrice` 成本基线
- 状态归一：`normalizeFilterStatus` 支持 `out_stock`、`pending-shipment` 等输入格式
- 新增/更新测试：
  - `backend/src/services/inventorySnapshot.test.js`
  - `backend/src/services/salesService.test.js`
  - `backend/src/services/shared/contractUtils.test.js`

## 验证
- ✅ `npm test -- src/services/shared/contractUtils.test.js src/services/inventorySnapshot.test.js src/services/salesService.test.js`
  - 11/11 通过
- ⚠️ 路由附加回归中 `src/routes/sales.test.js` 因环境缺少 `pdfkit` 失败（非本次改动引入）

## 补丁
- 变更补丁：`PATCHES/INV-01.diff`
