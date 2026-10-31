import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Role } from "@/types";
import {
  getDefaultDashboardHref,
  getMenuNavItems,
  getModuleByPath,
  getPrimaryMobileModuleNavItems,
  getSecondaryMobileModuleNavItems,
  getVisibleModuleNavItems,
  isTabRouteActive,
  MODULE_NAV_ITEMS,
} from "./navigation.config";

const keys = (items: { key: string }[]) => items.map((item) => item.key);
const ALL_ROLES = Object.values(Role);

describe("navigation.config helpers", () => {
  it("每个角色都有菜单；只有 ADMIN 看到设置，BOSS 看不到 AI", () => {
    for (const role of ALL_ROLES) {
      expect(getMenuNavItems(role).length).toBeGreaterThan(0);
      expect(keys(getMenuNavItems(role)).includes("admin")).toBe(
        role === Role.ADMIN,
      );
      expect(keys(getVisibleModuleNavItems(role)).includes("ai")).toBe(
        role !== Role.BOSS,
      );
    }
  });

  it("菜单顺序：首页 / 业务（报价在订单之前） / 资料（含客户与门店） / 设置", () => {
    expect(getMenuNavItems(Role.ADMIN).map((item) => item.label)).toEqual([
      "首页",
      "报价",
      "出口订单",
      "采购",
      "库存",
      "单证与退税",
      "财务",
      "客户与门店",
      "供应商",
      "商品",
      "HS 编码",
      "设置",
    ]);
    expect(getMenuNavItems(Role.ADMIN).map((item) => item.group)).toEqual([
      "main",
      "business",
      "business",
      "business",
      "business",
      "business",
      "business",
      "data",
      "data",
      "data",
      "data",
      "system",
    ]);
    expect(keys(getVisibleModuleNavItems(Role.ADMIN))).toEqual(
      expect.arrayContaining(["quotes", "customers"]),
    );
  });

  it("PURCHASE 保留商品入口，商品路径归属 products，设置仅管理员", () => {
    expect(getModuleByPath("/dashboard/products")?.key).toBe("products");
    expect(keys(getMenuNavItems(Role.PURCHASE))).toContain("products");
    expect(keys(getMenuNavItems(Role.PURCHASE))).not.toContain("admin");
  });

  it("菜单指向现有 URL，不改动任何路由", () => {
    const hrefs = Object.fromEntries(
      MODULE_NAV_ITEMS.map((item) => [item.key, item.defaultHref]),
    );
    expect(hrefs).toMatchObject({
      home: "/dashboard",
      orders: "/dashboard/orders",
      purchases: "/dashboard/contracts",
      inventory: "/dashboard/inventory-status",
      documents: "/dashboard/customs-declarations",
      finance: "/dashboard/finance",
      suppliers: "/dashboard/suppliers",
      products: "/dashboard/products",
      "hs-codes": "/dashboard/hs-codes",
      admin: "/dashboard/settings",
    });
  });

  it("原有各模块页面仍归属某个菜单项（无路由被移出导航归属）", () => {
    const owner: Record<string, string> = {
      "/dashboard": "home",
      "/dashboard/reports": "finance",
      "/dashboard/finance/analysis": "finance",
      "/dashboard/contracts": "purchases",
      "/dashboard/purchase/create": "purchases",
      "/dashboard/suppliers": "suppliers",
      "/dashboard/inventory-status": "inventory",
      "/dashboard/logistics": "inventory",
      "/dashboard/products": "products",
      "/dashboard/sales/create": "orders",
      "/dashboard/tax-refunds/abc": "documents",
      "/dashboard/customs-declarations/create": "documents",
      "/dashboard/hs-codes": "hs-codes",
      "/dashboard/finance/statements": "finance",
      "/dashboard/payments": "finance",
      "/dashboard/settings/ai-usage": "admin",
      "/dashboard/settings/users": "admin",
      "/dashboard/settings/logs": "admin",
      "/dashboard/settings/ai-access": "admin",
    };
    for (const [path, key] of Object.entries(owner))
      expect(getModuleByPath(path)?.key, path).toBe(key);
  });

  it("子页面入口覆盖原模块 Tab（财务、单证与退税、设置）", () => {
    const labels = (key: string) =>
      MODULE_NAV_ITEMS.find((item) => item.key === key)?.children.map(
        (c) => c.label,
      );
    expect(labels("finance")).toEqual([
      "财务概览",
      "应收",
      "应付",
      "银行流水",
      "发票",
      "对账",
      "财务报表",
      "经营分析",
    ]);
    expect(labels("documents")).toEqual(["报关单", "出口退税"]);
    expect(labels("admin")).toEqual(["系统配置", "账号管理", "系统日志"]);
  });

  it("移动端底栏：首页·订单·采购·库存，其余进入更多（隐藏项不出现；报价进入更多）", () => {
    expect(
      getPrimaryMobileModuleNavItems(Role.ADMIN).map(
        (item) => item.mobileLabel ?? item.label,
      ),
    ).toEqual(["首页", "订单", "采购", "库存"]);
    expect(keys(getSecondaryMobileModuleNavItems(Role.ADMIN))).toEqual([
      "quotes",
      "documents",
      "finance",
      "customers",
      "suppliers",
      "products",
      "hs-codes",
      "admin",
    ]);
    expect(keys(getSecondaryMobileModuleNavItems(Role.SALES))).not.toContain(
      "admin",
    );
  });

  it("生产前端不再携带项目驾驶舱路由和 ModuleTabHeader", () => {
    expect(existsSync("src/app/dashboard/dev/page.tsx")).toBe(false);
    expect(existsSync("src/app/api/dev/status/route.ts")).toBe(false);
    expect(existsSync("src/lib/dev-cockpit.ts")).toBe(false);
    expect(existsSync("src/components/layout/ModuleTabHeader.tsx")).toBe(false);
  });

  it("返回当前角色的默认 dashboard 落点", () => {
    expect(getDefaultDashboardHref(Role.SALES)).toBe("/dashboard");
  });

  it("finance 子页面激活与 statements 不串扰", () => {
    expect(isTabRouteActive("/dashboard/finance", "/dashboard/finance")).toBe(
      true,
    );
    expect(
      isTabRouteActive("/dashboard/finance/statements", "/dashboard/finance"),
    ).toBe(false);
    expect(
      isTabRouteActive(
        "/dashboard/finance/statements",
        "/dashboard/finance/statements",
      ),
    ).toBe(true);
    // 财务页签各自精确激活：应收/应付/银行流水/发票/对账互不串扰
    for (const tab of [
      "/dashboard/finance/receivable",
      "/dashboard/finance/payable",
      "/dashboard/finance/bank-flow",
      "/dashboard/finance/invoices",
      "/dashboard/finance/reconciliation",
    ]) {
      expect(isTabRouteActive(tab, tab)).toBe(true);
      expect(isTabRouteActive(`${tab}/x`, tab)).toBe(true);
      expect(isTabRouteActive(tab, "/dashboard/finance")).toBe(false);
      expect(isTabRouteActive(tab, "/dashboard/finance/statements")).toBe(
        false,
      );
    }
    expect(
      isTabRouteActive(
        "/dashboard/finance/payable",
        "/dashboard/finance/receivable",
      ),
    ).toBe(false);
  });

  it("报关单与出口退税互不串扰", () => {
    expect(
      isTabRouteActive(
        "/dashboard/customs-declarations/create",
        "/dashboard/customs-declarations",
      ),
    ).toBe(true);
    expect(
      isTabRouteActive(
        "/dashboard/customs-declarations",
        "/dashboard/tax-refunds",
      ),
    ).toBe(false);
    expect(
      isTabRouteActive(
        "/dashboard/tax-refunds/abc/edit",
        "/dashboard/tax-refunds",
      ),
    ).toBe(true);
  });
});
