# 捷淞进销存系统 - 系统架构图

## 1. 整体架构

```mermaid
graph TB
    subgraph "前端层 (Next.js 16 + React 19)"
        A[Web应用<br/>localhost:3000]
        B[登录/注册]
        C[Dashboard仪表盘]
    end

    subgraph "后端层 (Node.js + Express)"
        D[API Server<br/>localhost:3001]
        E[Controllers<br/>业务控制器]
        F[Services<br/>业务逻辑层]
        G[Middleware<br/>认证/日志/错误处理]
    end

    subgraph "数据层"
        H[(SQLite<br/>开发环境)]
        I[(PostgreSQL<br/>生产环境)]
        J[Prisma ORM]
    end

    subgraph "外部服务"
        K[Kimi AI<br/>智能助手]
        L[文件存储<br/>上传/导出]
    end

    A -->|HTTP/API| D
    D --> G
    G --> E
    E --> F
    F --> J
    J --> H
    J --> I
    F --> K
    F --> L
```

## 2. 核心业务模块

```mermaid
graph LR
    subgraph "进销存核心"
        A[采购管理] --> B[库存]
        B --> C[销售管理]
        C --> D[财务管理]
        D --> E[海关报关]
        E --> F[退税管理]
    end

    subgraph "采购管理"
        A1[供应商管理]
        A2[采购合同]
        A3[采购订单]
    end

    subgraph "销售管理"
        C1[客户管理]
        C2[销售合同]
        C3[出口合同]
        C4[货柜管理]
    end

    subgraph "财务管理"
        D1[收付款管理]
        D2[外汇核销]
        D3[出口退税]
        D4[财务报表]
    end

    subgraph "海关报关"
        E1[报关单管理]
        E2[HS编码库]
        E3[报关草稿]
    end

    A --> A1
    A --> A2
    A --> A3
    C --> C1
    C --> C2
    C --> C3
    C --> C4
    D --> D1
    D --> D2
    D --> D3
    D --> D4
    E --> E1
    E --> E2
    E --> E3
```

## 3. 数据实体关系

```mermaid
erDiagram
    USER ||--o{ PURCHASE_CONTRACT : creates
    USER ||--o{ SALES_CONTRACT : creates
    USER ||--o{ OPERATION_LOG : generates

    SUPPLIER ||--o{ PURCHASE_CONTRACT : provides
    SUPPLIER ||--o{ PRODUCT_SUPPLIER : supplies

    PRODUCT ||--o{ PRODUCT_SUPPLIER : linked
    PRODUCT ||--o{ INVENTORY : tracks
    PRODUCT ||--o{ PURCHASE_ITEM : purchased
    PRODUCT ||--o{ SALES_ITEM : sold

    PURCHASE_CONTRACT ||--o{ PURCHASE_ITEM : contains
    PURCHASE_CONTRACT ||--o{ FINANCE_PAYABLE : generates

    SALES_CONTRACT ||--o{ SALES_ITEM : contains
    SALES_CONTRACT ||--o{ CONTAINER : ships
    SALES_CONTRACT ||--o{ FINANCE_RECEIVABLE : generates

    CONTAINER ||--o{ CUSTOMS_DECLARATION : declares
    CONTAINER ||--o{ TAX_REFUND : claims

    CUSTOMS_DECLARATION ||--o{ TAX_REFUND : links

    USER {
        string id PK
        string username
        string password
        string role "ADMIN/PURCHASE/SALES/FINANCE/WAREHOUSE"
        boolean isActive
    }

    PRODUCT {
        string id PK
        string name
        string hsCode
        float price
        int stock
    }

    PURCHASE_CONTRACT {
        string id PK
        string supplierId FK
        date contractDate
        float totalAmount
        string status
    }

    SALES_CONTRACT {
        string id PK
        string expNo "货柜号"
        date contractDate
        float totalAmount
        string status
    }

    CONTAINER {
        string id PK
        string expNo
        date departureDate
        date arrivalDate
        string status
    }

    CUSTOMS_DECLARATION {
        string id PK
        string containerId FK
        string declarationNo
        date declarationDate
        float taxAmount
    }

    TAX_REFUND {
        string id PK
        string containerId FK
        float refundAmount
        string status
        date claimDate
    }
```

## 4. 用户角色权限

```mermaid
graph TD
    subgraph "角色权限矩阵"
        A[管理员 ADMIN] --> A1[全部功能]
        B[采购 PURCHASE] --> B1[供应商管理]
        B --> B2[采购合同]
        B --> B3[库存查看]
        C[销售 SALES] --> C1[客户管理]
        C --> C2[销售合同]
        C --> C3[货柜管理]
        D[财务 FINANCE] --> D1[收付款]
        D --> D2[外汇核销]
        D --> D3[出口退税]
        E[仓库 WAREHOUSE] --> E1[库存管理]
        E --> E2[入库/出库]
    end
```

## 5. 业务流程

```mermaid
sequenceDiagram
    participant 采购
    participant 库存
    participant 销售
    participant 财务
    participant 海关

    采购->>库存: 1. 采购入库
    库存->>销售: 2. 库存分配
    销售->>库存: 3. 销售出库
    销售->>海关: 4. 报关出口
    海关->>财务: 5. 外汇核销
    海关->>财务: 6. 出口退税
```

---

## 功能清单

| 模块 | 功能 |
|------|------|
| **认证** | 登录/注册/找回密码/角色权限 |
| **采购** | 供应商管理、采购合同、采购订单 |
| **销售** | 客户管理、销售合同、出口合同、货柜管理 |
| **库存** | 实时库存、库存预警、入库/出库 |
| **财务** | 应收应付、外汇核销、出口退税、报表 |
| **海关** | 报关单、HS编码库、报关草稿生成 |
| **AI助手** | Kimi智能对话、数据分析、合同生成 |
| **系统** | 用户管理、日志审计、数据导入导出 |
