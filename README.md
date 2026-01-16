# 捷淞进销存管理系统

> 若本文件夹结构或内容变化，请更新本文件。

## 项目简介

面向外贸出口企业的一站式进销存管理系统，集成AI智能助手，实现采购、销售、库存、财务的数字化管理。

## 核心功能

- 📦 **商品管理** - 商品档案、多供应商支持
- 🏭 **供应商管理** - 供应商档案、昵称关联、质量标记
- 🏪 **客户门店** - 门店档案、港口绑定
- 📝 **采购管理** - 采购合同、AI辅助录入、付款跟踪
- 💰 **销售管理** - 出口合同、智能定价
- 📊 **库存管理** - 入库出库、状态流转
- 🚢 **货柜管理** - 自动编号、装箱管理、位置查询
- 🤖 **AI助手** - 智能问答、辅助录入
- 📈 **报表统计** - 多维度数据分析

## 技术栈

系统采用前后端分离架构：

- **Frontend**: Next.js 14 (App Router) + Tailwind CSS + shadcn/ui
- **Backend**: Express + Prisma + SQLite (详见 `backend/`)
- **AI**: Kimi API

## 项目结构

```
jiesong_system/
├── docs/                    # 项目文档
├── frontend/                # 前端项目 (Next.js 14)
│   ├── src/
│   │   ├── app/             # App Router Pages
│   │   ├── components/      # UI Components
│   │   ├── lib/             # Utils & Config
│   │   ├── services/        # API Services
│   │   ├── store/           # Zustand Stores
│   │   └── types/           # TypeScript Interfaces
│   └── README.md
├── backend/                 # 后端项目 (Express + Prisma)
├── demo/                    # 旧版UI Demo (废弃)
└── README.md                # 本文件
```

## 开发状态

| 阶段 | 状态 |
|------|------|
| ✅ 需求调研 | 完成 |
| ✅ PRD文档 | 完成 |
| ✅ 技术方案 | 完成 |
| ✅ 数据库设计 | 完成 |
| 🚧 系统开发 | 进行中 (Frontend Phase 3/5) |

## 快速开始

### 前端 (Frontend)

```bash
cd frontend
npm install
npm run dev
# 访问 http://localhost:3000
```

### 后端 (Backend)

```bash
cd backend
npm install
npm run dev
# API 服务运行在 http://localhost:3001 (假设)
```

## 文档导航

- [需求总结](docs/需求总结_v2.0.md) - 完整需求规格
- [PRD文档](docs/PRD.md) - 产品需求、功能清单
- [技术方案](docs/技术方案.md) - 系统架构设计
- [数据库设计](docs/数据库设计.md) - Schema 定义
- [测试样例](docs/测试样例.md) - 测试先行样例与用例清单
- [模拟数据汇总](docs/模拟数据汇总.md) - 模拟数据标记清单
- [前端文档](frontend/README.md) - 前端开发指南

## License

Private - All Rights Reserved
