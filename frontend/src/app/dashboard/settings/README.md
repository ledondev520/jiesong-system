若本文件夹结构或内容变化，请更新本文件。

## 目的/边界/职责

展示当前系统配置及已分离的档案/用户/导出入口。普通文本组件回归不执行含汇率和 AI 参数的整表保存；接口证据与浏览器证据分开记录。

## 文件清单

| 名字                     | 地位             | 功能                                                                  |
| ------------------------ | ---------------- | --------------------------------------------------------------------- |
| `page.tsx`               | 配置路由         | 展示当前系统配置页                                                    |
| `layout.tsx`             | 设置布局         | 宽屏侧栏与手机可收起菜单                                              |
| `page.test.tsx`          | 原有组件回归     | 配置标题、保存及加载失败的桩测试                                      |
| `ordinary-text.test.tsx` | 普通文本组件回归 | 既有开票固定文本加载、编辑/清空后离开并重新挂载的放弃行为，不提交整表 |
| `components/`            | 配置内容         | 页面内容及现有配置/工具区块                                           |
| `users/`                 | 用户页面         | 展示既有用户列表与权限矩阵                                            |
| `ports/`                 | 港口页面         | 维护港口档案                                                          |
| `categories/`            | 分类页面         | 维护商品分类                                                          |
| `customs-brokers/`       | 报关公司页面     | 维护报关公司档案                                                      |
| `export/`                | 导出页面         | 展示数据导出入口                                                      |
| `README.md`              | 目录索引         | 记录当前路由与验证边界                                                |

`export/page.tsx` 复用原数据工具入口，现展示「数据导入导出」。`DataImportTab.tsx` 提供四类 CSV/xlsx 模板、只读预览、逐行错误及库存期初确认。切换文件或类型清除旧预览。组件测试验证预览不会执行导入及期初确认门禁。

`components/PricingConfigCard.tsx` 是 ADMIN-only 的「报价规则」卡片：现汇、汇率调整、默认加价(%)、取整步长（<步长向上取整到整美元，≥步长整美元后取最近倍数）、分类加价列表，
独立保存完整版本到 `/system/pricing-config`；预览(成本 ¥100 → $x)由服务端 `GET /system/pricing-config/preview`
调用同一个 `priceFor()` 计算，前端不重复公式。百分比界面与小数存储显式转换，范围以服务端校验为准。
`PricingConfigCard.test.tsx` 验证角色、加载、保存换算、分类加价、非法输入及加载失败。
组件桩测试不代表浏览器端到端通过。`PricingConfigCard.transport.test.tsx` 使用真实 Axios 拦截器和合成响应，
验证冲突正文可见及重新读取时取得当前 revision。报价读取显式禁用客户端 GET 缓存。

报价卡片在 GET/PUT 响应写入状态前校验完整配置、SHA-256 revision、schema 枚举与有限数值范围；
异常加载仅显示卡片内错误且不提供保存，异常保存保留有效快照与用户草稿，不显示保存成功。
`PricingConfigCard.test.tsx` 另覆盖通用 E2E 分页回退、空值、缺失字段/规则、非法版本及数值，
同时验证明确重试可用；不通过本地默认值补齐不完整的服务端配置。

## 分区与路径迁移（J29）
设置侧栏按规格 §3.5 分区：报价规则、用户、港口、商品分类、报关行、数据导入导出、AI 接入、AI 用量、系统日志。公司信息（需后端字段，待负责人确认 Q9）与「高级」折叠区尚未实现。

| 旧路径 | 新路径 |
|---|---|
| `/dashboard/users`（与旧 487 行 `settings/users`） | `settings/users`（保留 907 行版本，含 Agent 账号） |
| `/dashboard/system/logs` | `settings/logs` |
| `/dashboard/about` | `settings/ai-access` |
| `/dashboard/ai/sessions` | `settings/ai-usage` |
| `/dashboard/system/notifications` | `/dashboard/notifications`（所有角色） |
| `/dashboard/system` | 删除，重定向到 `/dashboard/settings` |

旧地址由 `frontend/next.config.ts` 永久重定向；`e2e/settings-sections.spec.ts` 覆盖分区链接与重定向。
