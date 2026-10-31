import { describe, expect, it } from "vitest";
import {
  buildCreationPayload, effectivePrice, emptyLine, lineTotal, matchStore, orderTotal, parsePastedRows,
  resolvePastedRows, storeSubtotals, validateOrder, type OrderHeader, type OrderLine,
} from "./order-lines";

const header: OrderHeader = { customerId: "c1", incoterm: "FOB", paymentTerms: " 30% ", portOfLoading: "", exchangeRate: "6.72" };
const line = (patch: Partial<OrderLine> = {}): OrderLine => ({
  ...emptyLine(), productId: "p1", productName: "商品", unit: "件", storeId: "s1", quantity: "10", costCny: "10000", suggested: 1995, ...patch,
});

describe("prices and totals", () => {
  it("人工价优先于建议价；无效人工价不回退到建议价", () => {
    expect(effectivePrice(line())).toBe(1995);
    expect(effectivePrice(line({ manualPrice: "2000" }))).toBe(2000);
    expect(effectivePrice(line({ manualPrice: "abc" }))).toBeNull();
    expect(effectivePrice(line({ suggested: null }))).toBeNull();
  });
  it("行小计、合计和门店小计按两位小数求和", () => {
    expect(lineTotal(line())).toBe(19950);
    expect(lineTotal(line({ quantity: "0" }))).toBe(0);
    const lines = [line(), line({ storeId: "s2", quantity: "1", suggested: 20 }), line({ storeId: "s2", quantity: "2", suggested: 5 })];
    expect(orderTotal(lines)).toBe(19980);
    expect([...storeSubtotals(lines)]).toEqual([["s1", 19950], ["s2", 30]]);
  });
});

describe("validateOrder / buildCreationPayload", () => {
  it("按顺序给出第一个阻止提交的问题", () => {
    expect(validateOrder({ ...header, customerId: "" }, [line()])).toBe("请选择客户");
    expect(validateOrder({ ...header, exchangeRate: "0" }, [line()])).toBe("请填写有效的现汇");
    expect(validateOrder(header, [])).toBe("请至少添加一行商品");
    expect(validateOrder(header, [line({ productId: "" })])).toBe("第 1 行：请选择商品");
    expect(validateOrder(header, [line(), line({ storeId: "" })])).toBe("第 2 行：请选择门店");
    expect(validateOrder(header, [line({ quantity: "" })])).toBe("第 1 行：数量必须大于 0");
    expect(validateOrder(header, [line({ costCny: "" })])).toBe("第 1 行：请填写采购成本（¥）");
    expect(validateOrder(header, [line({ suggested: null })])).toMatch(/没有可用单价/);
    expect(validateOrder(header, [line()])).toBeNull();
  });
  it("载荷为 USD、整数建议价，人工价覆盖，空条款不发送", () => {
    const payload = buildCreationPayload(header, [line(), line({ manualPrice: "2100", storeId: "s2" })]);
    expect(payload).toMatchObject({ customerId: "c1", currency: "USD", incoterm: "FOB", paymentTerms: "30%", exchangeRate: 6.72 });
    expect(payload.portOfLoading).toBeUndefined();
    expect(payload.items.map((item) => [item.storeId, item.quantity, item.costPrice, item.sellingPrice])).toEqual([
      ["s1", 10, 10000, 1995], ["s2", 10, 10000, 2100],
    ]);
  });
});

describe("paste from Excel", () => {
  it("解析制表符行，跳过表头和空行，去掉千分位和 ¥", () => {
    expect(parsePastedRows("商品\t门店\t数量\t成本\n不锈钢门\tSAC\t1,200\t¥ 85.5\n\n瓷砖\t Fremont 店 \t30\t")).toEqual([
      { productText: "不锈钢门", storeText: "SAC", quantity: "1200", costCny: "85.5" },
      { productText: "瓷砖", storeText: "Fremont 店", quantity: "30", costCny: "" },
    ]);
  });
  it("门店按简称或名称整串匹配，不模糊猜测", () => {
    const stores = [{ id: "s1", name: "Sacramento 店", code: "SAC" }, { id: "s2", name: "Fremont 店", code: null }];
    expect(matchStore("sac", stores)?.id).toBe("s1");
    expect(matchStore("fremont 店", stores)?.id).toBe("s2");
    expect(matchStore("Sacra", stores)).toBeNull();
    expect(matchStore("", stores)).toBeNull();
  });
  it("匹配不到的商品或门店只记录问题，不产生行", async () => {
    const stores = [{ id: "s1", name: "Sacramento 店", code: "SAC" }];
    const products: Record<string, { id: string; customsName: string; unit?: string }> = { 不锈钢门: { id: "p1", customsName: "不锈钢门", unit: "件" } };
    const result = await resolvePastedRows(
      parsePastedRows("不锈钢门\tSAC\t5\t80\n未知商品\tSAC\t1\t1\n不锈钢门\t未知店\t1\t1"),
      stores,
      async (text) => products[text] ?? null,
    );
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({ productId: "p1", storeId: "s1", quantity: "5", costCny: "80", unit: "件" });
    expect(result.problems).toEqual(["第 2 行：找不到商品「未知商品」", "第 3 行：该客户下找不到门店「未知店」"]);
  });
});
