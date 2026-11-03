import { describe, expect, it } from "vitest";
import type { Supplier } from "@/types";
import { missingSupplierFields } from "./supplierCompleteness";

const base = { id: "s", name: "合成供应商" } as Supplier;

describe("missingSupplierFields", () => {
  it("lists every contract/payment field that is empty, null or blank", () => {
    expect(missingSupplierFields(base)).toEqual([
      "联系人",
      "联系电话",
      "公司地址",
      "纳税人识别号",
      "收款户名",
      "开户银行",
      "银行账号",
    ]);
    expect(
      missingSupplierFields({
        ...base,
        contactName: "  ",
        contactPhone: "1",
        address: "a",
        taxId: null as unknown as string,
        bankAccountName: "n",
        bankName: "b",
        bankAccount: "9",
      }),
    ).toEqual(["联系人", "纳税人识别号"]);
  });

  it("returns an empty list for a complete record", () => {
    expect(
      missingSupplierFields({
        ...base,
        contactName: "x",
        contactPhone: "1",
        address: "a",
        taxId: "t",
        bankAccountName: "n",
        bankName: "b",
        bankAccount: "9",
      }),
    ).toEqual([]);
  });
});
