# Jiesong System 代码审计与 PRD 对齐报告

- 生成时间：2026-03-05
- 范围：
  - 需求文档：
    - [docs/PRD.md](/Users/helena/Cursor/jiesong_system/docs/PRD.md)
    - [docs/需求总结_v2.0.md](/Users/helena/Cursor/jiesong_system/docs/需求总结_v2.0.md)
    - [docs/需求文档-工作台与采购建议系统.md](/Users/helena/Cursor/jiesong_system/docs/需求文档-工作台与采购建议系统.md)
    - [docs/功能分析与待办清单.md](/Users/helena/Cursor/jiesong_system/docs/功能分析与待办清单.md)
    - [docs/数据库设计.md](/Users/helena/Cursor/jiesong_system/docs/数据库设计.md)
    - [docs/前端统一重构验收清单.md](/Users/helena/Cursor/jiesong_system/docs/前端统一重构验收清单.md)
  - 技术文档：
    - [docs/技术方案.md](/Users/helena/Cursor/jiesong_system/docs/技术方案.md)
    - [docs/系统架构落地执行方案.md](/Users/helena/Cursor/jiesong_system/docs/系统架构落地执行方案.md)
    - [docs/系统简化方案.md](/Users/helena/Cursor/jiesong_system/docs/系统简化方案.md)
    - [docs/数据导入与清洗方案.md](/Users/helena/Cursor/jiesong_system/docs/数据导入与清洗方案.md)
    - [docs/模拟数据汇总.md](/Users/helena/Cursor/jiesong_system/docs/模拟数据汇总.md)
  - 关键实现代码：
    - [backend/src/app.js](/Users/helena/Cursor/jiesong_system/backend/src/app.js)
    - [backend/src/routes/index.js](/Users/helena/Cursor/jiesong_system/backend/src/routes/index.js)
    - [backend/src/controllers/purchaseController.js](/Users/helena/Cursor/jiesong_system/backend/src/controllers/purchaseController.js)
    - [backend/src/controllers/salesController.js](/Users/helena/Cursor/jiesong_system/backend/src/controllers/salesController.js)
    - [backend/src/controllers/inventoryController.js](/Users/helena/Cursor/jiesong_system/backend/src/controllers/inventoryController.js)
    - [backend/src/controllers/containerController.js](/Users/helena/Cursor/jiesong_system/backend/src/controllers/containerController.js)
    - [backend/src/controllers/financeController.js](/Users/helena/Cursor/jiesong_system/backend/src/controllers/financeController.js)
    - [backend/src/controllers/systemController.js](/Users/helena/Cursor/jiesong_system/backend/src/controllers/systemController.js)
    - [backend/src/controllers/aiController.js](/Users/helena/Cursor/jiesong_system/backend/src/controllers/aiController.js)
    - [backend/src/controllers/dataImportController.js](/Users/helena/Cursor/jiesong_system/backend/src/controllers/dataImportController.js)
    - [backend/src/controllers/contractDocController.js](/Users/helena/Cursor/jiesong_system/backend/src/controllers/contractDocController.js)
    - [backend/src/services/authService.js](/Users/helena/Cursor/jiesong_system/backend/src/services/authService.js)
    - [backend/src/services/aiService.js](/Users/helena/Cursor/jiesong_system/backend/src/services/aiService.js)
    - [backend/src/services/importService.js](/Users/helena/Cursor/jiesong_system/backend/src/services/importService.js)
    - [backend/src/services/exportService.js](/Users/helena/Cursor/jiesong_system/backend/src/services/exportService.js)
    - [backend/src/middleware/auth.js](/Users/helena/Cursor/jiesong_system/backend/src/middleware/auth.js)
    - [backend/src/utils/upload.js](/Users/helena/Cursor/jiesong_system/backend/src/utils/upload.js)
    - [backend/src/utils/inventoryStateMachine.js](/Users/helena/Cursor/jiesong_system/backend/src/utils/inventoryStateMachine.js)
    - [backend/src/config/index.js](/Users/helena/Cursor/jiesong_system/backend/src/config/index.js)
    - [frontend/src/app/(main)/dashboard/page.tsx](/Users/helena/Cursor/jiesong_system/frontend/src/app/(main)/dashboard/page.tsx)
    - [frontend/src/app/(main)/procurement](/Users/helena/Cursor/jiesong_system/frontend/src/app/(main)/procurement)
    - [frontend/src/app/(main)/sales](/Users/helena/Cursor/jiesong_system/frontend/src/app/(main)/sales)
    - [frontend/src/app/(main)/inventory](/Users/helena/Cursor/jiesong_system/frontend/src/app/(main)/inventory)
    - [frontend/src/app/(main)/finance](/Users/helena/Cursor/jiesong_system/frontend/src/app/(main)/finance)
    - [frontend/src/app/(main)/contract](/Users/helena/Cursor/jiesong_system/frontend/src/app/(main)/contract)
    - [frontend/src/app/(main)/container](/Users/helena/Cursor/jiesong_system/frontend/src/app/(main)/container)
    - [frontend/src/app/(main)/system](/Users/helena/Cursor/jiesong_system/frontend/src/app/(main)/system)
    - [frontend/src/services](/Users/helena/Cursor/jiesong_system/frontend/src/services)

---

## 1) 与 PRD 对齐的已完成特性清单

### A. 核心业务域
1. [x] 用户登录/注册/退出与鉴权中间件接入
   - 路由与控制器实现存在（`/api/v1/auth/*`）
   - 关联文件：`backend/src/routes/auth.js`、`backend/src/controllers/authController.js`

2. [x] 采购合同与采购明细 CRUD（分页、检索、编辑、删除）
   - 主要实现：`backend/src/controllers/purchaseController.js`

3. [x] 销售合同与销售明细/出库流程 CRUD
   - 主要实现：`backend/src/controllers/salesController.js`

4. [x] 库存查询与基础变更（含多维度列表）
   - 主要实现：`backend/src/controllers/inventoryController.js`

5. [x] 容器/货柜管理（含与销售合同兼容映射）
   - 主要实现：`backend/src/controllers/containerController.js`、`backend/src/services/containerService.js`

6. [x] 财务模块（应收/应付/收支统计、明细录入与查询）
   - 主要实现：`backend/src/controllers/financeController.js`、`backend/src/services/exportService.js`

7. [x] 数据导入（系统级/独立导入）与导出（CSV、Excel）
   - 导入：`backend/src/controllers/dataImportController.js`、`backend/src/services/importService.js`
   - 导出：`backend/src/services/exportService.js`

8. [x] AI 辅助接口（问答/解析/会话管理）与接口路由
   - 主要实现：`backend/src/controllers/aiController.js`、`backend/src/services/aiService.js`

9. [x] 合同文档生成（Word）和下载接口
   - 主要实现：`backend/src/controllers/contractDocController.js`

10. [x] 前端工作台与主要模块页面已完成并可访问
   - 页面入口完整且与后端接口有适配：dashboard、采购、销售、库存、财务、合同、容器、系统等

11. [x] 系统日志查询接口/操作日志视图基础存在
   - 主要实现：`backend/src/controllers/systemController.js`、`backend/src/routes/system.js`

### B. 结构性实现
1. [x] 分层结构（路由-控制器-服务）初步建立
2. [x] Prisma ORM 与数据库模型定义完整
   - 见：`prisma/schema.prisma`
3. [x] 统一错误处理中间件存在，前后端接口返回风格统一
4. [x] 文档化 API 契约文件存在，前后端集成入口可被联调
   - [docs/api-contracts/README.md](/Users/helena/Cursor/jiesong_system/docs/api-contracts/README.md)

---

## 2) 缺失功能与关键偏差（按优先级）

### P0（阻断级）
1. [ ] 文件上传配置与 PRD 不一致（50MB）
   - 现状：上传中间件上限为 10MB（`backend/src/utils/upload.js`），`backend/src/routes/dataImport.js` 同样约束为 10MB。
   - 影响：高于文档要求的采购/合同/附件场景会被截断，形成真实业务不可用路径。
   - 关联：PRD 文件上传章节（合同与附件类上传约束）

2. [ ] API Key（第三方模型密钥）明文持久化
   - 现状：配置持久化逻辑以明文序列化保存（`systemController.updateConfig`）；注释中存在“加密存储占位”但未落地。
   - 影响：密钥泄露风险高，属于安全红线。
   - 关联：`backend/src/controllers/systemController.js`

### P1（高）
3. [ ] 状态机规则未全面强制执行（业务状态可任意跳转）
   - 现状：`purchaseController.updateStatus` 与 `salesController.updateStatus` 缺少状态枚举白名单/合法流转校验。
   - 已有 `inventoryStateMachine` 工具但未在关键状态更新写入前完整接入。
   - 影响：会产生非法状态流（如未完成入库即完结等），导致库存与财务口径偏差。
   - 关联：`backend/src/controllers/purchaseController.js`, `backend/src/controllers/salesController.js`, `backend/src/utils/inventoryStateMachine.js`

4. [ ] 采购到库存联动不完整
   - 现状：采购明细/审核路径未稳定触发库存记录（入库）完整生命周期（草稿→待检验→入库）的闭环。
   - 影响：库存口径可见不一致，影响可售/可用库存与财务成本计算。
   - 关联：`backend/src/controllers/purchaseController.js`, `backend/src/controllers/inventoryController.js`

5. [ ] 权限与角色控制颗粒度不足
   - 现状：大量写操作仅通过基础登录鉴权，不足管理员/财务/仓管角色分离；`auth` 路由含公开注册与找回密码与激活闭环脱节。
   - 影响：越权修改风险，合规审计风险高。
   - 关联：`backend/src/routes/*`, `backend/src/middleware/auth.js`

6. [ ] 日志审计未在所有关键写操作落地
   - 现状：存在操作日志读取接口，但关键写入（采购、销售、库存调整、财务核销）未统一调用。
   - 影响：可追溯性不完整，审计要求不达标。
   - 关联：`backend/src/controllers/*` 写操作分散，`systemController.getOperationLogs`

7. [ ] 缺少 PDF 报表导出（PRD 明确 P2 PDF）
   - 现状：导出能力覆盖 CSV 与 3 表 Excel，缺失 PDF 统一产出。
   - 影响：报表归档与对外交付体验不足。
   - 关联：`backend/src/services/exportService.js`

### P2（中高）
8. [ ] AI 文档解析与 OCR/规则解析仍有 Mock/演进痕迹
   - 现状：`docs/模拟数据汇总.md` 与前端/接口注释中存在 Mock Parse 的历史痕迹；需确认生产环境是否全部切换到真实解析。
   - 影响：用户导入体验和识别准确性不确定。
   - 关联：`docs/模拟数据汇总.md`, `backend/src/controllers/aiController.js`

9. [ ] 导入导出接口不统一（历史路径残留）
   - 现状：存在 `/api/v1/import/*` 与 `/api/v1/system/import/*` 并行语义，存在迁移历史遗留。
   - 影响：文档与代码边界不清晰，运维和联调成本高。

10. [ ] 多模块存在历史模拟数据注释与容器/合同映射兼容逻辑
   - 现状：为兼容老数据，存在“销售合同当货柜”映射逻辑。
   - 影响：未来扩展时增加认知复杂度与缺陷概率。

### P3（中）
11. [ ] 字段与文案层一致性不足
   - 现状：部分前端页面仍依赖兼容字段/回退逻辑；文档中“验收清单”显示若干待验收项。
   - 影响：产品体验偶发不一致。

12. [ ] 测试与验收证据不完整
   - 现状：代码层面可见 mock 标签、联调面板仍有“待验证”入口，缺少覆盖关键流程的持续化测试证据。

---

## 3) 技术债

### 3.1 架构与演进债
1. 路径与职责迁移未完成收口
   - 现象：旧入口与新入口并行（system import vs import），前后端文档与实现在不同版本共存。
   - 风险：未来改造难以定位真实来源、容易重复修改。

2. 历史兼容语义未外层化
   - 现象：SalesContract 兼容“容器”模型的临时语义混杂在控制层。
   - 风险：长周期后影响查询/报表模型边界定义。

3. Mock 与真实路径边界不清晰
   - 现象：模拟数据文档与历史演示数据逻辑未被清理，部分组件仍显示/处理 Mock 注释。
   - 风险：新增功能时被错误复制到生产流程。

### 3.2 可维护性债
4. 控制器层职责较重，事务边界不明显
   - 多数控制器直接执行校验、状态变更、库存/财务联动与返回拼装，事务回滚策略难统一。

5. 验证与授权策略分散
   - 缺少统一 DTO/Schema 校验层；不同控制器的参数校验深浅不一致。

6. 配置管理散点化
   - AI 配置、系统配置、文件处理策略跨 controller/service 边界重复实现。

### 3.3 可靠性债
7. 并发与幂等未系统化
   - 状态更新与库存更新无幂等保护；重复提交可能导致重复扣减/重复入账。

8. 长事务缺失与错误补偿未见
   - 关键链路（采购入库+库存更新+财务归集）未形成统一 saga 或统一事务边界。

---

## 4) 安全问题（分级）

### P0（必须先修）
1. JWT Secret 回退明文默认值风险
   - `backend/src/config/index.js` 允许出现弱默认值；若环境变量未配置会启动弱签名基线。
   - 建议：启动前强制校验 `JWT_SECRET` 存在且长度合规；测试环境支持专用测试密钥。

2. CORS 安全边界过宽
   - 允许 `*` 来源可能导致来源控制失效。
   - 建议：限定白名单域名，禁止生产环境的任意来源。

3. API Key 明文存储
   - 已在 `systemController.updateConfig` 与 AI 配置链路中使用明文处理。
   - 建议：使用托管密钥服务（KMS/Vault）或数据库字段加密；所有读取与返回时严格脱敏。

### P1（高）
4. 文件上传校验不足
   - 上传仅做 MIME 和大小控制，未统一文件扩展名/签名校验与病毒扫描接口。
   - 风险：可被利用上传恶意文件（结合解析处理路径）。

5. 鉴权粒度不足
   - 多接口未加基于角色的授权（RBAC），部分接口只做登录校验。
   - 风险：越权读取和越权变更。

6. 缺少关键防护能力
   - 未见登录/接口统一速率限制、重试限制、暴力破解防护。

### P2（中）
7. 错误信息与日志脱敏不统一
   - 错误返回和日志中可能包含敏感上下文（未进行最小化过滤）。

8. 供应商/合同文件等附件目录权限和生命周期控制缺失
   - 上传目录权限、清理策略、保留期限未在审计中明确。

9. 生产环境运行配置未做强制校验
   - 数据库连接、AI endpoint、外网回调地址等关键配置需强化环境校验。

---

## 5) 与 PRD 的覆盖度评估（简要）

| 领域 | 覆盖度估计 | 结论 |
|---|---:|---|
| 登录与账号管理 | 70% | 登录可用，注册/激活/权限闭环仍偏弱 |
| 采购/销售主流程 | 75% | 可运行，状态流与库存闭环有缺口 |
| 库存管理 | 80% | 查询完整，联动一致性有改进空间 |
| 宾馆/门店/供应商基础主数据 | 65% | CRUD 已有，标准化验收标准差异较多 |
| 合同与货柜/容器 | 80% | 功能存在，但语义兼容策略需持续治理 |
| 财务结算与报表 | 70% | 核心展示存在，导出能力缺 PDF |
| 数据导入导出 | 85% | 可用，文件尺寸上限与路径治理需修复 |
| AI 辅助与文档生成 | 78% | 功能可达，解析链路仍需确认无 Mock 依赖 |
| 审计与权限控制 | 55% | 目前是最低完成度 |

（注：上述为审计阶段估计值，来源于代码-文档对照抽检。）

---

## 6) 结论与优先修复建议

### 结论
系统已经完成了“端到端可运行”的主链路，属于**功能可见但有结构性回退风险**状态；核心问题不在界面是否存在，而在“规则正确性、权限闭环、安全合规和账实一致性”上。

### 建议（按实施优先级）

1. 先修安全与合规（P0/P1）
- 修复 JWT 默认值策略与 CORS 白名单
- 实现 API Key 加密存储与脱敏读取
- 为关键文件入口加入扩展名+签名双校验与清晰目录权限
- 补齐 RBAC，在每条写接口落地管理员/角色校验

2. 修复业务正确性（P1）
- 统一状态更新状态机，禁止非法流转
- 补齐采购与库存闭环（入库动作、库存记录、库存快照）
- 确立库存与财务联动的事务边界

3. 完善功能对齐（P1/P2）
- 统一导入导出路径规范，收敛到单一契约
- 补齐 PDF 报表导出并纳入验收标准
- 清理 Mock 运行路径，增加“真实模型开关”与数据验真
- 完善日志记录（operation log）为关键写操作链路的统一审计事件

4. 降低技术债（P2）
- 清理历史兼容映射文案，逐步解耦容器/销售语义
- 拆分过重控制器逻辑，抽象服务层事务与幂等策略
- 把验收清单、API契约与实现形成 1:1 链接（含验收 evidence）

---

## 7) 下一步计划（建议）

1. 形成 3 个月内修复矩阵：
   - 第 1 周：安全加固（JWT/CORS/密钥加密/权限）
   - 第 2 周：状态机与库存闭环（含回归用例）
   - 第 3 周：导入导出统一与 PDF 报表
   - 第 4 周：日志审计与反向兼容清理

2. 增加验收脚本化门禁（示例）
   - 用例：状态机非法跳转拦截
   - 用例：上传 50MB 文件成功/超限失败
   - 用例：关键写操作是否写入 operation log
   - 用例：角色越权访问 403 验证
   - 用例：采购入库后库存一致性核验

---

## 8) 风险与假设

- 本报告基于当前抽样审计与文档-代码对照，未逐文件逐句执行静态扫描和全量自动化测试。
- 文档中若存在未纳入评估的新增需求（新 PRD 版本）需追加一次增量对齐。
- 若需在报告中附“逐项合规证据清单（含接口测试截图/日志/SQL 核对）”，建议下一轮补充执行自动化验收并重新发布修订版。

