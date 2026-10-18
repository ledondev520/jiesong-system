若本文件夹结构或内容变化，请更新本文件。

## 目的/边界/职责

展示当前系统配置及已分离的档案/用户/导出入口。普通文本组件回归不执行含汇率和 AI 参数的整表保存；接口证据与浏览器证据分开记录。

## 文件清单

| 名字 | 地位 | 功能 |
|---|---|---|
| `page.tsx` | 配置路由 | 展示当前系统配置页 |
| `layout.tsx` | 设置布局 | 宽屏侧栏与手机可收起菜单 |
| `page.test.tsx` | 原有组件回归 | 配置标题、保存及加载失败的桩测试 |
| `ordinary-text.test.tsx` | 普通文本组件回归 | 既有开票固定文本加载、编辑/清空后离开并重新挂载的放弃行为，不提交整表 |
| `components/` | 配置内容 | 页面内容及现有配置/工具区块 |
| `users/` | 用户页面 | 展示既有用户列表与权限矩阵 |
| `ports/` | 港口页面 | 维护港口档案 |
| `categories/` | 分类页面 | 维护商品分类 |
| `customs-brokers/` | 报关公司页面 | 维护报关公司档案 |
| `export/` | 导出页面 | 展示数据导出入口 |
| `README.md` | 目录索引 | 记录当前路由与验证边界 |

`export/page.tsx` 复用原数据工具入口，现展示「数据导入导出」。`DataImportTab.tsx` 提供四类 CSV/xlsx 模板、只读预览、逐行错误及库存期初确认。切换文件或类型清除旧预览。组件测试验证预览不会执行导入及期初确认门禁。

`components/PricingConfigCard.tsx` 在当前配置页新增 ADMIN-only 出口报价卡片，
沿用 shadcn Card/Input/Select/Button，独立保存完整版本到 `/system/pricing-config`。
字段范围使用后端提供的共用 schema。百分比界面与小数存储显式转换。
`PricingConfigCard.test.tsx` 验证角色、加载、全部字段保存、主动切换乘数模式、
非法值、服务端冲突及重复提交。组件桩测试不代表浏览器端到端通过。
`PricingConfigCard.transport.test.tsx` 使用真实 Axios 拦截器和合成响应，
验证冲突正文可见及重新读取时取得当前 revision。报价读取显式禁用客户端 GET 缓存。
