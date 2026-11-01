若本文件夹结构或内容变化，请更新本文件。

## 目的/边界/职责
- 设置 > 用户：账号管理的唯一页面（原 `/dashboard/users` 已合并，旧地址由 `next.config.ts` 重定向到此）
- 人类账号与 Agent 账号管理、完整分页用户目录、权限矩阵；复用共用 UserDialog
- 页面导航不授予 API 权限；普通名称回归只覆盖合成用户，不涉及账号开通、角色、密码或 Agent 操作

## 文件清单
| 名字 | 地位 | 功能 |
|---|---|---|
| page.tsx | 页面 | 人类账号与 Agent 账号管理及完整人类用户目录；保存失败可明确重试 |
| page.test.tsx | 回归 | 账号列表、筛选与现有权限入口检查 |
| name-lifecycle.test.tsx | 真实接口回归 | 用户名称取消、保存、后页搜索及真实失败重试 |
| components/UserDialog.tsx | 共用表单 | 编辑身份与原有权限字段，取消放弃，失败保留草稿 |
| components/UserDialog.test.tsx | 表单回归 | 验证原有表单与权限字段行为 |

名称测试使用 `src/test/account-name-fixture.ts`，人的列表/详情/更新响应为真实HTTP；仅相邻 Agent 列表在客户端隔离，模块导航壳不在范围。证据见 `docs/qa/account-name-lifecycle-2026-10-06.md`（该文档记录合并前的两个入口）。
