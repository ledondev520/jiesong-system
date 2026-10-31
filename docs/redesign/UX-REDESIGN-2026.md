# UX Redesign 2026 — 捷淞 jiesong-system

| | |
|---|---|
| Status | Draft spec **v2**. This PR changes no code; it contains only this document. |
| Date | 2026-10-30 (v1), 2026-10-31 (v2) |
| Owner | Stans (decisions in §1.2) |
| Inputs | Code review, logged-in production walkthrough and public-page walkthrough of 2026-10-30 (kept outside the repo); `DESIGN.md`; `docs/IA_REDESIGN.md`; `AGENTS.md`; the current code at `origin/main` 8a09c93 |
| v2 inputs | Owner decisions of 2026-10-30 (Stans); Seapot customer research of 2026-10-30 (public sources); the system's "three forms" sample workbook (sheets 外销合同 / 商业发票 / 装箱单); `backend/templates/购销合同模板.docx`; `docs/购销合同模板说明.md`; `docs/出口清单快速制单SOP.md`. All kept outside the repo except the last three. |
| v2 changes | §1.2 owner decisions; §1.4 out of scope; FOB default (§4, §5); payables definition (§4.7); archiving (§4.11); store code / legal entity (§5.1); quote/PI layout from the three-forms workbook (§6); pricing ×1.3 / ×1.1 with whole-number round-up (§7); §13 answered vs open; §15 rows mapped to task cards J1–J32. |

---

## 1. Goals and principles

### 1.1 Goals
1. **The owner can run the whole business in the system:** quote → export order → purchase from a supplier → receiving and inventory → shipping and customs documents → invoices → finance → export tax refund (出口退税).
2. **When buying, the system shows which supplier to buy from,** based on past purchase prices for that product.
3. **One customer (Seapot), many stores.** The customer is chosen once per order. Each line says which Seapot store (门店) it is for, so every purchased, received and shipped quantity can be traced to a store.
4. **One pricing rule in one place:** purchase cost × 1.3 (× 1.1 for special categories such as 瓷砖 tiles), convert at (spot rate − 0.2), round **up** to whole USD, then up to a multiple of 5. The spot rate is set in settings.
5. **An AI assistant on every page,** docked at the side so it never covers content.
6. **A new visual design and information architecture,** simpler than today: fewer pages, one name per object, one primary action per screen.

### 1.2 Owner decisions this spec builds on
Decisions 1–9 date from v1; 10–15 are the owner decisions of 2026-10-30 (Stans), which win over anything older in this document or in `docs/出口清单快速制单SOP.md`.
1. Nobody uses the system in production yet, so screens can be replaced freely. Data and backend safety rules still apply.
2. There is essentially one customer, Seapot (海中锅), a hotpot chain in California (mainly Los Angeles). Each current 门店 is one of about 10 Seapot stores, i.e. a delivery destination. The customer is set once per order; the store is set per line.
3. Quote/PI, sales list and contract formats follow the system's existing documents: the "three forms" workbook (外销合同 / 商业发票 / 装箱单), `backend/templates/购销合同模板.docx`, `docs/购销合同模板说明.md` and `docs/出口清单快速制单SOP.md`. There is no separate quote Excel (§6.1).
4. Pricing: one rule, one config place, editable exchange rate (§7). Details in decision 10.
5. Simplify everything (删繁就简), but keep finance on real data and keep 出口退税.
6. The AI assistant is available on every page and must not cover content.
7. Redesign the visuals and IA from scratch.
8. Pure UI changes get a lightweight process (§14). **Approved by the owner;** implemented by task card JP. Rulesets and the 9 required checks stay as they are.
9. Container loading (集装箱装货图) is a separate effort (§11).
10. **Sell price = purchase cost (CNY) × 1.3** for normal goods (a markup on cost, not a margin on price) and **× 1.1** for special goods such as 瓷砖 (tiles). **Locked 2026-10-31:** convert at FX used = spot rate − 0.2, then **round up to whole USD** and then **up to the next multiple of 5** (after conversion, not whole yuan before it). The round-up step is a config value, default 5 (§7.2).
11. **Seapot buys FOB.** FOB is the default Incoterm on the Seapot customer, its quotes and its orders (§4.1, §5).
12. **Draft purchase contracts are not payables (应付).** Only contracts that are in effect count, and every page computes payables with one shared function (§4.7).
13. **Test data and suppliers marked 存疑 are archived, never hard-deleted** (§4.11).
14. Finance stays on real data and 出口退税 stays (repeats decision 5).
15. The AI assistant is available on every page (repeats decision 6).

### 1.3 Principles
- **Backend safety stays intact.** Permissions (`roleAuth`, `bossReadOnly.js`), state machines (`inventoryStateMachine.js`, purchase/sales status services, `purchaseReceiptService.js`), file permissions (`fileService.js`), finance evidence and tax-refund rules are not loosened. The redesign changes screens and fills gaps in the data model. It does not rewrite business rules.
- **One object, one name, one home.** Every business object has one Chinese name (§2), one list page and one detail page. No parallel CRUD for the same data (this is already an `AGENTS.md` convention).
- **One primary action per screen.** It is the next step in the flow. Everything else goes under 「更多」 or a 「单证 ▾」 menu. Delete is never a first-level button.
- **Tables for lists, cards only on mobile.** Dense, scannable, sortable, filterable.
- **Errors explain themselves.** Show the server's reason plus a retry, and never show zeros as if they were data.
- **Reuse before building.** Reuse shadcn/ui (mandatory per `AGENTS.md`), existing services, `PurchaseItem` price history and the export workbook generator. The spec adds no new frontend dependency.
- **Additive data changes.** New tables and nullable columns, backfill scripts with `--dry-run`, `npm run db:migrate` only (never `prisma db push`), and a backup before every migration.
- **Archive, never hard-delete business data.** Records that should disappear from daily use (test data, doubtful suppliers) are archived and stay restorable (§4.11).

### 1.4 Out of scope (from the Seapot research)
The Seapot research (2026-10-30, public sources) suggests features this redesign does **not** build: new-store build-out projects with a generated bill of materials, recurring replenishment suggestions, an expansion-lead tracker, a full store master record (seats, rooms, conveyor counts, equipment specs), a customer-group / brand hierarchy, and certification flags (UL / ETL / NSF) on electrical products. They can be added later on top of `Customer` and `Store`. What the research does change in this spec:
- Stores sit in several states (California Bay Area and Los Angeles/Orange County, plus Plano, Texas), so a store keeps its own destination port (`Store.portId`, existing) and the order shows a port per store.
- Each Seapot store is run by its own legal entity (an LLC per store; possibly a group buying entity "Sp Food Trading LLC"). `Store` gets an optional legal entity name and a short code for shipping marks (§5.1). Who the buyer on the PI is stays open (Q16).
- US floor-area units (sq ft) appear for tiles; the unit printed on PI lines comes from the product's unit and is not converted (Q18).

---

## 2. Glossary: one name per business object

| UI name (zh) | English | DB model | Retired names |
|---|---|---|---|
| 客户 | Customer | `Customer` (new) | 门店 used as a customer |
| 门店 | Store (the customer's delivery point) | `Store` (+ `customerId`) | 店铺 (free text `PurchaseContract.storeName`) |
| 报价单 | Quote; prints as *Quotation*, or as *Proforma Invoice (PI)* once accepted | `Quote`, `QuoteItem` (new) | — |
| 出口订单 | Export order | `SalesContract` (unchanged name in DB; number `EXP…`) | 出口合同, 专项单, 销售合同 |
| 货柜 | Container (the physical box on an export order) | fields on `SalesContract` and `PackingItem` | used as a synonym for the order |
| 外销合同 / 商业发票 / 装箱单 | Export documents (sheets of the export workbook) | generated by `exportPacketService.js` | 出口三单, 出口工作簿 (as button names) |
| 采购合同 | Purchase contract | `PurchaseContract`, `PurchaseItem` | 购销合同 (only as the Word template name) |
| 供应商 | Supplier | `Supplier` | — |
| 归档 | Archive (hide from daily use, restorable; never a hard delete) | `isActive` / archive fields (§4.11) | 删除 for business records |
| 采购价格 | Supplier price history | derived from `PurchaseItem` × `PurchaseContract` | — |
| 商品 | Product | `Product` | 商品档案 (as a menu name) |
| 收货验货 | Receipt and inspection | `PurchaseReceipt*` | 到货 |
| 库存 | Inventory | `Inventory` | 库存状态, 物流 |
| 报关单 | Customs declaration | `CustomsDeclaration` | 申报三表 (as a button name) |
| 进项发票 | Supplier VAT invoice (needed for the refund) | `InvoiceRecord` | 发票 (ambiguous) |
| 收款 / 付款 | Receipt from customer / payment to supplier | `Payment` (RECEIVABLE / PAYABLE) | 收付管理 |
| 出口退税 | Export tax refund | `TaxRefund` | — |
| 报价规则 | Pricing rule | `config/pricing.json` | 出口报价配置, 基础参数 (rate / profit) |
| AI 助手 | AI assistant (side panel) | existing AI services | JIESONG 助手 |

Product name in the UI: **捷淞** (header) / **捷淞外贸系统** (browser title suffix). See open question Q12.

---

## 3. Information architecture

### 3.1 Navigation (desktop sidebar)

```
捷淞
────────────────────────
  首页              /dashboard
业务
  报价              /dashboard/quotes
  出口订单          /dashboard/orders
  采购              /dashboard/purchases
  库存              /dashboard/inventory
  单证与退税        /dashboard/customs      (tabs: 报关单 | 出口退税)
  财务              /dashboard/finance      (tabs, §3.3)
资料
  客户与门店        /dashboard/customers
  供应商            /dashboard/suppliers
  商品              /dashboard/products
  HS 编码           /dashboard/hs-codes
────────────────────────
  设置 (ADMIN)      /dashboard/settings
```

- **The top bar** holds: page breadcrumb and title (one line), global search (⌘K, using the existing shadcn `command` component), notifications bell, **AI 助手 toggle**, and the user menu.
- **No AI menu entry.** AI is the side panel (§10).
- **Role visibility** reuses the `visibleRoles` mechanism in `navigation.config.ts`. Example: WAREHOUSE sees 首页, 采购 (read), 库存, 商品. BOSS sees everything read-only, without settings. **PURCHASE must keep access to 商品:** the current `AGENTS.md` rule puts 商品档案 under 采购 for that reason. The IA PR updates that `AGENTS.md` line to say 商品 now sits under 资料 and stays visible to PURCHASE. API permissions are not changed by navigation.
- **Mobile bottom bar:** 首页 · 订单 · 采购 · 库存 · 更多. AI opens as a full-screen sheet, only when tapped.

### 3.2 One header, not four
Today there are four stacked layers: layout breadcrumbs → `ModuleTabHeader` → `PageHeader` → inner tabs. New layout:
1. The top bar shows breadcrumb + title.
2. The page header row shows key facts (status badge, customer, amount, dates), **one primary button**, and a 「更多」 menu.
3. Tabs inside the page appear only where a page has several views.

`ModuleTabHeader` is deleted.

### 3.3 Finance tabs
`/dashboard/finance` has these tabs, each its own URL:

| Tab | URL |
|---|---|
| 概览 | `/dashboard/finance` |
| 收款 | `/dashboard/finance/receivable` |
| 付款 | `/dashboard/finance/payable` |
| 银行流水 | `/dashboard/finance/bank-flow` |
| 进项发票 | `/dashboard/finance/invoices` |
| 对账 | `/dashboard/finance/reconciliation` |
| 报表 | `/dashboard/finance/statements` (ADMIN/FINANCE) |
| 经营分析 | `/dashboard/finance/analysis` (today's 经营执行) |

`/receivable` and `/payable` exist today as redirect stubs, so the new pages reuse those URLs.

### 3.4 Complete page list and old → new URLs

Old URLs keep working through the existing stub pattern: a `page.tsx` that calls `redirect()`. Using stubs instead of `next.config` keeps IA PRs frontend-only (see §14).

**Legend:** **Keep** = same page, restyled · **Rewrite** = new UI on the same API · **Merge** = folded into another page · **Delete** = removed, old URL redirects · **New** = new page.

| Old URL | Action | New URL | Notes |
|---|---|---|---|
| `/` | Keep | `/` | Redirect on the server instead of after JavaScript runs. |
| `/login`, `/register`, `/forgot-password` | Keep | same | Shared `AuthShell`; password placeholder 请输入密码; no 字节 wording; `<h1>`; tab titles. |
| 404 (`not-found.tsx`) | Keep | — | Main button is 返回登录页 when logged out. |
| `/forex-verifications` | **Delete** | → `/` | Public marketing page with invented metrics (24h, <5%). Delete `components/public/service-page.tsx` too (no other user). |
| `/tax-refunds` | Delete (stub) | → `/dashboard/customs?tab=refunds` | Already a redirect. |
| `/customs-declarations`, `/create`, `/[id]`, `/[id]/edit` | Delete (stubs) | → `/dashboard/customs/…` | First move `app/customs-declarations/components/*` into the dashboard route folder; the dashboard pages import them. |
| `/dashboard` | **Rewrite** | `/dashboard` | 首页: to-dos by role (§4.9). Removes the WPS/Codex box (moves to 设置 > 系统日志, ADMIN), the row-count KPIs and `TradeWorkflowBoard`. |
| `/dashboard/reports` | Merge | `/dashboard/finance/analysis` | One summary line such as 「38 笔缺少采购成本 → 查看清单」 instead of 38 red links. |
| — | **New** | `/dashboard/quotes`, `/new`, `/[id]` | §6.3 and §4.1. |
| `/dashboard/sales` | Rewrite | `/dashboard/orders` | Table, not a card grid. |
| `/dashboard/sales/create` | Rewrite | `/dashboard/orders/new` | Order-level header plus a product × store grid. |
| `/dashboard/sales/[id]` | Rewrite | `/dashboard/orders/[id]` | Tabs (§4.2): 概览, 明细, 采购, 货柜, 单证, 收款, 退税. |
| `/dashboard/logistics/containers` | Delete (stub) | → `/dashboard/orders` | |
| `/dashboard/contracts` | Rewrite | `/dashboard/purchases` | |
| `/dashboard/purchase/create` | Rewrite | `/dashboard/purchases/new` | Supplier price comparison per line (§4.3). |
| `/dashboard/purchase/[id]` | Rewrite | `/dashboard/purchases/[id]` | Reuse `PurchaseFlowPanel`, `PurchaseProductionPanel` and `PurchaseReceiptPanel`. |
| `/dashboard/purchase`, `/dashboard/contracts/template`, `/templates` | Delete (stubs) | → `/dashboard/purchases` | |
| `/dashboard/inventory-status` | Rewrite | `/dashboard/inventory` | The only inventory view. Quantity column becomes one number plus unit, with a store filter. |
| `/dashboard/logistics` | Delete (stub) | → `/dashboard/inventory` | |
| `/dashboard/products` | Rewrite | `/dashboard/products` (+ `/[id]` new) | Remove the 库存状态 tab. Table with a 「资料不全」 filter (weight/CBM/HS missing). Detail has a 采购价格 tab. |
| `/dashboard/suppliers` | Rewrite | `/dashboard/suppliers` (+ `/[id]` new) | List plus detail, with a price history per product. No more empty create form as the main panel. 「已归档」 filter (§4.11). |
| — | **New** | `/dashboard/customers`, `/[id]` | Customer with its stores and orders. |
| `/dashboard/customs-declarations`, `/create`, `/[id]`, `/[id]/edit` | Keep content, move | `/dashboard/customs`, `/new`, `/[id]`, `/[id]/edit` | Gets its own tab instead of `tax-refunds?view=customs`. |
| `/dashboard/tax-refunds`, `/create`, `/[id]`, `/[id]/edit` | Keep, restyle | `/dashboard/customs?tab=refunds`, `/dashboard/tax-refunds/[id]`… | Detail URLs stay. Blocking text wraps; zh-CN month picker. |
| `/dashboard/hs-codes` | Keep | same | Default list = chapters the company actually uses. Remove developer wording; one length rule. |
| `/dashboard/finance` | Rewrite | same | Money with 2 decimals; one payables definition (§4.7). |
| `/dashboard/payments` | Split | → `/dashboard/finance/receivable` (default); `?tab=payable` → `/payable` | Unallocated receipts become a filter, not a block above everything. |
| `/dashboard/finance/receivable`, `/payable` | **New pages** at existing stub URLs | same | |
| `/dashboard/finance/bank-flow`, `/invoices`, `/reconciliation` | Keep, restyle | same | Now visible as tabs. |
| `/dashboard/finance/statements` | Keep, restyle | same | Split into inner tabs (KPI, 资产负债表, 利润表, 现金流, 明细账, 资料库) instead of one 10,500 px page. |
| `/dashboard/ai` | Delete (stub) | → `/dashboard?ai=1` | Opens the side panel. |
| `/dashboard/ai/sessions` | Rewrite | `/dashboard/settings/ai-usage` (ADMIN) | Each user's own history lives in the panel's 「历史」 view. |
| `/dashboard/settings` | Rewrite | same | Sections listed in §3.5. |
| `/dashboard/users` | Merge | → `/dashboard/settings/users` | Keep the 907-line version, which includes agent accounts. Delete the 487-line duplicate. |
| `/dashboard/settings/users` | Keep (receives the above) | same | |
| `/dashboard/settings/ports`, `/categories`, `/customs-brokers`, `/export` | Keep, restyle | same | |
| `/dashboard/system` | Delete (stub) | → `/dashboard/settings` | A page of links only. |
| `/dashboard/system/logs` | Move | `/dashboard/settings/logs` | |
| `/dashboard/system/notifications` | Move | `/dashboard/notifications` | Opened from the bell; available to every role. |
| `/dashboard/about` | Move | `/dashboard/settings/ai-access` | Agent/MCP connection guide (ADMIN). |

### 3.5 Settings (ADMIN)
Settings is a left-nav page with these sections:
- **报价规则** (§7)
- 公司信息 (invoice header; bank fields masked, §13 Q9)
- 用户
- 港口
- 商品分类
- 报关行
- 数据导入导出
- AI 接入
- AI 用量
- 系统日志
- 高级 (AI temperature, max tokens and similar, collapsed by default)

The old 「基础参数」 rate and profit fields are deleted.

---

## 4. Key flows

### 4.1 Quote → export order
1. **报价 → 新建报价.** The customer defaults to Seapot, the only active customer. Currency (USD), Incoterm (**FOB**), payment terms, port of loading and validity come from the customer's defaults. Each store's destination port comes from the store.
2. **Add products** with a server-side search picker (no more "first 100 only" limit). The line grid is **product × store**: one row per product, one quantity column per Seapot store, plus a total. Rows can be pasted from Excel as tab-separated text, parsed in the browser with no new dependency.
3. **The system fills in the reference cost** (参考成本 ¥) for each product: the latest signed purchase price, labelled with supplier, date and contract number. The user can switch to another supplier's price from the comparison popover (§4.3).
4. **The system calculates the selling price** with the pricing rule (§7), shown with the multiplier used (×1.3 / ×1.1). A user may override a price. Overrides show a 「手动价」 badge and the realised markup.
5. **Save, then 导出报价单 (Excel), then 标记已发送.**
6. **When the customer confirms, 标记已接受.** The same document now prints as **Proforma Invoice**.
7. **转为出口订单** creates a `SalesContract` (DRAFT) in one transaction:
   - customer, currency, Incoterm, payment terms, port and exchange-rate snapshot are copied from the quote;
   - each non-zero product × store cell becomes one `SalesItem` (`storeId`, `quantity`, `costPrice` = reference cost ¥, `sellingPrice` = quote price);
   - the quote moves to CONVERTED.

### 4.2 Export order
- **Header:** customer, currency, Incoterm (FOB by default), payment terms, port of loading, exchange rate (a snapshot copied from 报价规则 at creation; editable while DRAFT), signing date, note.
- **Lines:** the same product × store grid as the quote.
- **Detail page tabs:**
  - **概览:** status, money summary, next step, and a 「按门店」 table showing ordered / purchased / received / packed quantities per store.
  - **明细:** the product × store grid.
  - **采购:** linked purchase contracts with their status.
  - **货柜:** see §11.
  - **单证:** one menu 「单证 ▾」 with three actions:
    - 生成出口单证 (the existing workbook: 外销合同 / 商业发票 / 装箱单)
    - 报关单草稿 (`customsDeclarationDraftService`)
    - 船司装箱单核对
  - **收款:** customer receipts allocated to this order.
  - **退税:** readiness and blocking items.
- **Primary button by status** (existing `SALES_STATUS`; transitions unchanged and still done through `salesService.updateSalesStatus`):
  - DRAFT → 确认订单
  - CONFIRMED → 生成采购单
  - PACKING → 登记发运
  - SHIPPED → 登记到港
  - ARRIVED → 完成订单

### 4.3 Purchasing with supplier price comparison
**Comparison data (no new table).** Price history is derived from `PurchaseItem` joined with `PurchaseContract.supplierId`, the same source as the existing `GET /api/v1/purchases/price-history/:productId` (`purchaseController.getProductPriceHistory`). The endpoint is extended:
- add a `bySupplier` grouping;
- exclude DRAFT and CANCELLED contracts (the same "in effect" basis as payables, §4.7) and archived suppliers (§4.11);
- keep the current role list.

For each supplier the comparison shows:

| Column | Content |
|---|---|
| 最近单价 | Latest price (¥, tax included), plus date and contract number |
| 发票税率 | 13% / 1% |
| 近 12 月 | Minimum, average and count over the last 12 months |
| 质量备注 | Quality flag (`Supplier.hasQualityIssue`) |

The lowest latest price is highlighted. A note explains that a 13% VAT invoice is what makes the refund possible, so a 1% supplier is not directly comparable (Q4).

**Where the comparison appears:**
1. **出口订单 → 生成采购单.** A dialog lists the order's products. Each product's supplier defaults to the last supplier used, and the user can pick another from the comparison. On confirm, the system creates one DRAFT purchase contract per supplier. Each `PurchaseItem` has `storeId` copied from the order line, and each contract's `salesContractId` points to the order.
2. **采购 → 新建 / 编辑.** Choosing a product in a line opens the comparison popover, and 「用此供应商」 fills in supplier and price.
3. **商品详情 → 采购价格** and **供应商详情 → 供货商品** show the same data, read-only.

**Unchanged after creation:** signing, the Word contract (`contractDocService` with the `购销合同模板.docx` template), deposit and balance payments, production, staged receipts and inspection. The template has a single 收货店铺 field (the sample says 米尔皮塔, i.e. Milpitas) and prices lines as 不含税单价 + 13% tax = 价税合计. When a contract covers one store, that store fills the field; when it covers several, the field says 「见明细」 and the Word contract groups lines by product with the store split in the remarks column, matching the current 「具体店铺见后方报价单」 practice. The template's text-replacement mechanism is not changed.

### 4.4 Receiving and inventory
- `purchaseReceiptService.js` stays unchanged: staged arrivals, immutable inspection records, only accepted quantities enter stock, and the human-role restriction stays. The UI adds a store column, taken from `PurchaseItem.storeId`.
- **库存** is a single table filtered by product, store, status and order. Status changes always need a confirmation dialog, also on mobile.
- Changing inventory that comes from a purchase or inspection is still blocked (`inventoryStateMachine.js`).

### 4.5 Shipping and customs documents
- Packing lines already carry `storeId` and `purchaseItemId`, so store traceability continues to the container.
- Customs declarations follow the existing draft service. Only DRAFT declarations can be replaced, and declarations already released are refused.
- The carrier packing-list check keeps archiving the original PDF through `fileService.js`.

### 4.6 Invoices
- **进项发票** (supplier VAT invoices) are imported and matched under 财务 > 进项发票. A missing invoice shows up as a refund blocker on the order's 退税 tab and on 首页.
- **商业发票** (commercial invoice) is one sheet of the export workbook. It is not a separate object.

### 4.7 Finance
- **收款:** allocate customer receipts to orders.
- **付款:** supplier deposits and balances.
- **银行流水:** import, with only a masked account suffix stored (unchanged).
- **对账**, **报表** and **经营分析** stay.
- **No new finance logic.** Statements, evidence retention and the bank-data rules stay as they are; only layout changes.
- **One payables definition (owner decision 12).** Today 首页 (`dashboardController.js`), 财务概览 (`financeService.js` stats) and 经营执行 compute 应付 differently, and some include draft contracts.
  - **In effect** = purchase contract status SIGNED, PRODUCING, READY, SHIPPED, RECEIVED or COMPLETED. DRAFT and CANCELLED are never payables.
  - **应付 (outstanding)** = Σ over contracts in effect of max(`totalAmount` − `paidAmount`, 0), in CNY. An overpaid contract counts as 0, not as a negative payable.
  - **逾期应付** = the same sum restricted to contracts whose agreed payment date has passed (J8 maps the field actually used today and keeps it).
  - **One backend function** computes these figures. 首页, 财务概览, 经营分析, the 付款 list, the to-dos endpoint (§4.9), AI context and exports all call it; frontends only display the result. Every figure shows its definition on hover.
  - Phase item 2.3 (card J8). It changes reported numbers, so it takes the full process.

### 4.8 Export tax refund
- The 单证与退税 → 出口退税 tab lists orders with readiness: 报关单, 进项发票, 收汇.
- Preparing and confirming a refund stays ADMIN/FINANCE only (`taxRefunds.js`, `fileController.js`). Confirmation is still not the same as the official declaration.

### 4.9 首页 (home): to-dos by role
**One batched read-only endpoint** (`GET /api/v1/dashboard/todos`) returns counts plus the top 5 items per list. It replaces about 6 parallel calls, which also helps with the request-limit problem (Q1).

| List | Roles |
|---|---|
| 报价待发送 / 待客户确认 | SALES, ADMIN |
| 订单待采购 (order lines without a purchase line) | PURCHASE, ADMIN |
| 定金/尾款待付 | FINANCE, PURCHASE |
| 待收货验货 | WAREHOUSE, PURCHASE |
| 待装柜 / 待发运 | WAREHOUSE, SALES |
| 缺进项发票 (blocks the refund) | FINANCE |
| 逾期未收款 | FINANCE, SALES, BOSS |
| 可申报退税 | FINANCE |

The BOSS role also sees three money figures: 应收, 应付 and 本月毛利 (gross profit this month), each with its definition shown on hover.

### 4.10 Per-store supply (summary)
The store is visible and filterable at every step:

| Step | Where the store comes from |
|---|---|
| Quote | grid column |
| Order | `SalesItem.storeId`, already present |
| Purchase line | `PurchaseItem.storeId`, new |
| Receipt / inspection | through the purchase line |
| Inventory | through the purchase line |
| Packing | `PackingItem.storeId`, already present |
| Shipping marks | from the packing line |

The order's 「按门店」 table shows fulfilment per store. Shipping marks print the store code (§5.1), falling back to the store name.

### 4.11 Archiving instead of deleting (owner decision 13)
- **What is archived:** suppliers marked 「(存疑)」 (and 「(文件损坏)」, after the owner confirms Q11) and clearly identifiable test data (for example `QA-…` records). The selection uses explicit, documented rules, never fuzzy guesses.
- **What archiving does:** the record leaves pickers and default lists, appears under a 「已归档」 filter, and an ADMIN can restore it. History that references it (purchase contracts, payments, invoices, tax-refund evidence) stays intact and still displays it.
- **Data model:** reuse the existing `isActive` flag where it exists (`Supplier`, `Store`, `Port`…). Only where no flag exists, add a nullable `archivedAt` (+ `archivedReason`) through `npm run db:migrate`, which is a one-way door.
- **Script:** `backend/scripts/archive-test-data.js` with `--dry-run` (default), `--confirm`, `--backup-dir`, printing a receipt of IDs. Running it on production is a separate, backed-up step that needs owner approval; the PR never runs it.
- **No hard delete in the UI** for business records: the 「更多」 menu offers 归档 / 恢复, not 删除. Deleting a DRAFT the user just created stays possible where the backend allows it today.
- Phase item 2.4 (card J9).

---

## 5. Data-model changes

All changes are additive: new tables and nullable columns. They go through `npm run db:migrate` with a fresh backup in `prisma/backups/`, never through `prisma db push`.

**The exact fields, SQL, state machine and routes are frozen in [`DATA-MODEL-2026.md`](DATA-MODEL-2026.md) (card J10), which wins over the sketches below.** Main refinements there: the loading port is a text field (`portOfLoading`), not a `Port` relation; the quote keeps `spotRate` and `pricingRate`; quote edits only in DRAFT; a CANCELLED (作废) state instead of deletion.

### 5.1 Customer and Store
```prisma
model Customer {
  id                  String   @id @default(cuid())
  name                String   @unique          // "Seapot"
  legalName           String?                   // buyer name printed on PI / export docs (Q16)
  country             String?                   // "US"
  address             String?
  contactName         String?                   // Confidential
  contactEmail        String?
  contactPhone        String?
  defaultCurrency     String   @default("USD")
  defaultIncoterm     String   @default("FOB")  // Seapot buys FOB (owner decision 11)
  defaultPaymentTerms String?                   // e.g. "30% deposit, 70% before shipment"
  defaultPortOfLoading String?                  // port of loading text for "FOB <port>" (Q7)
  note                String?
  isActive            Boolean  @default(true)
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  stores         Store[]
  salesContracts SalesContract[]
  quotes         Quote[]

  @@map("customers")
}

model Store {
  // existing fields unchanged (name @unique, portId = destination port, contact*, address, isActive …)
  customerId String?   // nullable for the migration; the UI requires it for new stores
  code       String?   @unique  // short store code for shipping marks and PI lines, e.g. "SAC" (Q17)
  legalName  String?   // the store's operating entity, e.g. "Khp Sacramento LLC"; printed as ship-to (Q16)
  customer   Customer? @relation(fields: [customerId], references: [id])
  @@index([customerId])
}
```
- The research's other store fields (status pipeline/open, seats, rooms, equipment, receiving hours) are out of scope (§1.4). `Store.isActive` already covers closed stores.

### 5.2 Order-level fields on the export order
```prisma
model SalesContract {
  // existing fields unchanged (exchangeRate stays: it is the per-order snapshot)
  customerId   String?
  currency     String   @default("USD")
  incoterm     String?  // new orders copy the customer default (FOB); null on old rows
  paymentTerms String?
  quoteId      String?  @unique

  customer Customer? @relation(fields: [customerId], references: [id])
  quote    Quote?    @relation(fields: [quoteId], references: [id])
  @@index([customerId])
}
```
- `SalesItem.storeId` stays required. It records which store the line is for. The customer is never set per line.
- **Currency is USD only in v1.** Seapot is a US customer and the three-forms sample prints USD. The column exists so the PI can print it; non-USD pricing is out of scope.

### 5.3 Per-store purchasing
```prisma
model PurchaseItem {
  // existing fields unchanged
  storeId String?               // which Seapot store this quantity is for (null = stock)
  store   Store?  @relation(fields: [storeId], references: [id])
  @@index([storeId])
}

model PurchaseContract {
  // existing fields unchanged; storeName is kept but no longer written or shown
  salesContractId String?       // the export order this contract was generated from
  salesContract   SalesContract? @relation(fields: [salesContractId], references: [id])
  @@index([salesContractId])
}
```
- The store is stored on the purchase line, not as a link to a `SalesItem`. Sales lines may be rewritten when an order is edited, while a store id stays stable.

### 5.4 Quote / PI
```prisma
model Quote {
  id              String    @id @default(cuid())
  quoteNo         String    @unique            // QT + yyMM + seq, e.g. QT2611-003
  customerId      String
  currency        String    @default("USD")
  incoterm        String    @default("FOB")
  paymentTerms    String?
  portOfLoading   String?                      // port of loading (text)
  validUntil      DateTime?
  spotRate        Float?                       // spot rate snapshot at the last pricing
  pricingRate     Float?                       // spot − 0.2 actually used
  pricingRevision String                       // sha256 of pricing.json used (existing revision id); also fixes the round-up step used
  status          String    @default("DRAFT")  // DRAFT / SENT / ACCEPTED / REJECTED / CONVERTED / CANCELLED
  totalAmount     Float     @default(0)
  note            String?
  createdById     String
  sentAt          DateTime?
  acceptedAt      DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  customer      Customer       @relation(fields: [customerId], references: [id])
  port          Port?          @relation(fields: [portId], references: [id])
  createdBy     User           @relation("QuoteCreatedBy", fields: [createdById], references: [id])
  items         QuoteItem[]
  salesContract SalesContract?

  @@index([status])
  @@index([customerId])
  @@map("quotes")
}

model QuoteItem {
  id            String  @id @default(cuid())
  quoteId       String
  productId     String
  storeId       String?                        // required before conversion
  quantity      Float
  unit          String?
  costCny       Float?                         // reference cost per unit (¥, tax incl.)
  costSupplierId String?                       // supplier the reference cost came from
  markup        Float                          // 0.30 / 0.10 actually applied (multiplier − 1)
  formulaPrice  Float?                         // rule result (null if cost missing)
  unitPrice     Float                          // final price; may differ = manual override
  totalPrice    Float
  specification String?
  note          String?
  sortOrder     Int     @default(0)

  quote   Quote    @relation(fields: [quoteId], references: [id], onDelete: Cascade)
  product Product  @relation(fields: [productId], references: [id])
  store   Store?   @relation(fields: [storeId], references: [id])

  @@index([quoteId])
  @@map("quote_items")
}
```
- **State machine:**
  - DRAFT → SENT → ACCEPTED → CONVERTED
  - SENT → REJECTED; SENT → DRAFT (reopen)
  - DRAFT / SENT / ACCEPTED → CANCELLED (作废; quotes are never deleted)
  - Edits are allowed only in DRAFT. Everything after is locked.
  - **Expiry is computed** from `validUntil` and shown as a 已过期 badge. It is not a stored status.
  - **No versioning in v1.** 「复制为新报价」 creates a new number (Q3).
- Money fields use `Float` like the rest of the schema. `formulaPrice` is the already-rounded result of §7.2; totals are rounded to 2 decimals at write time.
- **No new price-history table.** `PurchaseItem` is the source of truth for supplier prices. The existing `PriceHistory` and `ProductSupplier.price` tables, filled by manual entry in `productController.js`, are shown as 「供应商报价（未成交）」 next to real purchases. Whether to retire them is decided after v1.

### 5.5 Migration and backfill notes
1. **Migration A** (Customer, Store.customerId / code / legalName, SalesContract order-level fields), **migration B1** (PurchaseItem.storeId, PurchaseContract.salesContractId) and **migration B2** (Quote, QuoteItem): new tables and nullable columns only. No data is rewritten in SQL. The exact schema diffs are frozen in `docs/redesign/DATA-MODEL-2026.md` (card J10). An archive migration (§4.11) is added only if no existing flag fits.
2. **Backfill script** `backend/scripts/backfill-default-customer.js` (new). It:
   - takes `--database` and `--customer-name` explicitly, plus `--dry-run` (default) and `--confirm`;
   - creates the customer if missing;
   - sets `customerId` on all stores and sales contracts that have none (it does not rewrite the trade terms of old orders; a null `incoterm` displays the customer default);
   - is idempotent, runs in one transaction, and prints only counts.
   It follows the backup and SQLite-safety patterns of the existing backup scripts. **The production run happens only after `npm run db:backup -- --database <path>` and with owner approval.** That makes it a one-way door (§14.3).
3. **`PurchaseContract.storeName` is not migrated** (today it is "—" on every row). A later cleanup PR may drop it.
4. **Making `Store.customerId` and `SalesContract.customerId` required** is a separate later migration, done only after the backfill is verified in production.
5. Every new write route is registered in `lifecycle/resources.json` (checked by `scripts/check-lifecycle.cjs`). Every new GET route is added to the `bossReadOnly.js` whitelist where BOSS should read it.
6. **`data-classification.json` and `SECURITY.md` are updated in the same PRs** (`AGENTS.md` rule):
   - Customer contacts, quotes and quote costs are Confidential.
   - Generated PI/Quotation files are Restricted "generated documents". They are streamed to the user and not stored. If one is ever stored, it goes through `fileService.js` with 0700/0600 permissions.

### 5.6 Permissions for new resources

| Resource | Read | Write |
|---|---|---|
| Customer / Store | all roles (BOSS read) | ADMIN, SALES |
| Quote (incl. cost columns) | ADMIN, SALES, PURCHASE, FINANCE, BOSS | ADMIN, SALES |
| Convert quote → order | — | ADMIN, SALES |
| Generate purchases from an order | — | ADMIN, PURCHASE |
| Supplier price comparison | existing roles of `price-history` (unchanged) | — |
| Pricing preview (`POST /api/v1/pricing/preview`, computes prices without exposing the file) | ADMIN, SALES, PURCHASE, BOSS | — |
| Pricing config (`/system/pricing-config`) | ADMIN (unchanged) | ADMIN (unchanged) |

Navigation never grants extra API permission. Every check stays on the server.

---

## 6. Quote / PI document

### 6.1 Reference formats (owner decision 3)
There is no customer quote Excel in the repo or its history (v1 search: the only spreadsheets ever committed were the HS master list, two confidential WPS export workbooks deleted in 4f28d11 that must not be restored, and some CSVs). The owner named these references instead:

| Reference | What it is | Used for |
|---|---|---|
| "Three forms" workbook, generated by `exportPacketService.js` (sample `jiesong-sample-three-forms.xlsx`, kept outside the repo) | Sheets 外销合同 / 商业发票 / 装箱单. Each sheet: title row (A1:J1 merged, e.g. `SALES CONTRACT / 外销合同`), number row (A2:J2), a two-column header block in rows 4–7 (labels in A and F, values merged B:E and G:J: Seller / Buyer / Destination / Currency, Contract No. / Date / Trade Term / Package), the line table from row 9 and a `TOTAL / 合计` row. The sample prints Trade Term **FOB** and Currency **USD**. | Quote/PI layout (§6.2); the export order's documents stay as they are |
| `backend/templates/购销合同模板.docx` + `docs/购销合同模板说明.md` | Purchase contract with a supplier, filled by text replacement: contract no., year, supplier name / tax id / address / bank / account / phone, 收货店铺, deposit %, product, quantity, unit price, amount, 13% tax, total, amount in Chinese words | Purchase contracts; unchanged (§4.3) |
| `docs/出口清单快速制单SOP.md` | Manual SOP for one shipment's documents: data sources, checks, the old pricing rule, refund-rate lookup | Its data checks inform §4.5; its **pricing section is superseded by §7** and is rewritten in the pricing PR (§7.4) |

### 6.2 Quotation / PI layout
The quote prints with the 外销合同 sheet layout, so an accepted PI and the later 外销合同 of the same order look alike and carry the same lines and prices. It is built with exceljs, reusing the cell styles and helpers of `exportPacketService.js`.

**Title and header (rows 1–8)**

| Row | Left label (A) → value (B:E) | Right label (F) → value (G:J) |
|---|---|---|
| 1 | `QUOTATION / 报价单`, or `PROFORMA INVOICE / 形式发票` once ACCEPTED (A1:J1) | |
| 2 | Quote/PI number, e.g. `QT2611-003` (A2:J2) | |
| 4 | Seller → company name and address (设置 > 公司信息) | Quote No. / PI No. → number |
| 5 | Buyer → `Customer.legalName` (Q16) | Date → issue date |
| 6 | Destination → the destination ports of the stores on the quote, comma-separated, or `-` | Trade Term → `FOB <port of loading>` (Q7) |
| 7 | Currency → `USD` | Valid Until → `validUntil` |
| 8 | Payment Terms → `paymentTerms` (B:J) | |

**Lines (header row 9)** — the 外销合同 columns, with the Package column replaced by the store:

| No. | Description | Specification | HS Code | Quantity | Unit | Unit Price (USD) | Amount (USD) | Ship-to Store | Remarks |
|---|---|---|---|---|---|---|---|---|---|

- One row per product × store, sorted by store, then by the grid's product order. Ship-to Store prints `Store.code` (falling back to the name).
- After each store's rows, a `SUBTOTAL <store>` row with the amount; at the end the `TOTAL / 合计` row with total quantity and amount, as in the sample.
- Unit prices are whole numbers under the pricing rule (§7) and print with 2 decimals (`#,##0.00`), the same format as the export sheets.
- Seller block (owner decision 2026-10-31, Q9 closed): company name + address in the Seller cell, bank details in a footer block; all read from company settings (`companyName`, `companyAddress`, `companyBankInfo`), blank when unset. Bank details are Restricted data (ADMIN/FINANCE read them in settings).

**Never printed:** costs, markups and supplier names.

**Export:** `GET /api/v1/quotes/:id/export.xlsx`, streamed and not stored. A print-friendly HTML view of the same layout is used for PDF via the browser's print dialog.

### 6.3 Quote pages
- **List:** a table with columns 编号, 客户, 门店数, 金额, 状态, 有效期 and 创建人.
- **Detail:** header facts, the product × store grid, and one primary button by status:

| Status | Primary button |
|---|---|
| DRAFT | 标记已发送 |
| SENT | 客户已接受 |
| ACCEPTED | 转为出口订单 |
| CONVERTED | 查看订单 |

---

## 7. Pricing rule (报价规则)

### 7.1 Today: three disagreeing sources
This table describes the code **before** the pricing PRs. The 6.8 default, the zero-refund 10% tier and rounding to a total ending in 0/5 are retired by §7.2; the −0.2 adjustment is kept as one config value.

| Where | What it does |
|---|---|
| `frontend/src/lib/constants.ts:11-12` | `DEFAULT_EXCHANGE_RATE = 6.8`, `DEFAULT_PROFIT_RATE = 1.3`, used by `sales/create/page.tsx` (「默认: 6.8」) and by `SystemConfigTab.tsx` |
| `SystemConfig` keys `exchangeRate` (`{rate, buffer}`) and `profitRate` | Edited in 设置 > 基础参数. Read by `configController`, `forexVerificationService`, `customsDeclarationService`, `patrolService`, `ai/contextService`, `routes/sales.js`, and the AI tool `update_system_config` in `openAgentService.js`. This is the source of the 6.60 (= 6.8 − 0.2) figure on finance overview. |
| `config/pricing.json` + `pricing.schema.json` | `mode` tiered/multiplier, `exchangeAdjustment −0.2`, `refundableMarkup 0.3`, `noRefundMarkup 0.1`, `multiplier 1.3`. Used by `exportPricing.js`, `exportReadinessService.js`, `exportPacketService.js`, and reimplemented in `scripts/prepare_export_packet.py`. The 10% tier keys off a **zero tax-refund rate**, not a category. Rounding picks a total ending in 0/5 or an integer unit price closest to the target markup. |

### 7.2 New rule (one formula, one file, one implementation)
Owner decision 10, locked 2026-10-31: sell_CNY = cost_CNY × 1.3 (tiles × 1.1); FX used = spot − 0.2; sell_USD = sell_CNY ÷ FX used, rounded **up** to whole USD, then rounded **up** to the next multiple of 5 (the price ends in 0 or 5).
```
spot        = pricing.exchangeRate                    // spot CNY per 1 USD, set in 设置 > 报价规则
fxUsed      = spot − pricing.exchangeAdjustment       // adjustment 0.2 (owner rule)
markup      = markup of the product's category, else the nearest ancestor category
              listed in pricing.categoryMarkups, else pricing.defaultMarkup (0.3)
              // 瓷砖 is listed with 0.1
sellCny     = costCny × (1 + markup)                  // costCny = unit purchase cost ¥ (basis: Q5c)
step        = pricing.roundUpTo                       // default 5
wholeUsd    = Math.ceil(Number((sellCny / fxUsed).toFixed(6)))      // 1 — round up to whole USD
unitPrice   = Math.ceil(Number((wholeUsd / step).toFixed(6))) * step // 2 — round up to a multiple of step
              // float guard: 13.000000000000002 stays 13, then 15 (not 14 → 15 by chance)
lineTotal   = round2(unitPrice × quantity)
```
- **Markup is on cost** (× 1.3 / × 1.1), not a margin on price.
- **The 0.2 adjustment stays**, as one config value next to the spot rate. Nothing else adjusts the rate.
- **Rounding happens in USD, after conversion** — not to whole yuan before converting. Two steps: up to whole USD, then up to the next multiple of 5. Exact multiples stay (2,000 stays 2,000; 1,996 → 2,000).
- **Owner example (final, 2026-10-31):** cost ¥10,000 → ¥13,000; spot 6.72 → 6.52; 13,000 ÷ 6.52 = 1,993.87 → **1,994** → **1,995**. The 1,995 is intentional. `roundUpTo` stays a config value (default 5; 1 gives plain whole-USD rounding).
- **No zero-refund tier.** The × 1.1 multiplier keys off the product's **category**, not its tax-refund rate. Products with a 0% refund rate get × 1.3 unless their category is listed (Q5d).
- **Unit price does not depend on quantity.** The old "line total ends in 0/5" logic is dropped; the multiple-of-5 rule applies to the **unit price**.
- **Missing or zero cost → no suggested price.** The line is flagged 缺成本, and the user enters a price manually, which gets the 手动价 badge.
- **Spot rate must be a positive finite number** (≤ 4 decimals) greater than the adjustment. An invalid file stops pricing with a clear error and no hidden default, as today.

**Examples** (spot 6.72, adjustment 0.2 → FX used 6.52, step 5):

| Cost ¥ | Category | × | sell ¥ | ÷ 6.52 | Whole USD | Price $ (×5) |
|---|---|---|---|---|---|---|
| 10,000.00 | normal | 1.3 | 13,000.00 | 1,993.8650 | 1,994 | **1,995** (owner example) |
| 100.00 | 餐具 (normal) | 1.3 | 130.00 | 19.9387 | 20 | **20** |
| 100.00 | 瓷砖 | 1.1 | 110.00 | 16.8712 | 17 | **20** |
| 65.20 | normal | 1.3 | 84.76 | 13.000000000000002 (float) | 13 (plain `ceil` would give 14) | **15** |
| — | — | — | — | 1,996 | 1,996 | **2,000** |
| — | — | — | — | 2,000 | 2,000 | **2,000** (unchanged) |
| 0 / missing | any | — | — | — | — | 缺成本 |

### 7.3 Config file and settings UI
`config/pricing.json` stays the only source. It keeps the existing revision, lock and atomic save, the deploy-time backup and restore, and the stderr audit of field names and hashes. Only the shape changes:
```json
{
  "exchangeRate": 6.72,
  "exchangeAdjustment": 0.2,
  "defaultMarkup": 0.3,
  "categoryMarkups": [{ "categoryId": "<ProductCategory.id>", "categoryName": "瓷砖", "markup": 0.1 }],
  "roundUpTo": 5
}
```
- `pricing.schema.json` is updated to match:
  - `exchangeRate` (spot) a positive number up to 100 (≤ 4 decimals), greater than `exchangeAdjustment`;
  - `exchangeAdjustment` between 0 and 1, default 0.2;
  - markups between 0 and 1;
  - `roundUpTo` a positive whole number, default 5;
  - `categoryId` must exist when saved;
  - `categoryName` is a display snapshot.
- **设置 > 报价规则** is one card containing:
  - spot rate and adjustment (shows the FX used);
  - default markup %;
  - category list (add a category, set %);
  - round-up step;
  - a live preview 「成本 ¥100 → $20」 (normal) and 「→ $17」 (瓷砖) at spot 6.72;
  - the last change (who and when).
  It is ADMIN only and replaces both `PricingConfigCard` and the 基础参数 rate/profit fields.
- **The live `config/pricing.json` on the server is not converted by a merge.** The deploy keeps the runtime file, so the pricing PR documents a one-off conversion (backup, convert old shape → new shape, validate, restore path). Running it on production needs owner approval and is not part of any PR.
- **Saved order and quote prices are never recalculated** when the rule changes. Each quote and order stores its rate snapshot. Customs, forex and finance code that needs a rate for an order uses **that order's stored `exchangeRate`**. Only "no order yet" cases (new quote, new order default) read the config.

### 7.4 What to delete or change
| File | Change |
|---|---|
| `frontend/src/lib/constants.ts` (+ `constants.test.ts`) | delete `DEFAULT_EXCHANGE_RATE`, `DEFAULT_PROFIT_RATE` |
| `frontend/src/app/dashboard/sales/create/page.tsx` | remove the local profit calculation and 「默认: 6.8」 (the page is rewritten in Phase 5) |
| `frontend/src/app/dashboard/settings/components/tabs/SystemConfigTab.tsx` | delete the rate/profit fields ("1.3 表示 30% 利润") |
| `frontend/src/app/dashboard/settings/components/PricingConfigCard.tsx`, `services/pricing.service.ts` | replace with the new 报价规则 card |
| `backend/src/services/exportPricing.js` | replace `targetMarkupFor`, `unitForRoundedTotal`, the nearest-5 candidates and `strictCap` with one `priceFor({ costCny, categoryId }, config)` |
| `exportReadinessService.js`, `exportPacketService.js` | call `priceFor`. **Packet generation uses the confirmed order line price** (`SalesItem.sellingPrice` / `PackingItem.unitPrice`). The historical-price tolerance gate (`historicalQuoteAllowed`) is removed; the formula only *suggests* prices for unpriced lines. Data-missing blockers stay. This is a behaviour change, so it needs owner sign-off (Q5e). |
| `scripts/prepare_export_packet.py`, `tests/test_pricing_configuration.py` | remove the Python copy of the formula. Retire the script if production no longer uses it (to verify); otherwise make it call the Node service. Either way, only one implementation remains. |
| `SystemConfig` keys `exchangeRate`, `profitRate` and their readers (§7.1) | switch to the order's rate or to `pricing.exchangeRate`. Stop writing the keys; a later cleanup removes the rows. |
| `openAgentService.js` tool `update_system_config` for exchangeRate/profitRate | AI may *read* the rule. Changing it is only possible in 设置 by ADMIN (Q10). |
| `config/pricing.json`, `config/pricing.schema.json`, `docs/operations/export-pricing.md`, `tests/fixtures/pricing-synthetic.json`, `lifecycle/singleton-config.template.json` | update to the new shape and fixtures |
| `docs/出口清单快速制单SOP.md` (定价规则 section: historical-quote rules and the zero-refund 10% path) | replace with a pointer to §7.2 (the spot − 0.2 rate stays); the refund-rate lookup and data checks stay |
| `AGENTS.md` (Export pricing section), `SECURITY.md`, `data-classification.json` | updated together in the pricing PR (`AGENTS.md` rule for config changes) |

---

## 8. Visual design direction

All of it is built on shadcn/ui (mandatory per `AGENTS.md`). Tokens live in `frontend/src/app/globals.css`, and `DESIGN.md` is updated in the same PR.

### 8.1 Layout shell
```
┌──────────┬──────────────────────────────────────────────┬───────────────┐
│ Sidebar  │ Top bar: 面包屑 / 标题 · ⌘K 搜索 · 🔔 · AI · 用户 │               │
│ 232 px   ├──────────────────────────────────────────────┤  AI panel     │
│ (56 px   │ Page header: facts · status · [主操作] [更多▾] │  400 px       │
│ collapsed│──────────────────────────────────────────────│  (docked,     │
│ icons)   │ Content (max-width none for tables,           │   resizable   │
│          │ 960 px for forms)                             │   360–560)    │
└──────────┴──────────────────────────────────────────────┴───────────────┘
```
- CSS grid columns are `sidebar | main | ai`. **When the AI panel opens, the main column shrinks.** Nothing overlays content.
- Below 1280 px the sidebar collapses to icons. Below 768 px, mobile layout (§8.8).

### 8.2 Typography
- **Font:** keep the existing CJK sans stack (PingFang SC, Microsoft YaHei, Source Han Sans SC). Drop the serif display font for numbers.
- **Sizes:** 12 / 13 / 14 (body) / 16 / 20 / 24. Tables use 13 px.
- **Numbers** use `font-variant-numeric: tabular-nums` and are right-aligned in tables.
- **Document numbers** (EXP…, CG…, QT…) use the existing mono font (`--font-ui-mono`).

### 8.3 Colour
- **Neutral base:** shadcn `zinc` scale for surfaces and borders.
- **One brand accent:** a calmer, deeper green-teal than today's highly saturated green (proposal: `--primary: oklch(0.50 0.11 165)`). It is used only for primary buttons, links and the active nav item.
- **Semantic colours:**

| Colour | Meaning |
|---|---|
| gray | draft / inactive |
| blue | in progress |
| amber | waiting for someone / needs action |
| green | done |
| red | blocked / overdue / destructive only |

- Red is rare by design, which removes the "red wall" seen on 经营执行 and 工作台.
- Dark mode keeps working through the existing `ThemeProvider`, with the same tokens in the `.dark` scope.

### 8.4 Density, spacing, shape
- 4/8 px spacing grid.
- Table rows 36 px (compact); form controls 36 px; buttons 32/36 px.
- Radius `--radius: 0.375rem` (6 px), no pill shapes (the auth pages are aligned to this too).
- Borders instead of shadows. The only shadows are on popovers and dialogs.

### 8.5 Tables (one `DataTable`)
`DataTable` is built from the existing pieces: `ui/table`, `useTableSort`, `page-size-select`, `data-state`, `empty-state`. It adds no dependency. Features:
- server paging (20/50/100);
- search with a 重置 button;
- filter chips;
- sticky header and a sticky right-hand actions column;
- horizontal scroll inside the table (fixes cut-off columns at 1280 px);
- row click opens the detail page;
- per-row 「更多 ▾」 holding edit and 归档 / 恢复 (§4.11); delete only for the user's own drafts where the backend allows it, always with confirmation;
- CSV export through the existing service.

**Error state:** the server message plus a 重试 button. Summary cards show 「—」 and never 0 while loading or after an error.

### 8.6 Forms
- One field system based on `ui/form` (react-hook-form + zod).
- **Money input:** 2 decimals, currency prefix.
- **Quantity input:** shows the unit.
- **Date picker:** zh-CN, `YYYY-MM-DD`.
- **Pickers:** searchable and server-side (`command` + `popover`). The browser's bare number input is not used.
- **Line grids** (quote, order, purchase): keyboard navigation, paste from Excel, and a row total plus grand total that stay visible.
- **Validation** is shown inline on blur.
- Leaving a page with unsaved changes asks for confirmation. `draft-restore-prompt` is reused for long forms.

### 8.7 Status badges
`status-badge.tsx` and `semantic-badge.tsx` merge into one `StatusBadge`. One file maps every status to a label and a semantic colour:

| Object | Statuses |
|---|---|
| 报价 | 草稿 gray · 已发送 blue · 已接受 green · 已拒绝 gray · 已转订单 green · 已作废 gray · 已过期 amber |
| 出口订单 | 草稿 gray · 已确认 blue · 装柜中 blue · 已发运 blue · 已到港 amber · 已完成 green · 已取消 gray |
| 采购合同 | 草稿 gray · 已签订 blue · 生产中 blue · 待装柜 amber · 已发货 blue · 已收货 green · 已完成 green · 已取消 gray |
| 库存 | 生产中 blue · 包装中 blue (fixes today's danger colour) · 运输中 blue · 已入库 green · 已出库 gray |

### 8.8 Mobile
- **Purpose:** look things up, approve, confirm statuses, and record receipts with photos.
- **Not on mobile:** editing line grids, the 3D container view, and finance statements (read-only summary).
- Lists use `MobileListCard` (`md:hidden`) and desktop tables `hidden md:block`, the existing pattern. Every state-changing tap asks for confirmation.

### 8.9 Wording and formats
- **Money:** one helper (`amount-text.tsx`) for 2 decimals and an explicit currency (¥ / $).
- **Dates:** `YYYY-MM-DD`; zh-CN month names.
- **Browser tab title:** `<page> · 捷淞`.
- **Errors:** 「<what failed>：<server reason>」 + 重试. No developer wording such as 「本页排序」, hsCode or trim.

---

## 9. (reserved)

This section is reserved so the numbering matches the task list; the AI panel is §10.

---

## 10. AI assistant side panel

- **Containers:** today's floating draggable button (`AIAssistant.tsx`, `fixed z-[140]`) and the overlay card (`fixed … md:w-[24rem]`) are replaced by a **docked right column** in the layout grid (§8.1). The chat internals stay as they are (messages, sessions, tool confirmation, streaming, `LazyAIAssistantMount`); only the container changes.
- **Opening it:** the 「AI」 button in the top bar, `Ctrl/⌘ + J`, or `?ai=1`. The open/closed state and width are remembered per browser.
- **Page context:** the panel sends the current route and record id (e.g. order EXP260012), so 「这个订单还缺什么？」 works without copy-pasting. It uses existing tools; the panel adds no new permissions.
- **Panel layout:** the header shows a 「历史」 button (the user's own sessions) and a 「新对话」 button. Admin token usage moves to 设置 > AI 用量.
- **Mobile:** a full-screen sheet, opened only on tap, with a clear close button.
- **Safety unchanged:** tool role checks, one business confirmation for signing, payment and physical-status actions, no automatic retries. BOSS keeps no AI (existing rule).
- **Branding:** the panel title is 「AI 助手」 everywhere. 「JIESONG 助手」 is removed.

---

## 11. Container loading (separate PR)

The 3D container loading plan (集装箱装货图, 40HQ) is being audited and rebuilt separately on branch **`feat/container-loading-40hq`**, in its own PR. This spec does not touch container-loading code (`components/container/*`, `containerService.js`, the loading algorithm or the packing positions) and has no container phase. The redesigned export-order detail page (`/dashboard/orders/[id]`, Phase 5) gets a **货柜** tab that embeds that PR's result as a self-contained component. Until that PR merges, the tab shows the current `Container3DView` unchanged. Whichever PR lands second does the small integration (import path and props), and nothing else.

---

## 12. What to delete

| Item | Why |
|---|---|
| `app/forex-verifications/page.tsx`, `components/public/service-page.tsx` (+ test) | Public marketing page with invented metrics; not part of the business system |
| `app/dashboard/users/page.tsx` → moved to `settings/users`; delete the old 487-line `settings/users/page.tsx` | Two user-management pages |
| `app/dashboard/system/page.tsx` | A page of links only |
| `app/dashboard/ai/page.tsx` as a page; AI menu entry; `AI_TABS` | Replaced by the side panel |
| 库存状态 tab inside `products/page.tsx` | Duplicate of the inventory page |
| `ModuleTabHeader`, `*_TABS` arrays, `HeaderContextPills` (if unused after the shell) | The layered headers |
| `components/dashboard/TradeWorkflowBoard`, `QuickActionGrid`, `KpiCard` row-count tiles, the WPS/Codex box on 首页 | Replaced by to-dos |
| `components/dialog/BatchImportDialog` **or** `components/batch-import/BatchImportDialog` (keep one) | Duplicate |
| `ui/status-badge` + `ui/semantic-badge` → one `StatusBadge` | Duplicate |
| Pricing code listed in §7.4 | One rule |
| 设置: 基础参数 rate/profit, the duplicated pricing block; AI temperature/max-tokens moved to 「高级」 | Clutter |
| Three ambiguous header buttons (导出出口工作簿 / 出口三单工作台 / 生成申报三表) → one 「单证 ▾」 menu | Users can't tell them apart |
| Redirect stubs: kept, but retargeted to the new URLs | Old bookmarks keep working |

**Proposed for a separate housekeeping PR, after owner approval** (not UI work):
- Root files: `,`, `screenshot_*.png`, `demo/`, `progress.md`, `findings.md`, `task_plan.md`, `QA_REPORT_2026-04-02.md`. That report mentions an `admin/123456` login: check whether it ever existed outside test setups, and rotate it if it did.
- Possibly `vercel.json`, `render.yaml` and the Supabase keep-alive workflow (production runs on the VPS).
- The frontend `xlsx@0.18.5` dependency (used in 5 files; unmaintained on npm), to be replaced by server-side exceljs parsing.

**Production data** (QA-… test records, 「(存疑)」 suppliers and, if confirmed, 「(文件损坏)」 suppliers) is **archived, never deleted** (owner decision 13, §4.11, card J9). The production run of the archive script is a separate backed-up step that needs owner approval.

---

## 13. Open questions for the owner

Numbers are stable (task cards refer to them). Answered questions stay listed, marked **Answered**, so earlier references still resolve.

### 13.1 Answered (2026-10-30)
- **Q5 (part) Markup basis:** markup on cost, × 1.3 normal / × 1.1 tiles.
- **Q5a Rounding (final, 2026-10-31; also answers the former 5f):** FX used = spot − 0.2; after conversion round **up to whole USD**, then **up to the next multiple of 5** (1,993.87 → 1,994 → 1,995; 1,996 → 2,000; 2,000 stays). Not whole yuan. The 1,995 in the owner's example is intentional.
- **Q6 Payables:** draft purchase contracts are not payables; one shared computation on every page (§4.7).
- **Q7 (part) Currency and Incoterm:** USD; Seapot buys **FOB** (§4.1, §5).
- **Q11 (part) Archiving:** test data and 存疑 suppliers may be archived, never hard-deleted (§4.11).
- **Q14 UI process:** the lightweight process for pure UI PRs is approved (card JP implements §14).
- **Q15 Seapot research:** received; its effect is in §1.4 and §5.1. New questions from it are Q16–Q18.
- **Q2 (part) Quote format:** no separate quote Excel; use the three-forms workbook and the contract template (§6).

### 13.2 Still open
1. **Request limit.** What is `TRUSTED_PROXY_CIDRS` in production? With it unset, all staff may share one budget of 100 requests per minute. This is an ops check outside this spec; the redesign aims for ≤ 5 API calls per page load.
2. **Quote layout details.** §6.2 prints one row per product × store with a store column and per-store subtotals. Does Seapot instead want one PI per store (each store is its own LLC, Q16)? Extra columns (CBM, packing, photos)? Are versions needed, or is 「复制为新报价」 enough?
3. **Quote lifecycle.** Is "accepted" a simple button, or do you need the customer's signed PI uploaded as proof?
4. **Supplier comparison.** Compare on the tax-included price or the price after tax refund? Should 1% invoice suppliers be flagged as "no refund"?
5. **Pricing, remaining points.**
   - *5a and the former 5f (rounding): Answered (§13.1).*
   - **5b. Which categories get × 1.1** besides 瓷砖? Does a 瓷砖 product category already exist in production, and should its sub-categories inherit 1.1?
   - **5c. Cost basis.** Is "purchase price" the tax-included price (价税合计 per unit, as the 13% VAT invoice shows) or the price before tax? The purchase contract template prints 不含税单价 + 13% tax.
   - **5d. Zero-refund goods.** The old SOP capped products with a 0% refund rate at 10% markup. Under the new rule they get × 1.3 unless their category is listed. Confirm.
   - **5e. Packet price gate.** May export-document generation stop applying the historical-price tolerance gate and simply use the confirmed order price?
6. *(Answered, §13.1.)*
7. **Port of loading and payment terms.** FOB which Chinese port(s) (prints as "FOB <port>")? What payment terms does Seapot use (e.g. 30% deposit, 70% before shipment)?
8. **Per-store purchasing.** Do suppliers pack and label per store? If not, should purchase lines still be split per store, or keep one line with a store breakdown?
9. **Bank details.** May the PI print the company bank account? It is Restricted data today, so printing it needs an explicit decision.
10. **AI.** The assistant can currently change the exchange rate through chat. This spec removes that, so 设置 > 报价规则 is the only place ("one config place"). OK?
11. **Data clean-up, remaining points.** Should 「(文件损坏)」 suppliers be archived too? Who fills in supplier contacts and product weights/CBM? **Approval to run the archive script on production** (separate backed-up step).
12. **Branding.** Is the product named 「捷淞」, 「捷淞外贸系统」 or 「捷淞国际物流」? Is there a logo or brand colour to keep?
13. **Repo housekeeping.** May the root clutter (§12) and the Vercel/Render/Supabase leftovers be removed in a separate PR?
14. *(Answered, §13.1.)*
15. *(Answered, §13.1.)*
16. **Buyer and ship-to entities.** Public filings show one LLC per Seapot store (e.g. Khp Sacramento LLC, Seapot Cerritos LLC, Seapot TX Group LLC) and a possible group buying entity, Sp Food Trading LLC. Who is the buyer on the PI and export documents, and should each store's LLC print as ship-to?
17. **Store list and codes.** Which are the ~10 current 门店 (research confirms 5–6 operating stores, including Plano, Texas, plus pipeline sites)? What short code should shipping marks use for each?
18. **Units and US compliance.** Should tile lines print m² or sq ft? Do electrical items (induction burners) need UL/ETL/NSF evidence tracked in the system? Tracking it is out of scope for this redesign (§1.4).

### 13.3 Approvals needed before specific steps (not design questions)
- **Database migrations** A, B1, B2 and any archive migration (cards J11, J16, J20, J9) are one-way doors: owner sign-off before merge and before the production run.
- **Live `config/pricing.json` conversion** (card J6): owner sign-off before the production file is converted.
- **Production archive run** (card J9): owner sign-off, with a backup.

## 14. Lightweight process for UI-only PRs (approved)

The owner approved the lightweight process on 2026-10-30. Nothing here is changed by this docs PR: card JP implements the check script, CI wiring and `AGENTS.md` text in its own full-process PR. The `main-protection` ruleset, the 9 required checks and the review-freshness requirement stay exactly as they are.

### 14.1 Definition of a UI-only PR
**Every changed path is inside:**
- `frontend/src/app/**`, `frontend/src/components/**`, `frontend/src/lib/format*`, `frontend/src/app/globals.css`;
- `frontend/e2e/**`, `frontend/public/**`;
- `docs/redesign/**`, `DESIGN.md`.

**And no changed path is any of:**
- security-sensitive frontend files: `frontend/src/lib/auth-session.ts`, `lib/api-base-url.ts`, `lib/axios*`, `frontend/src/services/**`, middleware/proxy files, `next.config.*`;
- `package.json` or lockfiles;
- anything under `backend/`, `config/`, `scripts/`, `lifecycle/`, `.github/`, or Prisma files.

A small proposed script, `scripts/check-ui-only.cjs` (not written in this PR), would verify the diff against this allowlist, so the `ui-only` label can't be applied to the wrong PR.

### 14.2 What changes for UI-only PRs (proposal)
- **Approval:** the bot that the owner named as sole approver approves and merges, after an independent review. The review-freshness marker and the local `check-review-freshness.cjs` run stay required (card JP does not change them). UI-only PRs are two-way doors: rollback = revert the merge commit and redeploy (`docs/operations/production-rollback.md`).
- **PR body:** a short form instead of the full template — "UI-only (two-way door) · blast radius: <pages> · rollback: revert" — plus before/after screenshots from the Playwright run.
- **Checks that stay required** (all 9 stay in the ruleset):

| Check | For UI-only PRs |
|---|---|
| Code Quality | runs fully |
| Type Safety Check | runs fully |
| Lint Check | runs fully |
| Build Test | runs fully |
| Frontend Unit And Coverage | runs fully |
| Frontend E2E Acceptance | runs fully |
| Secret Detection | runs fully |
| Backend Unit Tests, Unit Tests | proposal: when the change gate reports no backend change, the job exits successfully at once, so the required status still reports instead of hanging as "pending" (which a workflow-level `paths` filter would cause) |

- **Deploy:** after merge, through the existing `deploy.yml`. The bot is the sole approver for production deploys of this work, per the owner. Post-deploy verification (`verify-vps-runtime.cjs`) stays.

### 14.3 What keeps the full process
Any PR touching the following keeps the full process: two-door statement, review against `CODING_STANDARDS.md`, review-freshness marker and local check, and `SECURITY.md` / `AGENTS.md` / `data-classification.json` updated together.
- Prisma schema or migrations;
- backfill scripts;
- backend routes, permissions or `bossReadOnly.js`;
- `config/pricing*.json` or `pricingConfigService`;
- export packet, customs, tax refund or finance services;
- `fileService.js`;
- anything under `.github/`;
- dependency changes.

The migrations and the production backfill (§5.5) are **one-way doors** and need explicit owner approval before merge and before the production run.

---

## 15. Phased implementation plan

Each PR is small and independently mergeable, and leaves `main` deployable. **UI** = qualifies for the lightweight process (§14, approved). **Full** = full process. Effort is in developer-days for one experienced developer.

Verification for every PR: the 9 required CI checks. Additional checks are listed per PR. "E2E" means `frontend/e2e` specs are added or updated for the touched pages; backend PRs add unit tests in the same folder (`*.test.js`) and, where they write data, an `integration/*.integration.js` suite.

Each row names its task card in `claude-tasks-20261031/` (outside the repo). **Depends on** lists cards that must be merged first unless noted. The container stream (cards C1–C5, §11) runs separately.

### Phase 0: Spec and design freeze
| PR | Card | Scope | Files | Effort | Process | Depends on |
|---|---|---|---|---|---|---|
| 0.1 | J0 | This document, v1 + v2 | `docs/redesign/UX-REDESIGN-2026.md` | — | docs | — |
| 0.2 | J10 | Data-model freeze: exact schema diffs for migrations A, B1, B2, backfill rules, rollback, permissions, test plan | `docs/redesign/DATA-MODEL-2026.md` | 1 | docs | J0 |

### Phase 1: Foundation (no behaviour change)
| PR | Card | Scope | Files | Effort | Process | Depends on |
|---|---|---|---|---|---|---|
| 1.1 | J1 | Design tokens: colours, radius, type scale, tabular numbers; update `DESIGN.md` | `globals.css`, `DESIGN.md` | 1 | UI | — |
| 1.2 | J2 | App shell: grouped sidebar, top bar with breadcrumb + title, ⌘K search, single `PageHeader`; new menu labels **pointing to the existing URLs**; delete `ModuleTabHeader` | `components/layout/*`, `navigation.config.ts`, `app/dashboard/layout.tsx`, page headers | 3 | UI (+ `AGENTS.md` 商品 line, done by an admin) | J1 |
| 1.3 | J3 | AI docked side panel on every page; remove floating button and AI menu; `/dashboard/ai` stub opens the panel; route/record context | `components/ai/AIAssistant.tsx`, `LazyAIAssistantMount.tsx`, layout | 2 | UI | J2 |
| 1.4 | J4 | Shared blocks: `DataTable`, `StatusBadge` merge, money/date formatters, `ErrorState` (server reason + retry, no fake zeros), confirm in 「更多」 | `components/ui/*`, `lib/format*` | 3 | UI | — |
| 1.5 | J5 | Quick wins: public pages (placeholder, wording, `AuthShell`, `<h1>`, titles, 404), 首页 WPS box admin-only, 经营执行 summary line, inventory quantity column, `包装中` colour | auth pages, `dashboard/page.tsx`, `reports/page.tsx`, `InventoryTab.tsx` | 2 | UI | — |
| 1.6 | JP | Lightweight UI-PR process (§14): `scripts/check-ui-only.cjs` + test, CI wiring for the `ui-only` label, UI-only PR body variant, `AGENTS.md` text; rulesets and review freshness unchanged | `scripts/`, `.github/`, `AGENTS.md` | 1 | **Full** (`.github/`) | J0 |

### Phase 2: One pricing rule and the owner's business rules
| PR | Card | Scope | Files | Effort | Process | Depends on |
|---|---|---|---|---|---|---|
| 2.1 | J6 | New `pricing.json` shape and schema; `priceFor()` (× 1.3 / × 1.1 by category, round up to whole USD then to a multiple of 5, step default 5); `POST /pricing/preview`; settings card 报价规则; delete the frontend constants and 基础参数 fields; live-config conversion steps in the PR body | §7.4 list (backend, config, frontend settings, docs, fixtures) | 3 | **Full**; live conversion needs owner approval | J0 |
| 2.2 | J7 | Rate consumers: customs, forex, patrol, AI context and `routes/sales.js` use the order rate or the config; AI write tool removed; packet uses the confirmed order price (after Q5e); Python duplicate retired or delegated; SOP pricing section replaced | services listed in §7.1, `openAgentService.js`, `prepare_export_packet.py`, `docs/出口清单快速制单SOP.md` | 3 | **Full** (finance-adjacent) | J6 |
| 2.3 | J8 | **Payables, one basis** (§4.7): map every payables computation, one shared backend function excluding DRAFT/CANCELLED, every endpoint uses it, frontends only display | `financeService.js`, `dashboardController.js`, AI context, exports (+ consistency test) | 2 | **Full** (finance) | J0 |
| 2.4 | J9 | **Archive, never delete** (§4.11): reuse `isActive` or add nullable `archivedAt`/`archivedReason`; 「已归档」 filter and ADMIN restore; `archive-test-data.js` (`--dry-run` default, `--confirm`, `--backup-dir`, receipt); no production run | services/routes of the affected objects, `backend/scripts/archive-test-data.js` (+ tests), migration only if needed | 2 | **Full**; one-way door if it adds a migration | J0 |

Verification for 2.1: pricing unit tests with the examples in §7.2 (including the float case 65.20 → 13.000000000000002 and the owner example), missing cost → 缺成本, the 瓷砖 category and an inherited sub-category; updated `pricing-synthetic.json`; `pricingConfigService`/route auth tests. For 2.3: a fixture with draft, effective, cancelled and partly paid contracts gives identical totals on every endpoint.

### Phase 3: Customer and stores
| PR | Card | Scope | Files | Effort | Process | Depends on |
|---|---|---|---|---|---|---|
| 3.1 | J11 | Migration A (Customer with FOB default, `Store.customerId` / `code` / `legalName`, order-level fields) + backfill script (dry-run/confirm) | `schema.prisma`, migration, `backend/scripts/backfill-default-customer.js` (+ test) | 2 | **Full**, one-way door | J10 |
| 3.2 | J12 | Customers API (CRUD, stores under a customer), RBAC, BOSS GET whitelist, lifecycle registration, classification docs | `routes/customers.js`, controller/service, `bossReadOnly.js`, `lifecycle/resources.json`, `SECURITY.md`, `AGENTS.md`, `data-classification.json` | 2 | **Full** | J11 |
| 3.3 | J13 | 客户与门店 pages (list, detail with stores and orders); remove the inline `CreateStoreDialog` from the order form | `app/dashboard/customers/**` | 2 | UI | J12, J2 |

### Phase 4: Supplier price comparison and per-store purchasing
| PR | Card | Scope | Files | Effort | Process | Depends on |
|---|---|---|---|---|---|---|
| 4.1 | J14 | Extend price-history with `bySupplier`; exclude DRAFT/CANCELLED and archived suppliers; same roles | `purchaseController.getProductPriceHistory`, routes, tests | 1 | **Full** (backend) | — |
| 4.2 | J15 | Comparison popover in the purchase line editor; product detail 采购价格 tab; supplier detail page | `purchases/**`, `products/[id]`, `suppliers/[id]` | 3 | UI | J14, J2 |
| 4.3 | J16 | Migration B1: `PurchaseItem.storeId`, `PurchaseContract.salesContractId`; 「生成采购单」 service (one DRAFT contract per supplier, in a transaction) + route | schema, `purchase*Service`, routes, lifecycle | 3 | **Full**, one-way door | J11, J10 |

### Phase 5: Export order rewrite
| PR | Card | Scope | Files | Effort | Process | Depends on |
|---|---|---|---|---|---|---|
| 5.1 | J17 | `/dashboard/orders` list (table); old `/sales` URLs become stubs | `app/dashboard/orders/page.tsx`, stubs | 2 | UI | J2, J4 |
| 5.2 | J18 | `/orders/new` and edit: order-level header (Seapot, USD, FOB), product × store grid, paste from Excel, server-side pickers (fixes the 100-row limit), pricing preview with whole-number prices | `orders/new`, `components/orders/*` | 5 | UI (uses APIs from J6/J12) | J6, J12, J17 |
| 5.3 | J19 | `/orders/[id]`: tabs, one next-step button, 「单证 ▾」 menu, 按门店 table, 货柜 tab embedding the container view (§11); split `SalesDetailPageContent.tsx` (2,058 lines) | `orders/[id]/**` | 5 | UI | J18, container PR (C-stream) |

### Phase 6: Quote / PI
| PR | Card | Scope | Files | Effort | Process | Depends on |
|---|---|---|---|---|---|---|
| 6.1 | J20 | Migration B2 (`Quote`, `QuoteItem`, FOB default); quote service with state machine; convert-to-order transaction; routes, RBAC, lifecycle, BOSS whitelist, classification | schema, `quoteService.js`, `routes/quotes.js` (+ tests, integration) | 4 | **Full**, one-way door | J10, J11, J6 |
| 6.2 | J21 | Quotation/PI Excel export in the 外销合同 layout (§6.2; streamed, not stored) + print view | `quoteExportService.js` (exceljs), route | 2 | **Full** (generated documents) | J20 |
| 6.3 | J22 | Quote pages: list, new/edit grid (reuses the 5.2 grid), detail | `app/dashboard/quotes/**` | 3 | UI | J20, J18 |

### Phase 7: Remaining modules re-skinned
| PR | Card | Scope | Files | Effort | Process | Depends on |
|---|---|---|---|---|---|---|
| 7.1 | J23 | `/dashboard/purchases` list/new/detail on the new shell (receipt panels keep their logic); old URLs become stubs | `app/dashboard/purchases/**`; split `CreatePurchasePageContent.tsx`, `ContractsPageContent.tsx` | 4 | UI | J2, J4 |
| 7.2 | J24 | `/dashboard/inventory` (single view, store filter, confirmed status changes); products table with 「资料不全」 filter | `inventory/**`, `products/**` | 3 | UI | J2, J4 |
| 7.3 | J25 | 单证与退税: `/dashboard/customs` with tabs; move `app/customs-declarations/components`; tax-refund list readable | `customs/**`, `tax-refunds/**` | 3 | UI | J2, J4 |
| 7.4 | J26 | 财务: tabs; split `payments/page.tsx` (1,958 lines) into 收款/付款; statements inner tabs; 经营分析; payables shown from the shared function | `finance/**` | 5 | UI | J2, J4, J8 |
| 7.5 | J27 | 首页 to-dos: read-only `GET /dashboard/todos` using the shared payables function | `routes/dashboard.js` + service + tests | 2 | **Full** (backend, read-only) | J8 |
| 7.6 | J28 | 首页 UI by role | `app/dashboard/page.tsx` | 2 | UI | J27, J2 |
| 7.7 | J29 | Settings sections; users page merge; logs/notifications/about moves | `settings/**` | 2 | UI | J2, J6 |

### Phase 8: Clean-up and mobile
| PR | Card | Scope | Files | Effort | Process | Depends on |
|---|---|---|---|---|---|---|
| 8.1 | J30 | Delete dead pages and components (§12), unused `*_TABS`, the duplicate `BatchImportDialog` (code only; business records are archived, §4.11) | frontend only | 1 | UI | J17–J29 |
| 8.2 | J31 | Mobile pass: bottom bar, read-only detail cards, receipt with photo, confirmation on every status tap | `components/mobile/*`, pages | 3 | UI | J17–J29 |
| 8.3 | J32 | Housekeeping (§12, after Q13) | root files | 0.5 | **Full** (deletes files outside the frontend) | J30, Q13 |

**Total:** about 86 developer-days (≈ 17 weeks for one developer). Backend work is about 30 of those days and is concentrated in Phases 2, 3, 4.3, 6.1–6.2 and 7.5.

**Recommended order:**
1. J0, then in parallel: Phase 1 (J1 → J2 → J3; J4, J5, JP), J6, J8, J9, J10, J14.
2. J7 after J6; J11 → J12 → J13 and J11 → J16 after J10.
3. Phase 5, then Phase 6 (J20 needs J10, J11, J6).
4. Phase 7 as its dependencies merge, then Phase 8.
