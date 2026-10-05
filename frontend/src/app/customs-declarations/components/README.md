# 报关单页面组件

`CustomsDeclarationListPageContent.tsx` 可独立显示，也可嵌入退税工作台。用户编辑关键词、状态或重置时用 Next 支持的原生 `history.replaceState(null, "", url)` 浅同步，只改对应 URL 筛选，保留当前地址中的 `view=customs`、其他查询参数及 hash。每个按键不再启动异步路由导航。筛选从浏览器地址的外部存储快照读取；延迟的 Next 查询确认不能擦掉更新的输入草稿。原生 Back/Forward 事件更新本地控件并回到第 1 页，Next 路由提交后也会复核当前地址，不由同步 effect 将旧筛选写回 URL。

列表请求以当前查询和请求代次隔离。历史筛选、分页变化及卸载会使旧请求失效；旧成功结果不得覆盖新行/总数，旧失败不得弹出错误或结束新请求的加载状态。异步业务操作保留的旧筛选刷新回调同样不会重启旧查询。

报关筛选和父页签共用 `useBrowserQuery` 的应用内提交通知；它不伪造 `popstate`。嵌入列表事件在浏览器已离开 `view=customs` 后拒绝发布筛选，独立/旧列表路由不受此页签限制。

`CustomsDeclarationListPageContent.test.tsx` 覆盖嵌入参数保留、搜索/重置及服务端分页。退税目录下的 `TaxRefundListPageContent.navigation.test.tsx` 使用实际页签、列表和详情，覆盖详情返回后的页签切换、浏览器历史筛选恢复以及成功、失败、加载和离开页签的迟到请求边界。

独立列表组件测试覆盖采用历史筛选后，编辑/重置保留当前旧列表路径和非筛选参数；旧页面入口的重定向行为不变。`frontend/e2e/tax-navigation.spec.ts` 提供 390/1440px 真实 Next 路由和合成 API 的 CI 浏览器验收定义。
