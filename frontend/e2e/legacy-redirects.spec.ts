/**
 * Input: next.config.ts redirects() 中的旧地址表
 * Output: 每个旧地址返回 308，Location 指向新地址并保留原查询串
 * Pos: 旧路由兼容桩合并进配置后的回归（A113）；只发 HTTP 请求，不需要浏览器、登录或后端
 */
import { expect, test } from "@playwright/test";

// [旧地址, 新路径, 新地址必须带上的查询参数（除原查询串外）]
const cases: Array<[string, string, Record<string, string>?]> = [
  ["/dashboard/users", "/dashboard/settings/users"],
  ["/dashboard/system", "/dashboard/settings"],
  ["/dashboard/system/logs", "/dashboard/settings/logs"],
  ["/dashboard/system/notifications", "/dashboard/notifications"],
  ["/dashboard/about", "/dashboard/settings/ai-usage"],
  ["/dashboard/ai/sessions", "/dashboard/settings/ai-usage"],
  ["/dashboard/sales/create", "/dashboard/orders/new"],
  ["/dashboard/ai", "/dashboard", { ai: "1" }],
  ["/dashboard/sales", "/dashboard/orders"],
  ["/dashboard/sales?keyword=EXP26&status=SHIPPED", "/dashboard/orders", { q: "EXP26", status: "SHIPPED" }],
  ["/dashboard/sales/s-1?tab=finance", "/dashboard/orders/s-1", { tab: "finance" }],
  ["/dashboard/logistics/containers", "/dashboard/orders"],
  ["/dashboard/logistics", "/dashboard/inventory"],
  ["/dashboard/inventory-status?lowStock=true", "/dashboard/inventory", { lowStock: "true" }],
  ["/dashboard/contracts", "/dashboard/purchases"],
  ["/dashboard/contracts/template", "/dashboard/purchases"],
  ["/dashboard/contracts/templates", "/dashboard/purchases"],
  ["/dashboard/purchase", "/dashboard/purchases"],
  ["/dashboard/purchase/create", "/dashboard/purchases/new"],
  ["/dashboard/purchase/create?editId=p-1", "/dashboard/purchases/new", { editId: "p-1" }],
  ["/dashboard/purchase/p-1", "/dashboard/purchases/p-1"],
  ["/dashboard/payments", "/dashboard/finance/payable"],
  ["/dashboard/payments?tab=payable", "/dashboard/finance/payable"],
  ["/dashboard/payments?tab=payable&pastDelivery=true", "/dashboard/finance/payable", { pastDelivery: "true" }],
  ["/dashboard/payments?tab=receivable", "/dashboard/finance/receivable"],
  ["/dashboard/payments?tab=receivable&overdue=true", "/dashboard/finance/receivable", { overdue: "true" }],
  ["/dashboard/reports?startDate=2026-01-01", "/dashboard/finance/analysis", { startDate: "2026-01-01" }],
  ["/dashboard/customs-declarations", "/dashboard/customs", { view: "customs" }],
  ["/dashboard/customs-declarations/create", "/dashboard/customs/new"],
  ["/dashboard/customs-declarations/cd-1/edit", "/dashboard/customs/cd-1/edit"],
  ["/dashboard/customs-declarations/cd-1?tab=docs", "/dashboard/customs/cd-1", { tab: "docs" }],
  ["/dashboard/tax-refunds?view=refunds", "/dashboard/customs", { view: "refunds" }],
  ["/customs-declarations", "/dashboard/customs", { view: "customs" }],
  ["/customs-declarations/create", "/dashboard/customs/new"],
  ["/customs-declarations/cd-1/edit", "/dashboard/customs/cd-1/edit"],
  ["/customs-declarations/cd-1?tab=docs", "/dashboard/customs/cd-1", { tab: "docs" }],
  ["/tax-refunds?view=refunds", "/dashboard/customs", { view: "refunds" }],
  ["/forex-verifications", "/"],
];

test.describe("旧地址 308 重定向（next.config.ts redirects）", () => {
  for (const [oldUrl, newPath, extra = {}] of cases) {
    test(oldUrl, async ({ request, baseURL }) => {
      const response = await request.get(oldUrl, { maxRedirects: 0 });
      expect(response.status()).toBe(308);
      const location = new URL(response.headers().location, baseURL);
      expect(location.pathname).toBe(newPath);
      const expected = new Map(Object.entries(extra));
      // 原查询串里的参数也必须保留（目标自带的同名参数优先）
      for (const [key, value] of new URL(oldUrl, baseURL).searchParams) {
        if (!expected.has(key)) expected.set(key, value);
      }
      for (const [key, value] of expected) {
        expect(location.searchParams.get(key), `${oldUrl} → ${key}`).toBe(value);
      }
    });
  }
});
