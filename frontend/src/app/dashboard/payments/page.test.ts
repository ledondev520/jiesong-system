/** 旧 /dashboard/payments 只做重定向：tab 决定落点，overdue / pastDelivery 保留，缺省为应付。 */
import { describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));

import PaymentsRedirect, { financeRedirectTarget } from "./page";

describe("financeRedirectTarget", () => {
  it("缺省和 tab=payable 去应付，tab=receivable 去应收", () => {
    expect(financeRedirectTarget()).toBe("/dashboard/finance/payable");
    expect(financeRedirectTarget({ tab: "payable" })).toBe(
      "/dashboard/finance/payable",
    );
    expect(financeRedirectTarget({ tab: "receivable" })).toBe(
      "/dashboard/finance/receivable",
    );
    expect(financeRedirectTarget({ tab: "bogus" })).toBe(
      "/dashboard/finance/payable",
    );
  });
  it("overdue 只作用于应收，pastDelivery 只作用于应付", () => {
    expect(financeRedirectTarget({ tab: "receivable", overdue: "true" })).toBe(
      "/dashboard/finance/receivable?overdue=true",
    );
    expect(
      financeRedirectTarget({ tab: "receivable", pastDelivery: "true" }),
    ).toBe("/dashboard/finance/receivable");
    expect(
      financeRedirectTarget({ tab: "payable", pastDelivery: "true" }),
    ).toBe("/dashboard/finance/payable?pastDelivery=true");
    expect(financeRedirectTarget({ tab: "payable", overdue: "true" })).toBe(
      "/dashboard/finance/payable",
    );
    expect(financeRedirectTarget({ tab: ["receivable", "payable"] })).toBe(
      "/dashboard/finance/receivable",
    );
  });
});

describe("PaymentsRedirect", () => {
  it("调用服务端 redirect", async () => {
    await PaymentsRedirect({
      searchParams: Promise.resolve({ tab: "receivable", overdue: "true" }),
    });
    expect(redirect).toHaveBeenCalledWith(
      "/dashboard/finance/receivable?overdue=true",
    );
  });
});
