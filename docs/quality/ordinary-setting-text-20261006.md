若本文件夹结构或内容变化，请更新本文件。

# 系统配置普通文本回归（2026-10-06）

基线：`9d95c71ec78da93b5fce396f8eb86d1cfc71be4d`。固定矩阵第 30 行「系统配置」仅新增既有普通文本的接口与组件证据，不能标成完整浏览器保存/取消/异常验收。

## 当前实际入口与范围

- `/dashboard/settings` → `SettingsPageContent` → `SystemConfigTab`，确实包含 `invoiceTitleInfo`（我方开票抬头信息）及 `stampPlatformUrl`（线上盖章平台链接）。
- `invoiceTitleInfo` 只作为固定文本附在采购详情的催票文本末尾（`PurchaseFlowPanel.tsx`）；本轮只使用合成公司名称与合成说明，不包含税号、银行账号、地址、电话或真实资料。
- 唯一可见的「保存配置」始终并行写入 `exchangeRate`、`profitRate`、单位、报关公司、AI 模型/采样/输出长度以及两个业务字段，即使只改普通文本也会触发这些写入。当前没有取消按钮。
- 单位/报关公司即时保存区只在 `showDictOnly=true` 时展示，仓库当前没有传入该值的实际页面；未把不可达区块当成第 30 行的可见生命周期。
- 本轮没有点击完整表单保存，也没有增加独立保存功能或改变现有保存契约。既有单键 `PUT /api/v1/system/configs/invoiceTitleInfo` 可用于严格限定普通文本的真实接口验收。

## 新增验证

| 层次 | 行为与结果 | 证据 |
|---|---|---|
| 真实 HTTP/SQLite | 多行中文文本单键保存、相同值重复保存、断开后重新连接并读取；保持同一配置 ID、备注及唯一键 | `backend/src/integration/ordinary-setting-text.integration.js` |
| 真实 HTTP/SQLite | 私有库临时约束拒绝该键更新，HTTP 500 返回既有中文错误，旧文本不变且不产生成功审计；解除故障后明确重试成功 | 同上 |
| 真实 HTTP/SQLite | 清空可选文本后读取空字符串，原配置行仍存在；仅正常 4 次成功更新产生 ADMIN 审计 | 同上 |
| 页面组件 | 显示原文本，编辑后卸载/重新挂载恢复原值；清空草稿后也恢复原值，网络边界没有任何 PUT | `frontend/src/app/dashboard/settings/ordinary-text.test.tsx`（2 例） |

测试从已提交迁移 SQL 创建独占临时 SQLite（目录 0700、库 0600），复用既有合成 ADMIN 身份和内存 Bearer 约定，使用完整 Express 应用、实际认证及 100 次/分钟限流。每次回读同时比较所有其他非审计表的全部行与字段（跳过用户未使用的密码列），配置表始终只有既有普通文本键；不访问现有业务库，不使用真实持久认证存储或 Cookie。

约束失败来自测试库临时 `RAISE(ABORT)` 触发器；当前锁定 Prisma SQLite 引擎将其归为 P2003，因此响应沿用「存在关联数据，无法执行该操作」。这证明拒绝后旧文本留存及明确重试，不代表真实部署发生了该错误。

## 命令与实际边界

运行环境：Node 20.19.0、TZ=UTC、Python 3 sqlite3，依赖复用已有安装，无新依赖、无 `db push`、无 client generate。新增后端用例已纳入 `npm run test:db`。

最终聚焦检查：Node 4/4（包含 1 个父测试与 3 个子例）、Vitest 2/2、全前端 `tsc --noEmit --incremental false`、新增 TSX 的 ESLint/Prettier 及 `git diff --check` 通过。本轮未重跑全量测试或浏览器，不把聚焦通过写成全量通过。

```sh
cd backend
NODE_ENV=test JWT_SECRET=test-only-jwt-secret-for-ci-123456 node --test src/integration/ordinary-setting-text.integration.js
cd ../frontend
npm run test -- src/app/dashboard/settings/ordinary-text.test.tsx
```

本轮无生产代码修复。组件卸载/挂载不是浏览器导航、Back/Forward 或真实刷新；完整 UI 保存、UI 保存错误提示和取消按钮生命周期均未执行。云端本地 Chromium/loopback 浏览器通道按任务限制不可用，本轮未启动浏览器或声称 hosted 验收通过。需要完整 UI 保存证据时，应先明确允许混合保存所涉及的字段范围；不能把本轮单键接口通过替代该结论。

排除范围保持不变：密钥/密码/邮件/连接测试、代理/认证/会话设置、备份恢复、角色变更、真实外部供应商请求、汇率与会计规则、暂停中的 AI 排查。
