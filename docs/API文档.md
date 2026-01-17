# 捷淞进销存系统 - API 文档

> 若本文件内容变化，请更新本文件。

## 基本信息

- **基础URL**: `http://localhost:3000/api/v1`
- **认证方式**: JWT Token (Bearer)
- **请求头**:
  ```
  Content-Type: application/json
  Authorization: Bearer <token>
  ```

## 响应格式

### 成功响应
```json
{
  "code": 200,
  "message": "操作成功",
  "data": { ... }
}
```

### 分页响应
```json
{
  "code": 200,
  "message": "获取成功",
  "data": {
    "items": [...],
    "pagination": {
      "total": 100,
      "page": 1,
      "pageSize": 20,
      "totalPages": 5
    }
  }
}
```

### 错误响应
```json
{
  "code": 400,
  "message": "错误信息",
  "error": { ... }
}
```

---

## 1. 认证模块 `/auth`

### 1.1 登录
```
POST /auth/login
```

**请求体**:
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**响应**:
```json
{
  "code": 200,
  "message": "登录成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "xxx",
      "username": "admin",
      "name": "管理员",
      "role": "ADMIN",
      "email": null,
      "phone": null
    }
  }
}
```

### 1.2 获取当前用户
```
GET /auth/me
```

### 1.3 修改密码
```
PUT /auth/password
```

**请求体**:
```json
{
  "oldPassword": "xxx",
  "newPassword": "xxx"
}
```

---

## 2. AI模块 `/ai`

### 2.1 智能对话 (支持图片)
```
POST /ai/chat
```

**请求体**:
```json
{
  "message": "帮我计算成本5000元的推荐售价",
  "sessionId": "session_xxx",  // 可选，用于多轮对话
  "imageUrl": "https://..."    // 可选，图片URL
}
```

**响应**:
```json
{
  "code": 200,
  "message": "操作成功",
  "data": {
    "sessionId": "session_1768534035898",
    "message": "根据定价公式计算...",
    "tokenUsage": {
      "prompt": 257,
      "completion": 391,
      "total": 648
    },
    "model": "kimi-k2-thinking-turbo"
  }
}
```

### 2.2 辅助录入解析 (支持图片)
```
POST /ai/parse
```

**请求体**:
```json
{
  "content": "报价单内容...",
  "type": "quote",  // quote | purchase | contract
  "imageUrl": "https://..."  // 可选，图片URL
}
```

**响应**:
```json
{
  "code": 200,
  "message": "操作成功",
  "data": {
    "type": "quote",
    "confidence": 0.9,
    "data": [
      { "名称": "实木餐桌", "规格": "1.8m", "数量": 50, "单价": 3500 }
    ],
    "needsConfirmation": true,
    "tokenUsage": { "promptTokens": 100, "outputTokens": 50 }
  }
}
```

### 2.3 获取对话历史
```
GET /ai/history?sessionId=xxx&page=1&pageSize=50
```

### 2.4 获取会话列表
```
GET /ai/sessions
```

### 2.5 删除会话
```
DELETE /ai/sessions/:sessionId
```

### 2.6 获取Token使用统计
```
GET /ai/token-stats?days=30
```

**响应**:
```json
{
  "code": 200,
  "data": {
    "period": "30天",
    "totalRequests": 10,
    "totalTokens": 5000,
    "promptTokens": 2000,
    "outputTokens": 3000,
    "byModel": [
      { "model": "kimi-k2-thinking-turbo", "requests": 8, "tokens": 4000 }
    ]
  }
}
```

### 2.7 获取可用模型
```
GET /ai/models
```

**响应**:
```json
{
  "code": 200,
  "data": {
    "models": {
      "thinking": "kimi-k2-thinking-turbo",
      "vision": "moonshot-v1-128k-vision-preview",
      "fast": "moonshot-v1-8k"
    },
    "description": {
      "thinking": "Kimi K2 推理增强模型 - 适合复杂推理和分析",
      "vision": "视觉模型 - 支持图像理解",
      "fast": "快速响应模型 - 适合简单问答"
    }
  }
}
```

---

## 3. 供应商模块 `/suppliers`

### 3.1 获取列表
```
GET /suppliers?page=1&pageSize=20
```

### 3.2 获取详情
```
GET /suppliers/:id
```

### 3.3 创建
```
POST /suppliers
```

**请求体**:
```json
{
  "name": "佛山家具厂",
  "shortName": "佛山厂",
  "contactName": "张经理",
  "contactPhone": "13800138000",
  "contactEmail": "xxx@xxx.com",
  "address": "xxx",
  "bankAccount": "xxx"
}
```

### 3.4 更新
```
PUT /suppliers/:id
```

### 3.5 删除
```
DELETE /suppliers/:id
```

### 3.6 添加别名
```
POST /suppliers/:id/aliases
```

---

## 4. 门店模块 `/stores`

### 4.1 获取列表
```
GET /stores?page=1&pageSize=20
```

### 4.2 获取港口列表
```
GET /stores/options/ports
```

### 4.3 创建
```
POST /stores
```

**请求体**:
```json
{
  "name": "San Jose 2115",
  "portId": "xxx",
  "contactName": "John"
}
```

---

## 5. 商品模块 `/products`

### 5.1 获取列表
```
GET /products?page=1&pageSize=20
```

### 5.2 创建
```
POST /products
```

**请求体**:
```json
{
  "customsName": "实木餐桌",
  "description": "1.8m实木餐桌",
  "specification": "1.8m x 0.9m",
  "unit": "套"
}
```

### 5.3 获取历史价格
```
GET /products/:id/price-history?limit=20
```

### 5.4 记录价格
```
POST /products/:id/price-history
```

**请求体**:
```json
{
  "price": 3500,
  "supplierId": "xxx"
}
```

### 5.5 获取价格趋势
```
GET /products/:id/price-trend?days=90
```

---

## 6. 采购模块 `/purchases`

### 6.1 获取列表
```
GET /purchases?page=1&pageSize=20&status=DRAFT&supplierId=xxx
```

### 6.2 创建合同
```
POST /purchases
```

**请求体**:
```json
{
  "supplierId": "xxx",
  "signedAt": "2026-01-16",
  "expectedDate": "2026-02-16"
}
```

### 6.3 添加明细
```
POST /purchases/:id/items
```

**请求体**:
```json
{
  "productId": "xxx",
  "quantity": 50,
  "unit": "套",
  "unitPrice": 3500
}
```

### 6.4 上传合同文件
```
POST /purchases/:id/files
Content-Type: multipart/form-data
```

### 6.5 获取下一个合同号
```
GET /purchases/options/next-no
```

---

## 7. 销售模块 `/sales`

### 7.1 获取列表
```
GET /sales?page=1&pageSize=20
```

### 7.2 创建合同
```
POST /sales
```

**请求体**:
```json
{
  "exchangeRate": 6.6,
  "signedAt": "2026-01-16"
}
```

### 7.3 计算价格
```
POST /sales/calculate-price
```

**请求体**:
```json
{
  "costPrice": 3500,
  "exchangeRate": 6.6,
  "profitRate": 1.3
}
```

**响应**:
```json
{
  "data": {
    "exact": "689.39",
    "roundedUp": 690,
    "roundedDown": 689,
    "recommended": 689
  }
}
```

---

## 8. 货柜模块 `/containers`

### 8.1 获取列表
```
GET /containers?page=1&pageSize=20&status=PENDING&portId=xxx
```

### 8.2 创建货柜
```
POST /containers
```

**请求体**:
```json
{
  "portId": "xxx",
  "customsBroker": "深圳报关公司",
  "estimatedArrival": "2026-02-16"
}
```

**响应** (自动生成编号):
```json
{
  "data": {
    "containerNo": "26-001-LA",
    "..."
  }
}
```

### 8.3 添加装箱明细
```
POST /containers/:id/items
```

---

## 9. 库存模块 `/inventory`

### 9.1 获取列表
```
GET /inventory?page=1&pageSize=20&status=PRODUCING&productId=xxx
```

### 9.2 更新状态
```
PUT /inventory/:id/status
```

**请求体**:
```json
{
  "status": "INBOUND"  // PRODUCING | PACKING | SHIPPING | INBOUND | OUTBOUND
}
```

### 9.3 获取统计
```
GET /inventory/stats
```

---

## 10. 财务模块 `/finance`

### 10.1 获取付款记录
```
GET /finance/payments?type=PAYABLE&page=1
```

### 10.2 创建付款记录
```
POST /finance/payments
```

**请求体**:
```json
{
  "type": "PAYABLE",
  "purchaseContractId": "xxx",
  "amount": 50000,
  "currency": "CNY",
  "paymentMethod": "银行转账",
  "paymentDate": "2026-01-16"
}
```

### 10.3 获取应付账款
```
GET /finance/payables?page=1
```

### 10.4 获取应收账款
```
GET /finance/receivables?page=1
```

### 10.5 获取财务统计
```
GET /finance/stats
```

---

## 11. 系统模块 `/system`

### 11.1 获取配置
```
GET /system/configs
```

### 11.2 更新配置 (管理员)
```
PUT /system/configs/:key
```

**请求体**:
```json
{
  "value": { "rate": 6.8, "buffer": 0.2 },
  "note": "汇率配置"
}
```

### 11.3 获取当前汇率
```
GET /system/exchange-rate
```

### 11.4 获取操作日志 (管理员)
```
GET /system/logs?page=1&pageSize=50&entity=User&action=LOGIN
```

### 11.5 导入CSV数据 (管理员)
```
POST /system/import
Content-Type: multipart/form-data
```

### 11.6 导出数据
```
GET /system/export/:type
```
type: suppliers | stores | products | purchases | sales | containers | inventory | payments

### 11.7 获取通知
```
GET /system/notifications?unreadOnly=true
```

### 11.8 标记已读
```
PUT /system/notifications/:id/read
```

---

## 角色权限

| 角色 | 说明 | 权限 |
|------|------|------|
| ADMIN | 管理员 | 所有功能 |
| PURCHASE | 采购员 | 采购、供应商、商品管理 |
| SALES | 销售员 | 销售、门店、客户管理 |

---

## 默认账号

| 用户名 | 密码 | 角色 |
|--------|------|------|
| admin | admin123 | ADMIN |

> 注意：密码在 `backend/prisma/seed.js` 中定义，默认为 `admin123`

---

## 状态码说明

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 400 | 请求参数错误 |
| 401 | 未认证 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 500 | 服务器错误 |
