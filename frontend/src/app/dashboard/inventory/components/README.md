# 库存组件

- `InventoryTab.tsx`：库存列表通过 `useListUrlState` 从URL读取 inventoryKeyword/inventoryStore/inventoryPage/inventoryPageSize，按当前分页/关键词/店铺实时读取服务端，单条及批量状态操作不复用旧缓存；单条与批量状态变更先弹出确认；保留请求序号保护，避免旧查询覆盖新筛选结果；批量操作结束只触发当前页/筛选刷新，不使用操作开始时的旧筛选
- `InventoryTab.lifecycle.test.tsx`：覆盖批量入库后刷新、待处理批量操作期间的搜索/翻页切换，以及验货后重新进入库存页面的即时显示
- `InventoryTab.same-round.test.tsx`：同一轮完成的库存列表与状态更新请求，旧列表不覆盖新状态、提示顺序与原 async try/await 一致
- 采购/验货来源库存由对应业务自动流转，页面不提供重复手工入出库入口
