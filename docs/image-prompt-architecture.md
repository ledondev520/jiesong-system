# 捷淞进销存系统架构图 - 图片生成 Prompt

## 目标平台
**Nano Banana 2 (Gemini Image)**

---

## 主 Prompt

```
A clean and professional system architecture diagram for "JieSong ERP System"
(捷淞进销存系统), a foreign trade enterprise management system.

Layout: 4-tier vertical architecture with clear layer separation

LAYER 1 - Frontend (Top):
- Blue gradient header bar with "用户界面层 / Frontend Layer"
- Three rounded rectangular boxes side by side:
  * "登录/注册 🔐" (Login/Register)
  * "Dashboard 📊" (Dashboard)
  * "业务模块 🏢" (Business Modules: 采购/销售/库存/财务/报关)
- Technology labels: Next.js 16 + React 19 + Tailwind CSS

LAYER 2 - Backend (Second):
- Purple gradient header bar with "后端服务层 / Backend Layer"
- Main box containing:
  * "Express.js API Server (Port 3001)" as central hub
  * Row of controller icons: 认证🔐 采购📦 销售💰 库存📊 财务💳 海关🚢 AI🤖
  * "Middleware" bar below: JWT认证 | 日志📋 | 错误处理 | CORS | 审计🔍

LAYER 3 - Database (Third):
- Green gradient header bar with "数据持久层 / Data Layer"
- Two database cylinders side by side:
  * Left: "SQLite 🗄️ (Development)"
  * Right: "PostgreSQL 🐘 (Production)"
- "Prisma ORM" connecting them in the middle

LAYER 4 - External Services (Bottom):
- Orange gradient header bar with "外部服务 / External Services"
- Three service boxes:
  * "Kimi AI 🤖" (Smart Assistant)
  * "文件存储 📁" (File Storage)
  * "邮件服务 📧" (Email Service)

CONNECTING ELEMENTS:
- Vertical arrows connecting layers top to bottom
- HTTP/REST API label on first arrow
- SQL label on second arrow
- Light gray background (#f5f7fa)
- Modern flat design style with subtle shadows
- Clean sans-serif typography
- 16:9 aspect ratio, high quality, professional tech diagram
```

---

## Nano Banana 2 优化版（简洁指令）

```image-gen-request
{"prompt":"Professional system architecture diagram for ERP system called 'JieSong' (捷淞进销存), 4-tier vertical layout: 1) Frontend layer (Next.js 16 + React 19 + Dashboard UI with login and business modules), 2) Backend layer (Express.js API with controllers for auth, purchase, sales, inventory, finance, customs, AI and middleware), 3) Data layer (SQLite and PostgreSQL with Prisma ORM), 4) External services (Kimi AI, file storage). Clean flat design, blue-purple-green-orange gradient headers, rounded rectangles, connecting arrows, Chinese labels: 用户界面层, 后端服务层, 数据持久层, 外部服务, light gray background, modern tech diagram style, corporate presentation quality","aspectRatio":"16:9","resolution":"2K"}
```

---

## 备选 Prompt（不同风格）

### 风格 A: 深色科技风
```
Dark theme system architecture diagram for JieSong ERP. Black background (#1a1a2e).
Neon blue and purple glowing boxes. Four horizontal layers: Frontend (cyan),
Backend (purple), Database (green), External (orange). Futuristic tech style,
circuit-like connecting lines, glass morphism effect. Chinese labels. 16:9.
```

### 风格 B: 极简线条风
```
Minimalist line art architecture diagram for ERP system. White background.
Thin black outlines, no fill colors. Four stacked layers with simple boxes.
Clean typography. Japanese minimalism inspired. Chinese labels. 16:9.
```

### 风格 C: 3D 立体风
```
3D isometric architecture diagram for JieSong ERP system. Floating platforms
at different heights. Four tiers: Frontend (top-left), Backend (center),
Database (bottom-left), Services (bottom-right). Soft shadows, gradient colors,
blue-purple palette, modern 3D render style. Chinese labels. 16:9.
```

---

## 业务流程图 Prompt（额外）

```image-gen-request
{"prompt":"Clean business process flow diagram for foreign trade ERP system. Horizontal flow: Supplier icon → Purchase document → Warehouse/inventory box → Sales document → Customer icon. Below: arrows pointing to Finance center (payments, tax refund) and Customs declaration (export documents). Modern flat design, blue color scheme, rounded boxes, directional arrows, Chinese labels: 供应商, 采购, 库存, 销售, 客户, 财务, 海关. Light background, professional presentation style","aspectRatio":"16:9","resolution":"2K"}
```

---

## 数据库 ER 图 Prompt（额外）

```image-gen-request
{"prompt":"Entity relationship diagram for ERP database. Central tables: User, Product, PurchaseContract, SalesContract, Container, CustomsDeclaration connected by relationship lines. Surrounding: Supplier, Customer, Inventory, TaxRefund, Finance records. Clean database diagram style, crow's foot notation, light blue table boxes, primary keys marked. Chinese table names: 用户表, 产品表, 采购合同, 销售合同, 货柜表, 报关单. White background, professional technical diagram, 16:9 aspect ratio","aspectRatio":"16:9","resolution":"2K"}
```

---

## 使用说明

1. 复制上面的 **Nano Banana 2 优化版** prompt
2. 粘贴到你的 Gemini Image (Nano Banana 2) 界面
3. 等待生成，如果不满意可以调整颜色或布局描述
4. 生成后可以下载用于文档或演示

## 提示词技巧

- ✅ 使用具体的技术名称：Next.js, Express, Prisma
- ✅ 指定颜色方案：blue-purple gradient
- ✅ 描述布局：4-tier vertical, side by side
- ✅ 包含中文标签：用户界面层, 后端服务层
- ✅ 指定风格：modern flat design, professional tech diagram
