# 仪表盘路由

`layout.tsx` 等待认证状态恢复，Cookie模式再次确认真实服务端会话后才渲染保护内容和执行按角色导航；瞬时失败保留重试入口，不误报过期。原标签Bearer保持兼容。过期、退出与新登录由统一认证代次隔离晚到请求和业务缓存。

导航本身不授予API权限，后端仍逐请求校验用户状态、角色和会话版本。安全协议及回滚见 `docs/security/browser-sessions.md`。

出口退税内嵌报关列表同步搜索/状态时保留 `view=customs` 及父页面参数；初次挂载不重写相同URL，避免报关页签自动跳回工作台。回归见 `app/customs-declarations/components/CustomsDeclarationListPageContent.test.tsx`。

报关单列表按后端总数翻页并支持20/50/100条；搜索、状态及每页条数变化回到第1页，缓存按页隔离，汇总明确为本页口径。

报关手工维护共用 `../customs-declarations/components/CustomsDeclarationForm.tsx`，按真实出口合同与商品档案保存；详情显示申报/出口日期、申报数量及商品明细，编辑保留明细 ID、装箱来源与税率关联。列表搜索报关单号或报关行。
