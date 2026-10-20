# 出口退税工作台组件

`TaxRefundListPageContent.tsx` 的工作台、报关单和退税记录页签由浏览器查询快照决定，和嵌入报关列表共享 `useBrowserQuery`。页签切换使用原生浅历史提交及应用专用通知，不调用可能复用旧 canonical 查询的同页异步 `router.replace`。切换清除所属列表筛选并同步卸载旧报关树，其迟到请求由报关列表的请求代次边界拒绝。

`TaxRefundListPageContent.navigation.test.tsx` 保留真实页签、列表和详情组件，覆盖旧 Next 快照/缓存导航、立即搜索后切换、迟到列表响应、Back/Forward 和 insertion-effect URL 提交顺序。另覆盖筛选关键词/状态经详情明确返回后的恢复、重复进入、含上下文的直接详情、非法/重复返回目标回退和详情查询更新。真实 Next 的 390/1440px 浏览器验收在 `frontend/e2e/tax-navigation.spec.ts`。

报关详情明确返回用受限的新文档导航绕过 Next 缓存 canonical 查询；集成回归模拟软导航错误恢复 OLD/RELEASED，要求来源筛选恢复且不调用缓存 router.push。其余原生历史、嵌入列表、页签与迟到工作边界不变。

导航组件测试首次点击报关页签和进入详情时使用 awaited async `act`，等待真实 React.lazy、`use(params)` 与详情服务加载的异步初始化。`beforeAll` 预加载模块只避免冷转换，不能代替 lazy 自身的首次 promise；这两个准备步骤使用 Radix 真实的左键/无 Ctrl mouseDown 激活及详情按钮 click，配合异步 act，防止同步事件包装遗留渲染队列，并避免在 userEvent 的 act 环境关闭包装内嵌套异步 act；之后被验收的退税点击/方向键交互继续使用 userEvent。组件、导航断言、等待超时与生产代码均不因此调整。

`TaxRefundForm.tsx` 的申请日期、到账日期默认值沿用报关表单的 `slice(0, 10)` 日历日期规则，兼容 API ISO 时间戳、日期文本与空值。只修复日期控件回填，不引入时区换算、状态或金额规则；编辑页回归覆盖两项 ISO 日期显示及未编辑日期随备注修改保留。FINANCE 的真实内部记录创建/重复编号失败重试/编辑/返回取消与重载验收位于 `frontend/e2e/real-role-lifecycle.spec.ts`，独立只读 SQLite 核对业务与审计记录；实际浏览器结果由既有 hosted CI 提供。
