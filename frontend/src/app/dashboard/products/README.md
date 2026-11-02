# 商品档案页面

- `page.tsx`：商品列表保留服务端分页、搜索、低库存和「资料不全」（毛重/体积/HS 编码缺失，后端 `incomplete=true`）筛选；每次新增、编辑或关闭都有独立会话，旧保存完成只刷新当前筛选，不关闭后来打开的编辑；所有新增入口清空之前的编辑目标，保存失败向编辑组件返回失败以保留草稿
- `page.test.tsx`：URL 初始搜索、关键词编辑/清空、分页和新增入口回归
- `page.lifecycle.test.tsx`：结合真实编辑组件覆盖新增/编辑失败保留全部输入并原样重试、重复提交只保存一次、关闭待保存会话后另开新草稿、旧保存不恢复旧搜索及空列表新增不带入旧编辑
- `components/`：商品编辑组件，生命周期边界与回归见该目录 README；库存已迁至 `/dashboard/inventory`（`app/dashboard/inventory/`）
- `[id]/page.tsx`：商品详情（概览 + 只读「采购价格」页签，各供应商比价）；`[id]/page.test.tsx` 覆盖页签与加载失败重试
B17: card click and the new 「详情」 button open the read-only `[id]` detail page (now also weights, volume, stock, declaration); editing/deleting stay explicit buttons.
B40: product cards no longer carry a delete button (list and mobile); deletion lives in a 「危险操作」 section at the bottom of `[id]/page.tsx` behind an AlertDialog that names the product, then returns to the list. Cards always show 可用库存 (`availableStock` is now returned by `GET /products` for every row and by `GET /products/:id`, summed from INBOUND inventory like the low-stock alert; the low-stock filter still shows 库存 / 阈值). Unset or 0 gross/net weight and volume render 「未维护」 via `measure.ts` (0 is treated as missing, as in the `incomplete` filter), never 0kg/0CBM. `page.same-round.test.tsx` (list-vs-delete race) was removed with the list delete.
