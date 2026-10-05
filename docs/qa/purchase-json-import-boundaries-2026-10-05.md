# JSON 采购导入失败边界回归

## 范围

- 基线：`ad8397a22496f11ab6e3a1a3d85f87631e9250fb`
- 仅本地隔离合成 Express/SQLite，真实数据库用户与 Bearer 认证；临时目录 0700、数据库 0600，TZ=UTC，测试进程 umask 022
- 从空的私有 SQLite 执行全部 30 个既有 Prisma migrations；没有 db push、重新生成共享 Prisma 客户端、依赖变更或生产写入
- 当前采购页面批量导入使用 `/purchases/import` Excel 路径。此次修复的是已挂载的 `/batch-import/purchase` JSON API，不能据此宣称采购导入 UI、取消文件选择或浏览器预览已验收

## 五个新增检查边界

| 边界 | 基线真实结果 | 修复或验证结果 |
| --- | --- | --- |
| 合法行、null、合法行混合 | HTTP 500；首行已提交但后续合法行被跳过，客户端拿不到部分成功统计 | 非对象行逐行失败，前后合法行都提交；null/数组/数字/字符串行有错误行号，显式编号跨请求重试不重复 |
| 省略 supplierName/productName | HTTP 200，误报成功并绑定首条供应商/商品；undefined Prisma 条件被忽略 | 省略/null/空白/非文本名称在查询前失败，完整业务快照不变 |
| 无效数量/单价 | 数量 0、-2 和单价 -3 均成功落库 | 沿用采购创建的有限数值范围：数量>0，单价>=0；仅接受数字及非空数值字符串，拒绝布尔/数组/对象/无效后缀。小数字符串和显式零单价仍成功 |
| 目录名称重复 | JSON API 选择首条同名供应商和商品 | 未修改；需要单独确认名称消歧语义，不能把既有历史 CSV 的消歧规则直接扩展至此接口 |
| 编号预览后多明细创建关联失败/修正重试 | 预览不保存；第二行商品不存在时 HTTP 500，但合同头/第一行全部回滚 | 保留现有 HTTP 错误状态；完整快照证明回滚，修正后复用原编号成功且只有两条明细 |

所有拒绝操作对合同、采购明细、供应商、商品、到货、验货和库存做完整快照比较。正常导入/创建均只形成草稿，没有新增库存或收验货证据。没有真实供应商下单、外部通信、文件上传或金融交易。

## 既有覆盖与避免重复

- PR40 的 `purchase-batch-import.integration.js` 已覆盖实际 SQL 明细故障逐行回滚、四请求编号竞争、显式编号重复、缺失的具名引用及 JSON 角色边界
- `procurement-lifecycle.integration.js` 已覆盖实际 Excel 导入、自定义/溢出编号、并发导入以及收验货与来源库存闭环
- 此次不修改普通采购角色、Excel 历史补录规则、来源库存状态机、同名目录选择或新增幂等功能

## 验证

修复前新增的三个 JSON 回归组真实失败；编号预览/多行创建回滚组已经通过。修复后以下命令通过 19/19，无跳过：

```sh
cd backend
umask 022
TZ=UTC NODE_ENV=test JWT_SECRET=test-only-jwt-secret-for-ci-123456 node --test \
  src/integration/purchase-batch-import.integration.js \
  src/services/batchImportService.test.js \
  src/agent/commands/purchase/createPurchaseWithItems.test.js
```

这是局部真实 HTTP/迁移 SQLite 与关联单元测试结果，不是生产、浏览器或全仓库验收。发布、合并和生产复核由发布协调者负责。

另跑既有 `procurement-lifecycle.integration.js`、`received-purchase-edits.integration.js` 和 `purchase-receipt-exceptions.integration.js`，19/19 通过，无跳过；这些相关回归确保 Excel/收验货/来源保护既有路径未回退。两份验证总计 38 个测试计数，不替代全仓库 aggregate。
