import { describe, expect, it } from "vitest";
import {
  isResidual,
  matchRate,
  negativeInvoiceCount,
  txnKind,
} from "./finance-ledger";

describe("isResidual", () => {
  it("只标 0 < 待结 <= 1 的残额", () => {
    expect(isResidual(0)).toBe(false);
    expect(isResidual(0.4)).toBe(true);
    expect(isResidual(1)).toBe(true);
    expect(isResidual(1.01)).toBe(false);
  });
});

describe("matchRate", () => {
  it("低于 50% 告警，恰好 50% 不告警", () => {
    expect(matchRate({ matchedCount: 4, unmatchedPaymentCount: 6 })).toMatchObject({
      total: 10,
      rate: 0.4,
      low: true,
    });
    expect(matchRate({ matchedCount: 5, unmatchedPaymentCount: 5 }).low).toBe(false);
  });
  it("没有付款对方时不告警", () => {
    expect(matchRate({ matchedCount: 0, unmatchedPaymentCount: 0 }).low).toBe(false);
  });
});

describe("negativeInvoiceCount", () => {
  it("总数 - 有效 - 已红冲，不为负", () => {
    expect(negativeInvoiceCount({ totalCount: 300, validCount: 200, reversedCount: 19 })).toBe(81);
    expect(negativeInvoiceCount({ totalCount: 1, validCount: 1, reversedCount: 1 })).toBe(0);
  });
});

describe("txnKind", () => {
  it("识别结汇与内部划转，其余为 null", () => {
    expect(txnKind({ txnType: "对公结汇" })).toBe("结汇");
    expect(txnKind({ summary: "账户间划转" })).toBe("内部划转");
    expect(txnKind({ txnType: "转账", summary: "货款" })).toBeNull();
  });
});
