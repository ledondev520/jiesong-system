# 后端源码目录

> 若本文件夹结构或内容变化，请更新本文件。

## 目的

存放后端 API 所有源代码文件，实现进销存系统的完整业务逻辑。

## 文件清单

| 文件/目录 | 地位 | 功能 |
|-----------|------|------|
| app.js | 入口 | Express 应用初始化和启动 |
| config/ | 配置层 | 环境变量和常量定义（含配置/常量单元测试） |
| controllers/ | 控制层 | 处理 HTTP 请求，调用服务层 |
| middleware/ | 中间件层 | 认证、日志、错误处理（含单元测试） |
| routes/ | 路由层 | 定义 API 路由和参数验证 |
| services/ | 服务层 | 业务逻辑实现 |
| utils/ | 工具层 | 通用工具函数（含校验/响应单元测试） |

## 控制器清单

| 文件 | 功能 |
|------|------|
| authController.js | 用户认证、授权与找回密码 |
| supplierController.js | 供应商管理 CRUD |
| storeController.js | 门店管理 CRUD + 港口 |
| productController.js | 商品管理 + 历史价格 |
| purchaseController.js | 采购合同 + 文件上传 |
| salesController.js | 出口合同 + 价格计算 |
| containerController.js | 货柜管理 + 装箱明细 |
| inventoryController.js | 库存状态管理 |
| financeController.js | 付款与账款管理 |
| systemController.js | 系统配置 + 数据导入导出 |
| aiController.js | AI问答 + 辅助录入 |

## 服务清单

| 文件 | 功能 |
|------|------|
| authService.js | 登录验证、Token生成、密码管理、找回密码 |
| aiService.js | Kimi API集成、智能问答、内容解析 |
| importService.js | CSV数据解析与导入 |
| exportService.js | 多格式数据导出 (CSV) |

## 工具清单

| 文件 | 功能 |
|------|------|
| prisma.js | Prisma 客户端实例 |
| response.js | 统一响应格式 |
| validators.js | 参数验证规则 |
| upload.js | 文件上传 (multer) |
| auditLog.js | 操作日志记录 |
