/**
 * Input: PurchaseDetailDialog、WAREHOUSE 角色、不含金额的合同详情
 * Output: 金额显示「无权查看」而非 ¥ 数字或 ¥0 的回归测试
 * Pos: 采购列表详情弹窗测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PurchaseDetailDialog } from "./PurchaseDetailDialog";
import type { PurchaseContractDetail } from "./purchaseListHelpers";

let mockRole = "WAREHOUSE";

vi.mock("@/store/auth.store", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { role: mockRole } }),
}));

// 服务端对 WAREHOUSE 去掉所有金额字段
const strippedDetail = {
  id: "p-wh",
  contractNo: "CG-WH",
  status: "SIGNED",
  supplier: { name: "供应商甲" },
  items: [
    {
      id: "i1",
      quantity: 3,
      unit: "箱",
      product: { customsName: "瓷砖" },
    },
  ],
} as unknown as PurchaseContractDetail;

describe("PurchaseDetailDialog 金额遮蔽", () => {
  it("WAREHOUSE 的合同金额、已付款、单价、小计都显示无权查看，没有 ¥", () => {
    mockRole = "WAREHOUSE";
    render(
      <PurchaseDetailDialog
        open
        loading={false}
        detail={strippedDetail}
        onClose={() => {}}
      />,
    );

    expect(screen.getAllByText("无权查看")).toHaveLength(4);
    // 弹窗渲染在 portal 中，检查整个 body
    expect(document.body.textContent).not.toContain("¥0");
    expect(document.body.textContent).not.toMatch(/¥\d/);
  });

  it("非 WAREHOUSE 角色照常显示金额", () => {
    mockRole = "ADMIN";
    render(
      <PurchaseDetailDialog
        open
        loading={false}
        detail={
          { ...strippedDetail, totalAmount: 1000 } as PurchaseContractDetail
        }
        onClose={() => {}}
      />,
    );

    expect(screen.queryByText("无权查看")).not.toBeInTheDocument();
    expect(screen.getByText("¥1,000")).toBeInTheDocument();
  });
});
