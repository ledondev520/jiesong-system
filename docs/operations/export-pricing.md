# 出口报价规则与配置

只有一个公式、一个文件、一个实现：`backend/src/services/exportPricing.js` 的 `priceFor()`，配置为 `config/pricing.json`。
`exportReadinessService`（建议价）和 `exportPacketService`（单据生成）都调用它；Python 副本已退役。

```
有效汇率   = 现汇 + exchangeAdjustment            // 现汇：已有订单用该订单保存的现汇，否则 pricing.exchangeRate
加价       = 商品分类、其最近祖先分类在 categoryMarkups 中的加价，否则 defaultMarkup
原始单价   = 单位采购成本¥ × (1 + 加价) ÷ 有效汇率
单价(USD)  = roundUnitPrice(原始单价)                           // 唯一取整函数：向上取整到整美元，不再取 5 的倍数
             浮点保护：先 toFixed(6)，19.0000000001 仍按 19 处理
```

负责人 2026-11-01 00:28 SGT 终版（PRICING-LASTPRICE，取代此前所有“向上取整/取最近的 5 的倍数”决定）：先按 CNY 加价（普通 ×1.3，瓷砖 ×1.1），再按「现汇 − 0.2」换算，
**按单价向上取整到整美元，从不按行合计取整**。例：6.50→7；0.20→1；成本 ¥10000 @ 现汇 6.72：13000 ÷ 6.52 = 1993.87 → **1994**；瓷砖 11000 ÷ 6.52 = 1687.12 → 1688。

**老商品默认取上次确认价**（`backend/src/services/lastConfirmedPrice.js`）：同一商品（只看 productId，跨客户）最近一次已确认的单价预填；没有才用上面的成本公式。
“已确认”= 订单 status ≠ DRAFT 的 `SalesItem.sellingPrice`，或报价 status ∈ SENT/ACCEPTED/CONVERTED 的 `QuoteItem.unitPrice`；取更新时间最新者，同刻订单优先，价格须 > 0；
草稿保存不算（负责人先审再放行），正在编辑的单据不参与自己的预填。负责人改价后单据离开 DRAFT，即成为下次预填，无需新表。
预填价用于 `POST /pricing/preview`（返回 `source: LAST_CONFIRMED|RULE` 与 `formulaPriceUsd`）、报价保存（`formulaPrice` 仍记规则价，`isManualPrice` 仍只表示手动覆盖）、建单未给售价的明细和 `calculate-price`（带 productId）。
订单整体 30%~35% 利润率提示不变（只提示，不阻止）。
同一函数用于后端建议价/`calculate-price`/建单补价、出口单据、配置预览、转换脚本的验证以及旧建单页（前端只调用后端，不再自算）。
缺采购成本（空、0、负数）不给建议价（缺成本），由人工填写；现汇缺失或有效汇率不为正时拒绝报价。

## 配置字段（`config/pricing.schema.json`）

| 字段 | 默认 | 允许值 |
| --- | --- | --- |
| exchangeRate | 6.72 | 大于 0、不超过 100、最多 4 位小数（现汇） |
| exchangeAdjustment | -0.2 | -2 至 2；`exchangeRate + exchangeAdjustment` 必须大于 0 |
| defaultMarkup | 0.3 | 0 至 1 |
| categoryMarkups | `[]` | 至多 200 项 `{categoryId, categoryName, markup(0–1)}`，ID 不可重复；保存时核对分类存在，名称以数据库为准 |
| roundUpTo | （已弃用，可缺省） | 代码不再使用；线上旧文件仍带 5 时照常加载（存在时仍校验为 1–1000 整数），不进入配置快照。ADMIN 在设置页保存后该键随整文件替换而消失；从线上文件删除它是之后需负责人批准的步骤 |

字符串数字、布尔、null、未知字段、NaN、超范围值均拒绝。文件缺失、损坏、旧结构（tiered/multiplier）或不合法时停止计算，不使用隐藏默认。
loader 不读取 `.env`。已保存的订单/报价价格不会因配置变化被重算。

## 接口与设置页

- `GET/PUT /api/v1/system/pricing-config`：ADMIN；PUT 提交完整配置 + 最后读取的 revision，过期 409，非法 400；独占 `.lock` + 同目录临时文件原子替换，0600。
- `GET /api/v1/system/pricing-config/preview?costCny=&categoryId=&spotRate=&config=`：ADMIN，只读，调用同一 `priceFor()`；`config` 可带未保存草稿（≤4KB，仅校验）。
  用 GET 而不是 POST：lifecycle 契约不允许新增未登记的写路由。
- 设置 > 报价规则（`PricingConfigCard`）编辑以上字段并显示「成本 ¥100 → $x」预览。
- 审计：stderr 事件只含时间、操作者 ID、改动的字段名、前后 SHA-256，不含值。

## 订单整体利润率提示（负责人 2026-10-31 14:36 SGT）

- 口径沿用代码里已有的 `realizedMarkup`（实际加价，与 profitRate 1.3 = 30% 同义）：
  `利润率 = Σ(售价USD × 数量) × (现汇 + 调整) ÷ Σ(成本¥ × 数量) − 1`，现汇取订单填写的现汇。
  没有用 (售价 − 成本) ÷ 售价：按该式标准 ×1.3 订单只有 23%，区间会对每张单报警。
- 区间 30%~35% 只在 `exportPricing.js` 的 `ORDER_MARGIN_BAND` 一处；低于 30% 或高于 35% 提示「订单整体利润率 X% 不在 30%~35% 范围内」，恰好 30%、35% 不提示。
- 只提示，不阻止保存/提交。命中 `categoryMarkups` 的分类加价行（瓷砖 ×1.1）不参与区间检查；只有瓷砖行、或售价/成本合计为 0 时不提示。
- 接口：`POST /api/v1/sales/calculate-price` 带 `{ exchangeRate, items: [{ productId, quantity, costPrice, sellingPrice }] }` 返回
  `{ margin, marginPct, band, effectiveRate, excludedLines, warning }`（复用已登记路由，不新增写路由）；旧建单页实时显示该利润率与提示。

## 汇率同步安全区间

`POST /system/exchange-rate/sync` 不设确认步骤（负责人决定），但同步值不在 [5, 10] 或与当前现汇偏差超过 5% 时返回 409、不写入，
需在 设置 > 报价规则 手动设置；上游响应体上限 64KB；写入阶段的错误如实返回，不当作“降级成功”。

## 历史/人工价格检查

历史报价和人工单价仍按本票成本复算，与分类目标加价偏差超过 5 个百分点则不沿用/阻断（`MARKUP_OUTSIDE_POLICY`）。
规范 §7.4 建议去掉历史价闸门并以订单行价格为准，需要负责人确认（Q5e），本次未改。

## 线上 `pricing.json` 迁移（需负责人批准后由运维执行，不随合并自动发生）

部署会保留服务器上的运行时 `config/pricing.json`；**新代码读不了旧结构，旧代码也读不了新结构**。因此转换和部署之间有一个窗口：
转换完成后、新版本启动前，仍在运行的旧后端报价校验会失败（报价接口 503）；反过来迁移前部署新版本同样 503。
请在业务低峰的一分钟内把「转换 → 部署」连着做完，不要隔夜。

转换脚本不再生成或接受 `--round-up-to`（`roundUpTo` 已弃用）。

```bash
# 1. dry-run，只打印结果、不写文件（--spot-rate 填当前现汇）
node backend/scripts/convert-pricing-config.js --file config/pricing.json --spot-rate <现汇>
# 2. 确认后转换：先把原文件备份到 0700 目录（0600 文件），再原子替换并用后端校验器核对
node backend/scripts/convert-pricing-config.js --file config/pricing.json --spot-rate <现汇> --confirm --backup-dir <私有备份目录>
# 3. 立刻部署新版本；登录后在 设置 > 报价规则 添加「瓷砖 10%」等分类加价
# 4. 验证（ADMIN 登录后）：现汇 6.72 时成本 ¥10000 必须得到 1994
#    GET /api/v1/system/pricing-config/preview?costCny=10000   →  unitPriceUsd: 1994
#    （13000 ÷ 6.52 = 1993.865 → 向上取整 1994；若得到 1995 说明仍在跑旧的取 5 规则，立即回滚）
#    再抽查 costCny=12700（12700×1.3÷6.52=2532.2 → 2533）与小单价 costCny=10（13÷6.52=1.99 → 2）
```

回滚：把备份文件复制回 `config/pricing.json` **并且部署回旧版本**；只重启不够，因为旧代码读不了新结构的文件（反之亦然）。

旧 `tiered` 的 `refundableMarkup` → `defaultMarkup`（`multiplier` 模式取 `multiplier - 1`）；`noRefundMarkup`（零退税 10% 档）不再存在，改为按分类设置。
