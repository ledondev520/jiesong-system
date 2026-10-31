import { describe, expect, it } from "vitest";
import {
  primaryActionFor,
  secondaryTransitionsFor,
  toItemsPayload,
  validateLines,
  parseSpotRate,
  isQuoteStatus,
  QUOTE_STATUSES,
} from "./quote";
import type { OrderLine } from "./order-lines";

const line = (extra: Partial<OrderLine> = {}): OrderLine => ({
  key: "k",
  productId: "p1",
  productName: "P",
  unit: "",
  storeId: "s1",
  quantity: "10",
  costCny: "10000",
  suggested: 1995,
  manualPrice: "",
  ...extra,
});

describe("quote helpers", () => {
  it("one primary action per status, matching the spec table", () => {
    expect(primaryActionFor("DRAFT")).toEqual({
      kind: "transition",
      to: "SENT",
      label: "标记已发送",
    });
    expect(primaryActionFor("SENT")).toEqual({
      kind: "transition",
      to: "ACCEPTED",
      label: "客户已接受",
    });
    expect(primaryActionFor("ACCEPTED")).toEqual({
      kind: "transition",
      to: "CONVERTED",
      label: "转为出口订单",
    });
    expect(primaryActionFor("CONVERTED")).toEqual({
      kind: "viewOrder",
      label: "查看订单",
    });
    expect(primaryActionFor("REJECTED")).toBeNull();
    expect(primaryActionFor("CANCELLED")).toBeNull();
  });

  it("secondary transitions never offer what the backend state machine refuses", () => {
    const allowed: Record<string, string[]> = {
      DRAFT: ["SENT", "CANCELLED"],
      SENT: ["DRAFT", "ACCEPTED", "REJECTED", "CANCELLED"],
      ACCEPTED: ["CONVERTED", "CANCELLED"],
      REJECTED: [],
      CONVERTED: [],
      CANCELLED: [],
    };
    for (const status of QUOTE_STATUSES) {
      const offered = [
        primaryActionFor(status),
        ...secondaryTransitionsFor(status).map((t) => ({
          kind: "transition",
          to: t.to,
        })),
      ].flatMap((a) => (a && a.kind === "transition" ? [a.to] : []));
      for (const to of offered) expect(allowed[status]).toContain(to);
    }
  });

  it("payload never carries formulaPrice; a manual price sets isManualPrice, blank cost is null", () => {
    const [auto, manual, noCost] = toItemsPayload([
      line(),
      line({ manualPrice: "2500.5" }),
      line({ costCny: "" }),
    ]);
    expect(auto).toEqual({
      productId: "p1",
      storeId: "s1",
      quantity: 10,
      unit: undefined,
      costCny: 10000,
    });
    expect(manual).toMatchObject({ isManualPrice: true, unitPrice: 2500.5 });
    expect(noCost.costCny).toBeNull();
    expect(JSON.stringify([auto, manual, noCost])).not.toContain(
      "formulaPrice",
    );
  });

  it("validates rows with 1-based Chinese messages", () => {
    expect(validateLines([line()])).toBeNull();
    expect(validateLines([])).toBe("请至少添加一行商品");
    expect(validateLines([line(), line({ productId: "" })])).toBe(
      "第 2 行：请选择商品",
    );
    expect(validateLines([line({ quantity: "0" })])).toBe(
      "第 1 行：数量必须大于 0",
    );
    expect(validateLines([line({ quantity: "abc" })])).toBe(
      "第 1 行：数量必须大于 0",
    );
    expect(validateLines([line({ costCny: "-1" })])).toBe(
      "第 1 行：成本必须大于 0",
    );
    expect(validateLines([line({ costCny: "" })])).toBeNull(); // 缺成本草稿允许
    expect(validateLines([line({ manualPrice: "-5" })])).toBe(
      "第 1 行：手动单价无效",
    );
    expect(validateLines([line({ manualPrice: "0" })])).toBeNull(); // 0 allowed in DRAFT, backend gates SENT
  });

  it("spot rate text", () => {
    expect(parseSpotRate("")).toBeNull();
    expect(parseSpotRate("6.72")).toBe(6.72);
    expect(parseSpotRate("0")).toBe("invalid");
    expect(parseSpotRate("x")).toBe("invalid");
  });

  it("status guard", () => {
    expect(isQuoteStatus("SENT")).toBe(true);
    expect(isQuoteStatus("BOGUS")).toBe(false);
  });
});

import { linesFromItems } from "./quote";
describe("linesFromItems", () => {
  it("restores manual prices only for manual lines", () => {
    const base = {
      productId: "p",
      storeId: "s",
      quantity: 2,
      unit: "PCS",
      costCny: 100,
      formulaPrice: 20,
      product: { customsName: "合成商品" },
    };
    const [auto, manual, noStore] = linesFromItems([
      { ...base, isManualPrice: false, unitPrice: 20 },
      { ...base, isManualPrice: true, unitPrice: 25.5 },
      {
        ...base,
        storeId: null,
        costCny: null,
        isManualPrice: false,
        unitPrice: 0,
        formulaPrice: null,
      },
    ]);
    expect(auto).toMatchObject({
      manualPrice: "",
      costCny: "100",
      quantity: "2",
      storeId: "s",
      suggested: 20,
      productName: "合成商品",
    });
    expect(manual.manualPrice).toBe("25.5");
    expect(noStore).toMatchObject({
      storeId: "",
      costCny: "",
      suggested: null,
    });
  });
});
