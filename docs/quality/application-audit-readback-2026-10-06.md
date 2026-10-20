# 系统日志应用审计回读（2026-10-06）

固定矩阵第32行 `/dashboard/system/logs`，基线 `9d95c71ec78da93b5fce396f8eb86d1cfc71be4d`。

## 已复现问题及修复

实际 `GET /api/v1/system/logs?keyword=product` 与 `GET /api/v1/system/logs/export/csv?keyword=product` 均返回500，Prisma SQLite 报 `Unknown argument mode`。复现仅使用迁移创建的私有合成数据库。共享 `buildOperationLogWhere` 为关键词八个字段和 IP 子串错误传入 PostgreSQL 的 `mode: 'insensitive'`。

最小修复删除九个不支持的 `mode` 属性，继续使用 Prisma SQLite `contains`（LIKE，ASCII大小写不敏感）。不增加Unicode大小写折叠、改变查询维度、日期时区、分页或导出规则，不修改角色策略。

## 真实证据

`backend/src/integration/application-audit-readback.integration.js` 使用实际 Express、正常认证/限流、已提交 SQL 迁移、0700临时目录/0600 SQLite。固定源码字面夹具独立插入，独立只读 SQL 连接比较全部应用表及每个持久字段。一次真实创建合成分类产生预期业务行/审计，既有系统商品导出产生预期读操作审计；日志读取与日志CSV零额外持久变更。

六个验收场景（Node合计7项）覆盖：

1. action/entity/entityId/oldValue/newValue/IP/用户姓名/用户名八种关键词及独立IP筛选；真实列表与CSV顺序/ID一致，ASCII大小写和中文、空结果可读
2. userId/entity/action组合、日期首尾毫秒、日期形式结束日包含23:59:59.999、ISO结束值精确到指定时刻；两页查询与不受分页限制的导出、limit=1；错误/倒序日期返回400
3. 完整旧新快照、实体ID、时间、真实关联用户DTO；空用户/空旧值、中文、逗号、引号、换行经真正UTF-8 BOM下载及独立CSV解析保留全部12列的字面内容
4. ADMIN正常查询/导出；FINANCE/BOSS/SALES/PURCHASE/WAREHOUSE两端点403，未认证401；所有拒绝保持全库原样
5. 实际HTTP创建分类，等待正常finish审计落库；经实体ID完整查询读回真实ADMIN操作者及新值；重复列表/CSV不新增业务行，也不新增审计行
6. 既有 `/system/export/products` 真正生成空商品CSV并新增一条 `DataExport/EXPORT` 审计；全库比较确认非审计表完全不变，之后系统日志列表/CSV仍能读取其元数据且不重写

日志列表与日志CSV本身没有读审计包装，此次不新增或停用任何审计；其他既有系统业务导出所产生的 `DataExport/EXPORT` 读操作审计保持原样，不能把这些元数据说成业务写入。

## 执行与边界

Node20.19.0、TZ=UTC、Python3 sqlite3及仓库锁定依赖：

```sh
cd backend
NODE_ENV=test JWT_SECRET=test-only-application-audit-never-for-production node --test src/integration/application-audit-readback.integration.js
```

修复前列表/CSV为 `[500,500]`，最初五个场景修复后6/6通过；最终六个场景合计7项在聚合数据库门禁通过。既有通知控制器/系统路由11/11、前端日志页面/展示/服务10/10通过。

最终 `npm run test:all`：单元759/759、数据库集成200/200、船司PDF5/5，全部通过。聚合单元中四个既有financeService测试会真实调用Prisma groupBy，须预先将已提交SQL迁移应用到独立空合成SQLite并显式设置DATABASE_URL；第一次缺少此CI前置条件的调用失败，补齐后完整重跑通过。没有使用现有数据库、db push或generate。

现有UI只有摘要列表，没有详情按钮/弹窗或独立详情API；此套完整记录通过既有列表DTO的实体ID筛选读回，不能声称点击详情已验收。既有CSV列也不包含 actorType/Agent身份字段，这次没有改动输出契约。

没有运行浏览器；本地Chromium/loopback受限不尝试启动参数、安装、隧道或换电脑绕过。没有浏览器截图或生产验收结论。没有访问OS日志、真实执行/AI会话历史、真实用户、凭据/认证存储、生产服务或外部供应商。不运行db push或客户端generate。
