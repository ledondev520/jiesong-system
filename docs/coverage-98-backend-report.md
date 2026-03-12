# 后端覆盖率 98% 推进报告（第一阶段）

## 目标
- 最终目标：将 backend 覆盖率推进到 `>=98%`
- 第一阶段目标：先打通可信的测试/coverage 基线，清掉会扭曲基线的门禁阻塞，再产出后续补测优先级

## 本阶段完成项
1. 修复 `backend/src/app.test.js` 的环境耦合
   - 原测试通过真实 `server.listen(0)` 请求 `/health`
   - 当前沙箱下会触发 `listen EPERM 0.0.0.0`
   - 已改为“带依赖替身加载 `app.js` + 直接验证 `/health` 路由注册与响应结构”，不再依赖真实 socket

2. 修复 `backend/src/middleware/rateLimit.js` 的退出阻塞
   - 原文件在模块顶层创建 `setInterval(...)`
   - 会让 `node --test`/coverage 在测试结束后长时间不退出
   - 已改为对清理定时器调用 `unref()`
   - 新增回归测试 `backend/src/middleware/rateLimit.init.test.js`，验证模块初始化后子进程可正常退出

3. 重新建立后端全量基线
   - 全量测试：`227/227` 通过
   - 全量 coverage：已拿到 Node 内建覆盖率汇总与文件级缺口清单

## 验证结果
### 测试门禁
- 命令：`cd backend && npm test`
- 结果：`227/227` 通过
- 总耗时：约 `157.1s`

### 覆盖率门禁基线
- 命令：`cd backend && node --test --experimental-test-coverage`
- 结果：
  - `lines: 63.88%`
  - `branches: 61.74%`
  - `functions: 55.40%`
- 说明：
  - Node 内建 coverage 直接输出 `line / branch / funcs`
  - 当前仓库尚未配置单独的 statements 汇总脚本，因此第一阶段报告先以 Node 原生命令作为单一可信基线

## 当前差距
- 距离 `98%` 目标仍有明显差距，当前主要不是“个别漏测”，而是大量 controller/service 文件只做了“模块可加载”级测试，函数覆盖偏低
- 从汇总看，当前拉低指标最明显的区域是：
  - `src/controllers/*.js`
  - `src/services/*.js`
  - `src/app.js`
  - `src/utils/secretCrypto.js`
  - `src/services/aiService.js`
  - `src/services/contractDocService.js`
  - `src/services/importService.js`

## 第二阶段优先级（按 ROI 排序）
1. 先补 controller 薄层行为测试
   - 这批文件函数覆盖普遍接近 `0%`
   - 通过直接调用 handler + mock `req/res/next`，补测成本低、提分效率高

2. 再补高价值 service 分支
   - 优先：
     - `src/services/exportService.js`
     - `src/services/pdfExportService.js`
     - `src/services/financeService.js`
     - `src/services/salesService.js`
     - `src/services/containerService.js`
     - `src/services/taxRefundExportService.js`

3. 最后处理重量级低覆盖模块
   - `src/services/aiService.js`
   - `src/services/contractDocService.js`
   - `src/services/importService.js`
   - 这类模块需要拆分可测纯函数或增加依赖替身，否则直接补到 98% 成本过高

## 本阶段结论
- 第一阶段已完成“可信基线建立”
- 当前 backend 已具备稳定继续冲刺 coverage 的前提
- 下一阶段不应再花时间处理测试门禁，而应直接进入按目录分批补测
