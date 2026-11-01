# 报价页面（出口模块）

- `page.tsx` → `components/QuoteListPageContent.tsx`：列表（`useListUrlState` 的 `quotes` 字段：keyword/status/page/pageSize）。
- `create/page.tsx`：新建报价（路径含 `/create`，BOSS 只读门禁沿用 `isBossRestrictedPath`）。
- `[id]/page.tsx` → `components/QuoteDetailPageContent.tsx`：DRAFT 显示编辑器，其余状态只读；每个状态一个主按钮（标记已发送 / 客户已接受 / 转为出口订单 / 查看订单）、导出 Excel、打印、复制为新报价。
- `components/QuoteEditor.tsx`：自包含的商品×门店行编辑器；价格全部由服务端 `priceFor` 计算，前端只发送成本、数量、门店和可选手动价。J18 订单网格合入后可替换（见 handoff）。
- 业务决定（负责人 2026-10-31）：转订单汇率 = 现汇 − 0.2（服务端）；手动单价 >= 0 即可，不与规则价比较；卖方块来自「公司信息」设置。
