# 报关单页面组件

`CustomsDeclarationListPageContent.tsx` 可独立显示，也可嵌入退税工作台。用户编辑关键词、状态或重置时只改对应 URL 筛选，保留 `view=customs` 和其他查询参数。浏览器 Back/Forward 的关键词、状态变化更新本地控件并回到第 1 页，不由挂载/同步 effect 将旧筛选写回 URL。

`CustomsDeclarationListPageContent.test.tsx` 覆盖嵌入参数保留、搜索/重置及服务端分页。退税目录下的 `TaxRefundListPageContent.navigation.test.tsx` 使用实际页签、列表和详情，覆盖详情返回后的页签切换与浏览器历史筛选恢复。

独立列表组件测试覆盖采用历史筛选后，编辑/重置保留当前旧列表路径和非筛选参数；旧页面入口的重定向行为不变。`frontend/e2e/tax-navigation.spec.ts` 提供 390/1440px 真实 Next 路由和合成 API 的 CI 浏览器验收定义。
