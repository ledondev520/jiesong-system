# 库存组件

- `InventoryTab.tsx`：库存列表通过 `useListUrlState` 从URL读取 inventoryKeyword/inventoryStore/inventoryPage/inventoryPageSize，按当前分页/关键词/店铺实时读取服务端，单条及批量状态操作不复用旧缓存；单条与批量状态变更先弹出确认；保留请求序号保护，避免旧查询覆盖新筛选结果；批量操作结束只触发当前页/筛选刷新，不使用操作开始时的旧筛选
- `InventoryTab.lifecycle.test.tsx`：覆盖批量入库后刷新、待处理批量操作期间的搜索/翻页切换，以及验货后重新进入库存页面的即时显示
- `InventoryTab.same-round.test.tsx`：同一轮完成的库存列表与状态更新请求，旧列表不覆盖新状态、提示顺序与原 async try/await 一致
- 采购/验货来源库存由对应业务自动流转，页面不提供重复手工入出库入口
- `InventoryDetailDialog.tsx`：行内「详情」打开的只读库存详情弹窗，数据来自已加载列表，不发写请求 (B17)
- `ReceivingWorkbench.tsx`：库存页「收货验货」页签（B53，PHASE3 §4）。读取 `GET /purchases?status=SHIPPED`（不新增接口），按到货子状态分「待到货 / 部分到货 / 已到齐待验收」，阶段计数加载或失败显示「—」；行内按钮在右侧 Sheet 打开现有 `PurchaseReceiptPanel`（与采购合同详情同一套记录与角色校验，只读账号只能查看）；登记后刷新队列、侧栏保持打开。超过 100 条明确提示（按合同号最新的 100 条，阶段计数只统计这些）；按钮标签与面板写入角色一致（ADMIN/PURCHASE/WAREHOUSE，其余「查看到货」）。不提供「待复验」「今日已收」：需要跨合同验货汇总接口（v2），不用到货量冒充验货状态
- `InventoryTab.tsx`（B53）：新增「入库日期」列（`inboundAt`，无则「—」）；当前页没有任何采购合同来源时隐藏整列「采购合同」；页首说明「可用库存」口径（仅已入库）以及系统不记录仓库/库位和批次号
- `ReceivingWorkbench.test.tsx`：阶段计数/切换、无写权限角色只见「查看到货」、加载失败重试、侧栏面板与刷新、只读、超量提示
