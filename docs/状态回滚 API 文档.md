# 状态回滚 API 文档

**版本**: 1.0.0
**更新时间**: 2026-03-11

---

## 概述

本系统支持采购合同和销售合同的状态回滚操作。当合同状态从高级状态回退到低级状态时，系统会自动回滚相关的库存记录，确保数据一致性。

---

## 采购合同状态回滚

### 状态流转图

```
DRAFT → PENDING_INSPECTION → IN_STOCK → COMPLETED
  ↑            ↑                  ↑
  └────────────┴──────────────────┘
           (支持回滚)
```

### 回滚触发条件

| 当前状态 | 目标状态 | 回滚操作 |
|---------|---------|---------|
| `PENDING_INSPECTION` | `DRAFT` | 无库存回滚 |
| `IN_STOCK` | `PENDING_INSPECTION` | **回滚入库记录** |
| `COMPLETED` | `IN_STOCK` | 无库存回滚 |

### API 端点

```
PUT /api/v1/purchases/:id/status
```

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 采购合同 ID |
| `status` | string | 是 | 目标状态 |

### 请求示例

```bash
curl -X PUT http://localhost:3000/api/v1/purchases/pc-123/status \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"status": "PENDING_INSPECTION"}'
```

### 回滚副作用

当从 `IN_STOCK` 回退到 `PENDING_INSPECTION` 时：

1. **库存记录删除**: 删除与该采购合同相关的所有入库记录
2. **财务金额重置**: 重新计算采购合同总金额
3. **审计日志**: 记录 `REVERT_IN_STOCK` 操作

### 响应示例

```json
{
  "success": true,
  "message": "状态更新成功",
  "data": {
    "id": "pc-123",
    "contractNo": "CG2600001",
    "status": "PENDING_INSPECTION",
    "updatedAt": "2026-03-11T10:30:00.000Z"
  }
}
```

---

## 销售合同状态回滚

### 状态流转图

```
DRAFT → CONFIRMED → PACKING → OUT_STOCK → COMPLETED
  ↑         ↑          ↑           ↑
  └─────────┴──────────┴───────────┘
            (支持回滚)
```

### 回滚触发条件

| 当前状态 | 目标状态 | 回滚操作 |
|---------|---------|---------|
| `CONFIRMED` | `DRAFT` | 无库存回滚 |
| `PACKING` | `CONFIRMED` | 无库存回滚 |
| `OUT_STOCK` | `PACKING` | **恢复出库记录** |
| `COMPLETED` | `OUT_STOCK` | 无库存回滚 |

### API 端点

```
PUT /api/v1/sales/:id/status
```

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 销售合同 ID |
| `status` | string | 是 | 目标状态 |

### 请求示例

```bash
curl -X PUT http://localhost:3000/api/v1/sales/sc-456/status \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"status": "PACKING"}'
```

### 回滚副作用

当从 `OUT_STOCK` 回退到 `PACKING` 时：

1. **库存记录恢复**: 将已出库的库存记录恢复为可用状态
   - 状态从 `OUTBOUND` 改为 `INBOUND`
   - 清空 `salesItemId` 和 `salesContractId` 关联
   - 清空 `outboundAt` 时间戳
2. **财务金额重置**: 重新计算销售合同总金额
3. **成本价保留**: 销售明细的 `costPrice` 保持不变
4. **审计日志**: 记录 `REVERT_OUT_STOCK` 操作

### 响应示例

```json
{
  "success": true,
  "message": "状态更新成功",
  "data": {
    "id": "sc-456",
    "contractNo": "EXP2600001",
    "status": "PACKING",
    "updatedAt": "2026-03-11T10:30:00.000Z"
  }
}
```

---

## 审计日志

### 日志类型

| 操作类型 | 说明 | 记录内容 |
|---------|------|---------|
| `APPLY_IN_STOCK` | 采购入库 | 创建的库存记录数、跳过的记录数 |
| `REVERT_IN_STOCK` | 采购回滚 | 恢复的库存记录数 |
| `APPLY_OUT_STOCK` | 销售出库 | 出库的商品总数 |
| `REVERT_OUT_STOCK` | 销售回滚 | 恢复的库存记录数 |

### 查询审计日志

```
GET /api/v1/system/logs?entity=PurchaseContract&action=REVERT_IN_STOCK
GET /api/v1/system/logs?entity=SalesContract&action=REVERT_OUT_STOCK
```

---

## 监控日志

### 控制台日志格式

```
[库存回滚] 采购合同 {id}: 恢复 {count} 条入库记录
[库存入库] 采购合同 {id}: 创建 {count} 条记录，跳过 {count} 条
[库存回滚] 销售合同 {id}: 恢复 {count} 条出库记录
[库存出库] 销售合同 {id}: 出库 {count} 件商品
```

### 日志级别

- 所有回滚操作均记录为 `INFO` 级别
- 错误情况记录为 `ERROR` 级别

---

## 注意事项

### ⚠️ 数据一致性警告

1. **回滚后不可恢复**: 回滚操作会删除/恢复库存记录，请谨慎操作
2. **并发控制**: 同一合同的状态更新操作会被事务锁定
3. **状态机约束**: 只能按照状态机定义的路径流转，不可跨状态跳转

### ⚠️ 前端交互建议

1. **二次确认**: 回滚操作前应弹出确认对话框
2. **提示说明**: 明确告知用户回滚的副作用
3. **操作记录**: 建议在前端展示最近的审计日志

### ⚠️ 权限控制

| 角色 | 采购状态更新 | 销售状态更新 |
|------|-------------|-------------|
| `ADMIN` | ✅ | ✅ |
| `PURCHASE` | ✅ | ❌ |
| `SALES` | ✅ | ✅ |
| `FINANCE` | ✅ | ✅ |
| `WAREHOUSE` | ✅ | ✅ |

---

## 错误处理

### 常见错误

| HTTP 状态码 | 错误信息 | 原因 |
|-----------|---------|------|
| 400 | `status 不能为空` | 未提供目标状态 |
| 400 | `非法状态流转` | 违反状态机规则 |
| 404 | `采购/销售合同不存在` | 合同 ID 无效 |
| 401 | `请先登录` | 未认证 |
| 403 | `无权限执行此操作` | 角色权限不足 |

---

## 相关文件

- 采购状态机：`backend/src/services/purchaseStateMachine.js`
- 销售状态机：`backend/src/services/salesStateMachine.js`
- 库存回滚：`backend/src/services/inventorySnapshot.js`
- 审计日志：`backend/src/utils/auditLog.js`
