# 出口退税工作台组件

`TaxRefundListPageContent.tsx` 的工作台、报关单和退税记录页签由浏览器查询快照决定，和嵌入报关列表共享 `useBrowserQuery`。页签切换使用原生浅历史提交及应用专用通知，不调用可能复用旧 canonical 查询的同页异步 `router.replace`。切换清除所属列表筛选并同步卸载旧报关树，其迟到请求由报关列表的请求代次边界拒绝。

`TaxRefundListPageContent.navigation.test.tsx` 保留真实页签、列表和详情组件，覆盖旧 Next 快照/缓存导航、立即搜索后切换、迟到列表响应、Back/Forward 和 insertion-effect URL 提交顺序。另覆盖筛选关键词/状态经详情明确返回后的恢复、重复进入、含上下文的直接详情、非法/重复返回目标回退和详情查询更新。真实 Next 的 390/1440px 浏览器验收在 `frontend/e2e/tax-navigation.spec.ts`。
