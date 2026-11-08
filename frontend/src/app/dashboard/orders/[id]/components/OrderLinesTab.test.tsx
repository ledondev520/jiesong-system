import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SalesContract } from "@/types";
import { OrderLinesTab } from "./OrderLinesTab";

vi.mock("@/components/sales/ContractInfoEditor", () => ({
  ContractInfoEditor: () => null,
}));

const item = (
  id: string,
  productId: string,
  storeId: string,
  quantity: number,
  sellingPrice: number,
) => ({
  id,
  productId,
  storeId,
  quantity,
  sellingPrice,
  product: { customsName: `商品${productId}` },
  store: { name: `门店${storeId}` },
});

const contract = {
  id: "c1",
  items: [item("i1", "p1", "s1", 10, 2), item("i2", "p1", "s2", 5, 2)],
} as unknown as SalesContract;

describe("OrderLinesTab 行内改价", () => {
  it("无权限或已锁定时没有编辑入口", () => {
    render(
      <OrderLinesTab
        contract={contract}
        stores={[]}
        onSave={vi.fn()}
        canEditLines={false}
        onReprice={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "编辑明细" })).toBeNull();
  });

  it("只提交变化的明细：单价作用于该商品所有行，数量只改被编辑的格", async () => {
    const onReprice = vi.fn().mockResolvedValue(undefined);
    render(
      <OrderLinesTab
        contract={contract}
        stores={[]}
        onSave={vi.fn()}
        canEditLines
        onReprice={onReprice}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "编辑明细" }));
    const price = screen.getByLabelText("商品p1 单价");
    await userEvent.clear(price);
    await userEvent.type(price, "3.5");
    const qty = screen.getAllByLabelText(/数量$/)[0];
    await userEvent.clear(qty);
    await userEvent.type(qty, "8");
    await userEvent.click(screen.getByRole("button", { name: "保存明细" }));
    await waitFor(() => expect(onReprice).toHaveBeenCalledTimes(1));
    expect(onReprice).toHaveBeenCalledWith([
      { itemId: "i1", data: { quantity: 8, sellingPrice: 3.5 } },
      { itemId: "i2", data: { sellingPrice: 3.5 } },
    ]);
  });

  it("订单已有装箱明细、合同总额未随改价变化时给出提示；否则不提示", async () => {
    const user = userEvent.setup();
    const onReprice = vi
      .fn()
      .mockResolvedValueOnce({ totalFromPacking: true })
      .mockResolvedValueOnce({ totalFromPacking: false });
    render(
      <OrderLinesTab
        contract={contract}
        stores={[]}
        onSave={vi.fn()}
        canEditLines
        onReprice={onReprice}
      />,
    );
    const edit = async (price: string) => {
      await user.click(screen.getByRole("button", { name: "编辑明细" }));
      const input = screen.getByLabelText("商品p1 单价");
      await user.clear(input);
      await user.type(input, price);
      await user.click(screen.getByRole("button", { name: "保存明细" }));
    };
    await edit("3");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "合同总额以装箱明细为准",
    );
    await edit("4");
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });

  it("未修改时保存不发请求", async () => {
    const onReprice = vi.fn();
    render(
      <OrderLinesTab
        contract={contract}
        stores={[]}
        onSave={vi.fn()}
        canEditLines
        onReprice={onReprice}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "编辑明细" }));
    await userEvent.click(screen.getByRole("button", { name: "保存明细" }));
    expect(onReprice).not.toHaveBeenCalled();
  });
});
