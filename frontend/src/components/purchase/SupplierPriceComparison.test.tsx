/**
 * Input: 合成 bySupplier 汇总
 * Output: 比价表最低价高亮、税率说明、选用回调与弹层入口回归
 * Pos: 供应商比价组件测试
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  SupplierPriceComparePopover,
  SupplierPriceComparison,
} from "./SupplierPriceComparison";
import type { SupplierPriceSummary } from "@/services/priceComparison";

const row = (
  id: string,
  lastPrice: number,
  extra: Partial<SupplierPriceSummary> = {},
): SupplierPriceSummary => ({
  supplierId: id,
  supplierName: `供应商${id}`,
  hasQualityIssue: false,
  lastPrice,
  lastDate: "2026-09-01T00:00:00.000Z",
  lastContractNo: `CG-${id}`,
  lastTaxRate: 13,
  minPrice: lastPrice - 1,
  averagePrice: lastPrice,
  count: 3,
  ...extra,
});

describe("SupplierPriceComparison", () => {
  it("只在最近价最低的供应商上标注「最低」，并提示质量问题与税率说明", () => {
    render(
      <SupplierPriceComparison
        rows={[
          row("甲", 12),
          row("乙", 9, { lastTaxRate: 1, hasQualityIssue: true }),
        ]}
      />,
    );
    expect(screen.getAllByText("最低")).toHaveLength(1);
    expect(screen.getByText("质量问题")).toBeInTheDocument();
    expect(screen.getByText("1%")).toBeInTheDocument();
    expect(screen.getByText(/13% 增值税发票才能办理出口退税/)).toBeVisible();
    expect(screen.queryByText("用此供应商")).not.toBeInTheDocument();
  });

  it("提供 onPick 时显示按钮并回传该行", async () => {
    const onPick = vi.fn();
    render(
      <SupplierPriceComparison
        rows={[row("甲", 12), row("乙", 9)]}
        onPick={onPick}
      />,
    );
    await userEvent.click(screen.getAllByText("用此供应商")[1]);
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ supplierId: "乙" }),
    );
  });

  it("无记录时提示草稿与已取消不计入", () => {
    render(<SupplierPriceComparison rows={[]} />);
    expect(screen.getByText(/草稿与已取消合同不计入/)).toBeInTheDocument();
  });
});

describe("SupplierPriceComparePopover", () => {
  it("无记录不渲染；有记录时入口显示最低价供应商，点开可见比价表", async () => {
    const { container, rerender } = render(
      <SupplierPriceComparePopover rows={[]} />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(
      <SupplierPriceComparePopover rows={[row("甲", 12), row("乙", 9)]} />,
    );
    const trigger = screen.getByRole("button", { name: /比价/ });
    expect(trigger).toHaveTextContent("供应商乙");
    await userEvent.click(trigger);
    expect(await screen.findByText("供应商甲")).toBeVisible();
  });
});
