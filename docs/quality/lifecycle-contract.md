# 生命周期合同

## 局部更新

`backend/src/utils/partialUpdate.js` 用字段策略白名单构造 Prisma 更新数据。字段未传、undefined、可选字段空串及空白不写入。显式 null 只清空声明 nullable 的字段。必填字段空白或 null 拒绝整次请求。类型不匹配返回400，不把对象或布尔字符串强转为文本。

已迁移报关行与港口更新。报关行表单已用 null 表达主动清空。创建接口保持原有默认值。

剩余待迁清单按入口分组，迁移时需先核对各自状态机、事务、字段类型与清空语义。不可机械地把整个请求体传入 Prisma。

| 入口 | 实现 | 暂留理由 |
| --- | --- | --- |
| 商品分类 | `backend/src/controllers/system/portCategoryController.js` updateCategory | parentId空串仍为旧版清空协议，需连同调用者迁移 |
| 商品、供应商、采购、门店 | `backend/src/controllers/{productController,storeController}.js`、`backend/src/agent/commands/{supplier/updateSupplier,purchase/updatePurchase}.js` | HTTP与Agent共用命令，关联字段及收货约束须保留 |
| 出口合同、装箱、货柜 | `backend/src/services/{salesService,containerService}.js` | 有库存扣减与状态转换事务 |
| 报关、核销、退税、税率 | `backend/src/services/{customsDeclarationService,forexVerificationService,taxRefundService,taxRateService}.js` | 草稿替换、业务状态与财务口径须单独测试 |
| 用户、档案、配置及财务资料 | `backend/src/controllers/userController.js`、`backend/src/services/authService.js`、`backend/src/controllers/system/configController.js`、`backend/src/services/{financialStatementsService,financialEvidenceService}.js` | 权限、会话、敏感字段与快照约束须单独审查 |
| 其他存量写入口 | `lifecycle/legacy-routes.json` | 逐路由记录，新增入口不得加入豁免基线 |

## 列表URL状态

`frontend/src/lib/hooks/useListUrlState.ts` 持有列表字段定义。页面只调用setState，不再手写URL拼接或用effect把本地筛选写回URL。库存分页、筛选与商品页签和报关分页、筛选已迁移。已有安全报关returnTo解析与新文档返回仍由 `customs-return-context.ts` 负责，返回地址包含全部分页字段。其他列表为存量，逐步迁移。

## 资源检查与矩阵

从根目录执行 `node scripts/check-lifecycle.cjs`，或在 backend 执行 `npm test`。CI的后端作业执行同一命令，checkout保留完整Git历史供基线核验。`npm run test:db`执行真实HTTP与合成SQLite的通用矩阵。前端 `npm test -- --maxWorkers=2`执行列表矩阵。

`lifecycle/resources.json`登记2项资源、2项列表合同。`lifecycle/legacy-routes.json`逐条登记PR #62已有的125个POST/PUT/PATCH入口和暂留理由。Acorn语法树递归扫描路由目录，忽略注释与外部HTTP调用，识别直接声明的Router、Express Router解构重命名、变量声明别名及保存的route句柄，支持字面量方法、数组路径与链式route。已识别实例的动态方法与路径拒绝通过。扫描器不执行任意JavaScript，工厂封装或运行时生成的路由需要先扩展扫描与回归用例。新增POST包含只读POST，避免靠“创建类”命名判断漏检。

检查逐路由匹配，既有文件内新加路由也必须登记。基线固定为 `56426be209e270024008b761dbd835a54a6c4c47`；新增路由不能通过追加存量清单逃过检查。存量删除不失败，登记的合同必须仍有效。错误指出资源注册表、更新函数、测试文件和 `lifecycle/resource.template.json`。先复制模板为资源定义，填写全部矩阵输入；测试从注册表自动枚举资源，不能只放一个空测试路径。

当前普通档案矩阵执行POST集合与PUT `/:id`，每项资源必须登记对应的两个入口，集合路径须与matrix.path匹配，不得复制另一资源的matrix.path充当覆盖。其他写方法或特殊动作须先增加实际HTTP适配器及相应检查。更新函数中的partialUpdate调用检查只验证调用存在，实际持久化语义仍由HTTP与SQLite回读验证。

后端矩阵覆盖创建、局部编辑、无效编辑原子拒绝、可选空串保留、显式清空、HTTP刷新及独立只读SQLite回读、带关键词的返回地址回放。港口没有可清空的字段，清空步骤断言400与原记录不变。新矩阵发现并修复本轮两资源keyword过滤的SQLite `mode`不兼容问题。它不假装验证真实浏览器。

前端列表矩阵自动枚举注册表，挂载真实库存/报关列表组件。服务使用合成mock，覆盖URL筛选、分页、原生history返回、重新挂载刷新及页签、其他参数与hash保留。新列表必须在 `list-lifecycle.test.tsx` 增加实际组件适配器；未知ID直接失败。组件单测另覆盖真实报关returnTo生成及产品页签恢复。HTTP矩阵和组件矩阵分层执行，不代表浏览器端到端验证。

模板只适用于普通档案。具有收货、付款、附件、认证、库存扣减等状态或事务的资源，迁移前需要专用适配器与失败场景；不得为了套用模板改业务口径。剩余待迁写入口以存量JSON为完整清单，上表给出主要边界。

## 重现历史回归

在独立临时worktree保留当前测试，仅恢复历史修复前的产品文件。`git restore --source=c30b243^ -- backend/src/controllers/system/customsBrokerController.js backend/src/controllers/system/portCategoryController.js` 应让检查与资源矩阵失败。`git restore --source=ad8397a^ -- frontend/src/app/customs-declarations/components/CustomsDeclarationListPageContent.tsx frontend/src/app/customs-declarations/components/CustomsDeclarationDetailPageContent.tsx` 应让检查与新报关进入/返回测试失败。

每次恢复当前HEAD文件后，运行完全相同的命令确认转绿。资源矩阵命令是 `NODE_ENV=test JWT_SECRET=test-only-jwt-secret-for-ci-123456 node --test src/integration/resource-lifecycle.integration.js`，工作目录backend。报关反证命令是 `npm test -- --maxWorkers=2 src/lib/hooks/list-lifecycle.test.tsx -t 'customs detail receives|customs explicit return'`，工作目录frontend。测试只建立临时合成库，不使用真实配置或业务数据。
