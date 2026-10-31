# 出口订单详情组件（/dashboard/orders/[id]）

若本文件夹结构或内容变化，请更新本文件。

- `OrderDetailPage.tsx`：数据加载、页头（状态、唯一下一步按钮、「单证 ▾」）与七个页签；阶段保存保留 Axios 错误 DTO 中的原始原因，发运成功后打开退税准备；`?tab=` 记住页签，旧 `/dashboard/sales/[id]?tab=` 键（packing/3d/info/customs/finance）映射到新页签
- `orderDetailModel.ts` / `.test.ts`：纯计算——页签键、按状态的下一步（CONFIRMED：ADMIN/PURCHASE 且有未生成明细 → 生成采购单，否则 → 选择采购装柜）、出柜判定文案（装箱明细合计，与后端门槛同源）、按门店履约汇总、待生成采购单的明细
- `OrderOverviewTab.tsx`：金额与装柜摘要、「按门店」表（下单 / 已采购（未取消采购单）/ 已入库（验货合格）/ 已装箱）、物流时间线
- `OrderLinesTab.tsx`：只读商品 × 门店网格 + `ContractInfoEditor`（失败保留草稿供明确重试；门店读回保留港口关联）
- `OrderPurchasesTab.tsx`：由本订单生成的采购单（只含数量与状态，不含采购价格）
- `OrderContainerTab.tsx`：出柜条件（双 80% + 3D 排柜）、容量卡片、装箱明细、40HQ `Container3DView`、保存为图片
- `PackingItemsCard.tsx`、`PackingItemDialog.tsx`：装箱明细表（手机卡片）与添加/编辑弹窗；采购来源行锁定数量/箱数/毛净重/体积/尺寸
- `OrderDocsTab.tsx`、`OrderDocsMenu.tsx`：HS 编码汇总 + 附件；「单证 ▾」菜单（生成出口单证、报关单草稿、船司装箱单核对；其他：导出出口工作簿、申报三表）
- `OrderRefundTab.tsx`：退税材料检查入口（检查不等于正式申报）
- `GeneratePurchaseDraftsDialog.tsx` / `.test.tsx`：生成采购单，默认最近一次在用供应商与价格，否则参考成本；草稿不是应付
- `SalesFinancePanel.tsx` / `.test.tsx`：统一财务结算和 USD 收款登记。保存失败向共用付款弹窗传回原始原因；已保存后的合同刷新错误不得诱导再次收款登记；切换合同时在渲染期重置加载/失败状态，请求回调经 `runAwait` 保持原 await 时序；`SalesFinancePanel.reset-window.test.tsx` 在真实调度（非 act）下覆盖切换合同后、被动 effect 发起新请求前到达的旧成功/失败
- `ImportPurchaseItemsDialog.tsx` / `.test.tsx`：采购商品导入
- `../page.test.tsx`：各页签、下一步与「单证 ▾」交互；阶段错误与原样重试、合同头失败保留/纠正重试、发运门槛取明细合计

收款登记是内部记录，不执行银行转账。
