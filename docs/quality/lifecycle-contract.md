# 生命周期合同

## 局部更新

`backend/src/utils/partialUpdate.js` 用字段策略白名单构造 Prisma 更新数据。字段未传、undefined、可选字段空串及空白不写入。显式 null 只清空声明 nullable 的字段。必填字段空白或 null 拒绝整次请求。类型不匹配返回400，不把对象或布尔字符串强转为文本。

已迁移报关行与港口更新。报关行表单已用 null 表达主动清空。创建接口保持原有默认值。

剩余待迁清单按入口分组，迁移时需先核对各自状态机、事务、字段类型与清空语义。不可机械地把整个请求体传入 Prisma。

| 入口 | 实现 | 暂留理由 |
| --- | --- | --- |
| 商品分类 | `backend/src/controllers/system/portCategoryController.js` updateCategory | parentId空串仍为旧版清空协议，需连同调用者迁移 |
| 商品、供应商、采购、门店 | `backend/src/agent/commands/{product,supplier,purchase,store}.js` | HTTP与Agent共用命令，关联字段及收货约束须保留 |
| 出口合同、装箱、货柜 | `backend/src/services/{salesService,containerService}.js` | 有库存扣减与状态转换事务 |
| 报关、核销、退税、税率 | `backend/src/services/{customsDeclarationService,forexVerificationService,taxRefundService,taxRateService}.js` | 草稿替换、业务状态与财务口径须单独测试 |
| 用户、档案、配置及财务资料 | `backend/src/controllers/userController.js`、`backend/src/services/authService.js`、`backend/src/controllers/system/configController.js`、`backend/src/services/financialLibraryService.js` | 权限、会话、敏感字段与快照约束须单独审查 |
| 其他存量写入口 | `lifecycle/legacy-routes.json` | 逐路由记录，新增入口不得加入豁免基线 |
