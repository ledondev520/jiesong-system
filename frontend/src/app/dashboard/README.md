# 仪表盘路由

系统配置当前普通固定文本回归见 `settings/README.md` 与 `settings/ordinary-text.test.tsx`：加载原文本、编辑或清空后离开并重新挂载时恢复原值，不执行含汇率/AI 参数的整表保存。单键真实 HTTP/SQLite 证据与浏览器未执行范围见 `docs/quality/ordinary-setting-text-20261006.md`。

采购合同当前 Excel 导入的组件回归见 `contracts/excel-import.test.tsx`：取消/空文件选择无上传、历史选项重置、逐行结果和列表刷新、失败后同文件重试。测试服务为桩，不能替代真实浏览器/数据库上传验收；后端实际工作簿证据见 `docs/qa/purchase-excel-import-2026-10-06.md`。

`layout.tsx` 等待认证状态恢复，Cookie模式再次确认真实服务端会话后才渲染保护内容和执行按角色导航；瞬时失败保留重试入口，不误报过期。原标签Bearer保持兼容。过期、退出与新登录由统一认证代次隔离晚到请求和业务缓存。

导航本身不授予API权限，后端仍逐请求校验用户状态、角色和会话版本。安全协议及回滚见 `docs/security/browser-sessions.md`。

出口退税内嵌报关列表同步搜索/状态时保留 `view=customs` 及父页面参数；初次挂载不重写相同URL，避免报关页签自动跳回工作台。回归见 `app/customs-declarations/components/CustomsDeclarationListPageContent.test.tsx`。

报关单列表按后端总数翻页并支持20/50/100条；搜索、状态及每页条数变化回到第1页，缓存按页隔离，汇总明确为本页口径。

报关手工维护共用 `../customs-declarations/components/CustomsDeclarationForm.tsx`，按真实出口合同与商品档案保存；详情显示申报/出口日期、申报数量及商品明细，编辑保留明细 ID、装箱来源与税率关联。列表搜索报关单号或报关行。

报关路由测试覆盖真实合同/商品选择、新建失败提示、已有日期与明细回填、保留明细ID更新和详情跳转；与共享表单测试共同校验写入契约。详情明确返回通过允许列表校验的根相对 `returnTo` 恢复来源关键词/状态/普通参数与片段，缺失或非法目标保持报关页签回退；旧列表路径规范到现有页签，旧重定向及编辑流程不变。

工作台选定范围通过 `workflowView` 保存在当前历史条目；经营执行已应用期间通过 `startDate`/`endDate` 保存。两者沿用 Next 原生 history，明细返回、Back/Forward 和刷新恢复已提交筛选，保留其他查询参数及片段。日期输入只作草稿，应用后才改变报表口径；全部期间清除两个日期，无效/倒序 URL 范围安全采用全部期间。报表请求按期间及请求代次隔离，旧成功/失败不能覆盖当前期间。回归见 `return-context.test.tsx` 与 `e2e/dashboard-return-context.spec.ts`。
