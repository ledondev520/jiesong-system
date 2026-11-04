# 采购列表组件

- `ContractsPageContent.tsx`：采购列表（服务端检索、分页、导入导出、合同模板与购销合同生成）
- `purchaseListHelpers.tsx`：状态徽章（`StatusPill` 只是 `StatusBadge` 的 purchaseContract 映射加草稿悬停说明，详情页与列表共用一套状态映射）、状态色条、金额与页码辅助；`isPayable` 按规格 §4.7 白名单（SIGNED/PRODUCING/READY/SHIPPED/RECEIVED/COMPLETED）判定应付，草稿与已取消合同不计应付；`nonPayableNotice` 给出详情页的状态化文案；`getOverpaidAmount`/`OverpaidFlag` 在列表行显示「超付 ¥X」（已付 > 已录入的合同金额；合同金额为 0 时不报超付），合同金额为 0 的行显示「未录入」
- `PurchaseDetailDialog.tsx`：列表内的合同详情弹窗（只读）
