# PERF-02 结果

## 交付内容
- 后端高频列表接口支持 `lite=true` 轻量模式，减少切页首屏不必要数据负载。
- 前端高频页面切换到 lite 请求，降低页面间来回切换时的数据拉取压力。
- 全局 GET 缓存默认 TTL 调整到 180s，提升切页回访命中率。

## 主要修改文件
- Backend:
  - `backend/src/controllers/productController.js`
  - `backend/src/controllers/storeController.js`
  - `backend/src/controllers/inventoryController.js`
  - `backend/src/controllers/purchaseController.js`
  - `backend/src/controllers/supplierController.js`
  - `backend/src/controllers/salesController.js`
  - `backend/src/controllers/containerController.js`
  - `backend/src/services/salesService.js`
  - `backend/src/services/containerService.js`
- Frontend:
  - `frontend/src/lib/axios.ts`
  - `frontend/src/services/product.service.ts`
  - `frontend/src/services/store.service.ts`
  - `frontend/src/services/inventory.service.ts`
  - `frontend/src/services/purchase.service.ts`
  - `frontend/src/services/sales.service.ts`
  - `frontend/src/services/container.service.ts`
  - `frontend/src/services/supplier.service.ts`
  - `frontend/src/app/dashboard/purchase/page.tsx`
  - `frontend/src/app/dashboard/sales/page.tsx`
  - `frontend/src/app/dashboard/containers/page.tsx`
  - `frontend/src/app/dashboard/products/page.tsx`
  - `frontend/src/app/dashboard/stores/page.tsx`
  - `frontend/src/app/dashboard/sales/create/page.tsx`
  - `frontend/src/app/dashboard/purchase/create/components/CreatePurchasePageContent.tsx`
  - `frontend/src/app/dashboard/sales/[id]/components/SalesDetailPageContent.tsx`
  - `frontend/src/app/dashboard/containers/[id]/page.tsx`
  - `frontend/src/app/dashboard/products/page.test.tsx`
- Checkpoint:
  - `PLAN.md`
  - `TASKS.md`

## 验收结果
- 后端定向测试通过（22/22）。
- 前端定向测试通过（39/39）。
- 前端定向 lint 通过。
- 前端生产构建通过。

## 预期性能收益
- 高频列表页切换时，网络返回体显著缩小，首屏加载更快。
- 页面来回切换时更容易命中 180s 缓存，减少重复请求等待。
- 详情/创建页基础数据加载（商品/门店/库存）请求负载下降，打开速度更稳定。
