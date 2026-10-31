import { describe, expect, it } from "vitest";
import { PurchaseStatus, SalesStatus, type SalesContract } from "@/types";
import {
  buildStoreFulfilment,
  getNextStep,
  pendingPurchaseItems,
  resolveOrderTab,
} from "./orderDetailModel";

const order = (overrides: Partial<SalesContract> = {}) =>
  ({
    id: "s-1",
    contractNo: "EXP1",
    status: SalesStatus.CONFIRMED,
    items: [
      {
        id: "i1",
        productId: "p1",
        storeId: "st1",
        quantity: 10,
        store: { name: "LA" },
      },
      {
        id: "i2",
        productId: "p1",
        storeId: "st2",
        quantity: 5,
        store: { name: "Irvine" },
      },
    ],
    packingItems: [{ id: "k1", productId: "p1", storeId: "st1", quantity: 4 }],
    purchaseContracts: [
      {
        id: "pc1",
        contractNo: "P1",
        status: PurchaseStatus.SIGNED,
        items: [
          {
            id: "pi1",
            productId: "p1",
            storeId: "st1",
            quantity: 10,
            receiptItems: [{ acceptedQuantity: 6 }, { acceptedQuantity: 2 }],
          },
        ],
      },
      {
        id: "pc2",
        contractNo: "P2",
        status: PurchaseStatus.CANCELLED,
        items: [{ id: "pi2", productId: "p1", storeId: "st2", quantity: 5 }],
      },
    ],
    ...overrides,
  }) as unknown as SalesContract;

describe("resolveOrderTab", () => {
  it("新键原样、旧键映射、未知回到概览", () => {
    expect(resolveOrderTab("refund")).toBe("refund");
    expect(resolveOrderTab("finance")).toBe("receipts");
    expect(resolveOrderTab("3d")).toBe("container");
    expect(resolveOrderTab("info")).toBe("lines");
    expect(resolveOrderTab("nope")).toBe("overview");
    expect(resolveOrderTab(null)).toBe("overview");
  });
});

describe("pendingPurchaseItems", () => {
  it("已在未取消采购单中的 (商品, 门店) 不再生成；取消的采购单不算", () => {
    expect(pendingPurchaseItems(order()).map((item) => item.id)).toEqual([
      "i2",
    ]);
  });
});

describe("getNextStep", () => {
  it("按状态给唯一下一步", () => {
    const can = { canGeneratePurchase: true };
    expect(
      getNextStep(order({ status: SalesStatus.DRAFT }), can),
    ).toMatchObject({
      label: "确认订单",
      status: SalesStatus.CONFIRMED,
    });
    expect(getNextStep(order(), can)).toMatchObject({ kind: "purchaseDrafts" });
    expect(getNextStep(order(), { canGeneratePurchase: false })).toMatchObject({
      kind: "importPurchase",
    });
    expect(
      getNextStep(order({ purchaseContracts: [], items: [] }), can),
    ).toMatchObject({ kind: "importPurchase" });
    expect(
      getNextStep(order({ status: SalesStatus.PACKING }), can)?.status,
    ).toBe(SalesStatus.SHIPPED);
    expect(
      getNextStep(order({ status: SalesStatus.SHIPPED }), can)?.status,
    ).toBe(SalesStatus.ARRIVED);
    expect(
      getNextStep(order({ status: SalesStatus.ARRIVED }), can)?.status,
    ).toBe(SalesStatus.COMPLETED);
    expect(
      getNextStep(order({ status: SalesStatus.COMPLETED }), can),
    ).toBeNull();
    expect(
      getNextStep(order({ status: SalesStatus.CANCELLED }), can),
    ).toBeNull();
  });
});

describe("buildStoreFulfilment", () => {
  it("按门店汇总下单/已采购/已入库/已装箱，取消采购单不计", () => {
    expect(buildStoreFulfilment(order())).toEqual([
      {
        storeId: "st2",
        storeName: "Irvine",
        ordered: 5,
        purchased: 0,
        received: 0,
        packed: 0,
      },
      {
        storeId: "st1",
        storeName: "LA",
        ordered: 10,
        purchased: 10,
        received: 8,
        packed: 4,
      },
    ]);
  });
  it("无门店的旧采购/装箱行归入「未分门店」并排最后", () => {
    const rows = buildStoreFulfilment(
      order({
        packingItems: [
          { id: "k2", productId: "p1", quantity: 3 },
        ] as SalesContract["packingItems"],
        purchaseContracts: [],
      }),
    );
    expect(rows.at(-1)).toMatchObject({
      storeId: "",
      storeName: "未分门店",
      packed: 3,
    });
  });
  it("导入自采购明细但缺 storeId 的装箱行按来源采购明细回填门店（含部分导入），真正无来源的仍未分门店", () => {
    const rows = buildStoreFulfilment(
      order({
        packingItems: [
          { id: "k1", productId: "p1", purchaseItemId: "pi1", quantity: 4 },
          { id: "k2", productId: "p1", purchaseItemId: "pi1", quantity: 2 },
          { id: "k3", productId: "p1", quantity: 3 },
        ] as SalesContract["packingItems"],
      }),
    );
    expect(rows.find((r) => r.storeId === "st1")?.packed).toBe(6);
    expect(rows.find((r) => r.storeId === "")?.packed).toBe(3);
  });
});
