import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { PurchaseReceiptPanel } from "./PurchaseReceiptPanel";
import type { PurchaseReceiptList } from "@/services/purchaseReceipt.service";

const list = vi.fn();
const create = vi.fn();
const inspect = vi.fn();
const inspections = vi.fn();
const uploadPhoto = vi.fn();
let role = "PURCHASE";
vi.mock("@/services/purchaseReceipt.service", () => ({
  purchaseReceiptService: {
    list: (...args: unknown[]) => list(...args),
    create: (...args: unknown[]) => create(...args),
    inspect: (...args: unknown[]) => inspect(...args),
    inspections: (...args: unknown[]) => inspections(...args),
  },
}));
vi.mock("@/services/contractFile.service", () => ({
  uploadContractFile: (...args: unknown[]) => uploadPhoto(...args),
}));
vi.mock("@/store/auth.store", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { role } }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const data: PurchaseReceiptList = {
  status: "SHIPPED",
  items: [
    {
      id: "receipt-1",
      arrivedAt: "2026-01-02T00:00:00Z",
      createdAt: "2026-01-02T00:00:00Z",
      createdBy: { id: "actor", displayName: "测试采购员" },
      items: [
        {
          id: "ri-1",
          purchaseItemId: "pi-1",
          productName: "测试商品",
          unit: "件",
          arrivedQuantity: 10,
          acceptedQuantity: 3,
          pendingQuantity: 4,
          reinspectionQuantity: 3,
          inspections: [
            {
              id: "inspection-1",
              acceptedQuantity: 3,
              pendingQuantity: 4,
              reinspectionQuantity: 3,
              note: "测试批次待复验",
              inspectedAt: "2026-01-02T01:00:00Z",
              inspectedBy: { id: "inspector", displayName: "测试验货员" },
            },
          ],
        },
      ],
    },
  ],
  pagination: { page: 1, pageSize: 20, total: 21, totalPages: 2 },
  summary: {
    legacy: false,
    complete: false,
    canReceive: true,
    totals: {
      orderedQuantity: 20,
      arrivedQuantity: 10,
      acceptedQuantity: 3,
      pendingQuantity: 4,
      reinspectionQuantity: 3,
    },
    items: [
      {
        purchaseItemId: "pi-1",
        productId: "product-1",
        productName: "测试商品",
        unit: "件",
        orderedQuantity: 20,
        arrivedQuantity: 10,
        acceptedQuantity: 3,
        pendingQuantity: 4,
        reinspectionQuantity: 3,
        remainingQuantity: 10,
      },
    ],
  },
};
beforeEach(() => {
  role = "PURCHASE";
  list.mockReset();
  create.mockReset();
  uploadPhoto.mockReset();
  inspect.mockReset();
  inspections.mockReset();
  inspections.mockResolvedValue({
    data: { items: [], pagination: { total: 0 } },
  });
  list.mockResolvedValue({ data });
  create.mockResolvedValue({
    data: {
      receipt: data.items[0],
      summary: data.summary,
      status: "RECEIVED",
      idempotentReplay: false,
    },
  });
  inspect.mockResolvedValue({
    data: {
      receipt: data.items[0],
      summary: data.summary,
      status: "RECEIVED",
      idempotentReplay: false,
    },
  });
});
it("显示剩余量、待验待复验、批次时间与操作者，并可真实翻页", async () => {
  render(<PurchaseReceiptPanel purchaseContractId="purchase-1" />);
  await screen.findByText("测试采购员");
  expect(screen.getByText("测试验货员")).toBeInTheDocument();
  expect(screen.getByText("测试批次待复验")).toBeInTheDocument();
  expect(screen.getByText("全数到齐且合格后才能完成采购")).toBeInTheDocument();
  fireEvent.click(screen.getByText("下一页"));
  await waitFor(() =>
    expect(list).toHaveBeenLastCalledWith("purchase-1", {
      page: 2,
      pageSize: 20,
    }),
  );
});
it("新到货只登记到货量，不自动验收，失败重试复用幂等键", async () => {
  create.mockRejectedValueOnce(new Error("offline"));
  render(<PurchaseReceiptPanel purchaseContractId="purchase-1" />);
  fireEvent.click(await screen.findByText("登记分批到货"));
  fireEvent.change(screen.getByLabelText("测试商品 本批到货量"), {
    target: { value: "4" },
  });
  fireEvent.change(screen.getByLabelText("到货日期"), {
    target: { value: "2020-01-02" },
  });
  fireEvent.click(screen.getByText("保存到货"));
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  expect(create.mock.calls[0][1].items).toEqual([
    { purchaseItemId: "pi-1", arrivedQuantity: 4 },
  ]);
  expect(create.mock.calls[0][1].arrivedAt).toBe("2020-01-01T16:00:00.000Z");
  expect(create.mock.calls[0][1].items[0]).not.toHaveProperty(
    "acceptedQuantity",
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "保存到货" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByText("保存到货"));
  await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
  expect(create.mock.calls[1][1].requestId).toBe(
    create.mock.calls[0][1].requestId,
  );
});
const openArrival = async () => {
  render(<PurchaseReceiptPanel purchaseContractId="purchase-1" />);
  fireEvent.click(await screen.findByText("登记分批到货"));
  fireEvent.change(screen.getByLabelText("测试商品 本批到货量"), {
    target: { value: "4" },
  });
  fireEvent.change(screen.getByLabelText("到货日期"), {
    target: { value: "2020-01-02" },
  });
};
const photo = (name: string, type = "image/jpeg") =>
  new File(["x"], name, { type });
it("到货照片：手机可直接拍照（capture），到货保存成功后才上传为 RECEIPT_PHOTO 附件", async () => {
  uploadPhoto.mockResolvedValue({});
  await openArrival();
  const input = screen.getByLabelText(/到货照片/);
  expect(input).toHaveAttribute("capture", "environment");
  expect(input).toHaveAttribute("accept", "image/jpeg,image/png");
  fireEvent.change(input, {
    target: { files: [photo("a.jpg"), photo("b.png", "image/png")] },
  });
  expect(screen.getByText("a.jpg")).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("移除照片 b.png"));
  expect(screen.queryByText("b.png")).not.toBeInTheDocument();
  expect(uploadPhoto).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("保存到货"));
  await waitFor(() => expect(uploadPhoto).toHaveBeenCalledTimes(1));
  expect(uploadPhoto).toHaveBeenCalledWith(
    "purchase-1",
    "PURCHASE",
    expect.objectContaining({ name: "a.jpg" }),
    "到货照片 2020-01-02",
    "RECEIPT_PHOTO",
  );
  expect(create.mock.invocationCallOrder[0]).toBeLessThan(
    uploadPhoto.mock.invocationCallOrder[0],
  );
});
it("到货照片：单张超过 10MB 在选择时即拒绝，不加入列表", async () => {
  await openArrival();
  const big = photo("big.jpg");
  Object.defineProperty(big, "size", { value: 10 * 1024 * 1024 + 1 });
  fireEvent.change(screen.getByLabelText(/到货照片/), {
    target: { files: [big] },
  });
  expect(screen.getByText("单张照片不超过 10MB")).toBeInTheDocument();
  expect(screen.queryByText("big.jpg")).not.toBeInTheDocument();
});
it("到货保存失败时不上传照片；照片上传失败不回滚到货，只提示补传", async () => {
  create.mockRejectedValueOnce(new Error("offline"));
  uploadPhoto.mockRejectedValue(new Error("上传失败"));
  await openArrival();
  fireEvent.change(screen.getByLabelText(/到货照片/), {
    target: { files: [photo("a.jpg")] },
  });
  fireEvent.click(screen.getByText("保存到货"));
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "保存到货" })).toBeEnabled(),
  );
  expect(uploadPhoto).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("保存到货"));
  await waitFor(() => expect(uploadPhoto).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("1 张照片上传失败"),
    ),
  );
  expect(create).toHaveBeenCalledTimes(2);
  expect(screen.queryByLabelText("到货日期")).not.toBeInTheDocument();
});
it("到货照片只接受 JPG/PNG，且最多 6 张", async () => {
  await openArrival();
  const input = screen.getByLabelText(/到货照片/);
  fireEvent.change(input, {
    target: { files: [photo("a.pdf", "application/pdf")] },
  });
  expect(await screen.findByRole("alert")).toHaveTextContent("仅支持 JPG、PNG");
  fireEvent.change(input, {
    target: { files: Array.from({ length: 7 }, (_, i) => photo(`p${i}.jpg`)) },
  });
  expect(await screen.findByRole("alert")).toHaveTextContent("最多上传 6 张");
  expect(screen.queryByText("p0.jpg")).not.toBeInTheDocument();
});
it("编辑失败登记的数量会更换幂等键，不能超过当前剩余量", async () => {
  create.mockRejectedValue(new Error("offline"));
  render(<PurchaseReceiptPanel purchaseContractId="purchase-1" />);
  fireEvent.click(await screen.findByText("登记分批到货"));
  const input = screen.getByLabelText("测试商品 本批到货量");
  fireEvent.change(input, { target: { value: "11" } });
  fireEvent.submit(screen.getByText("保存到货").closest("form")!);
  expect(create).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "4" } });
  fireEvent.click(screen.getByText("保存到货"));
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  fireEvent.change(input, { target: { value: "5" } });
  fireEvent.click(screen.getByText("保存到货"));
  await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
  expect(create.mock.calls[1][1].requestId).not.toBe(
    create.mock.calls[0][1].requestId,
  );
});
it("验货保留已入库合格量下限，待复验和未合格必须说明，可全数合格", async () => {
  render(<PurchaseReceiptPanel purchaseContractId="purchase-1" />);
  fireEvent.click(await screen.findByText("登记验货"));
  const accepted = screen.getByLabelText("测试商品 累计合格量");
  const review = screen.getByLabelText("测试商品 待复验量");
  fireEvent.change(accepted, { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("验货说明"), {
    target: { value: "测试不允许下调" },
  });
  fireEvent.submit(screen.getByText("保存验货").closest("form")!);
  expect(inspect).not.toHaveBeenCalled();
  fireEvent.change(accepted, { target: { value: "8" } });
  fireEvent.change(review, { target: { value: "3" } });
  fireEvent.submit(screen.getByText("保存验货").closest("form")!);
  expect(inspect).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("全数合格"));
  fireEvent.click(screen.getByText("保存验货"));
  await waitFor(() =>
    expect(inspect).toHaveBeenCalledWith(
      "purchase-1",
      "receipt-1",
      expect.objectContaining({
        items: [
          {
            receiptItemId: "ri-1",
            acceptedQuantity: 10,
            reinspectionQuantity: 0,
          },
        ],
      }),
    ),
  );
});
it("未填写验货说明不能提交，初始到货全部待验", async () => {
  const fresh = structuredClone(data);
  fresh.items[0].items[0].acceptedQuantity = 0;
  fresh.items[0].items[0].pendingQuantity = 10;
  fresh.items[0].items[0].reinspectionQuantity = 0;
  list.mockResolvedValue({ data: fresh });
  render(<PurchaseReceiptPanel purchaseContractId="purchase-1" />);
  fireEvent.click(await screen.findByText("登记验货"));
  expect(screen.getByLabelText("测试商品 累计合格量")).toHaveValue(0);
  fireEvent.click(screen.getByText("全数合格"));
  fireEvent.submit(screen.getByText("保存验货").closest("form")!);
  expect(inspect).not.toHaveBeenCalled();
});
it.each(["BOSS", "FINANCE", "SALES"])(
  "%s可看历史但无登记验货动作",
  async (value) => {
    role = value;
    render(<PurchaseReceiptPanel purchaseContractId="purchase-1" />);
    await screen.findByText("测试采购员");
    expect(screen.queryByText("登记分批到货")).not.toBeInTheDocument();
    expect(screen.queryByText("登记验货")).not.toBeInTheDocument();
  },
);
it("显式readOnly覆盖采购写权限，加载失败可重试", async () => {
  list.mockRejectedValueOnce(new Error("offline"));
  render(<PurchaseReceiptPanel purchaseContractId="purchase-1" readOnly />);
  await screen.findByText("到货验货记录读取失败");
  fireEvent.click(screen.getByText("重试"));
  await screen.findByText("测试采购员");
  expect(screen.queryByText("登记分批到货")).not.toBeInTheDocument();
});

it("验货完整历史逐页读取，旧批次不因最近20次被截断", async () => {
  inspections.mockResolvedValue({
    data: {
      items: [
        {
          ...data.items[0].items[0].inspections[0],
          productName: "历史测试商品",
          unit: "件",
        },
      ],
      pagination: { total: 21 },
    },
  });
  render(<PurchaseReceiptPanel purchaseContractId="purchase-1" readOnly />);
  fireEvent.click(await screen.findByText("全部验货记录"));
  await screen.findByText("历史测试商品（件）");
  const dialog = screen.getByRole("dialog");
  const next = [...dialog.querySelectorAll("button")].find(
    (button) => button.textContent === "下一页",
  )!;
  fireEvent.click(next);
  await waitFor(() =>
    expect(inspections).toHaveBeenLastCalledWith("purchase-1", "receipt-1", {
      page: 2,
      pageSize: 20,
    }),
  );
});
it.each(["DRAFT", "RECEIVED", "COMPLETED"])(
  "%s不能登记新到货或更改验货",
  async (status) => {
    list.mockResolvedValue({
      data: {
        ...data,
        status,
        summary: { ...data.summary, canReceive: false },
      },
    });
    render(<PurchaseReceiptPanel purchaseContractId="purchase-1" />);
    await screen.findByText("测试采购员");
    expect(screen.queryByText("登记分批到货")).not.toBeInTheDocument();
    expect(screen.queryByText("登记验货")).not.toBeInTheDocument();
  },
);
it("历史整单库存缺少批次证据时只读，不能重复登记", async () => {
  list.mockResolvedValue({
    data: {
      ...data,
      summary: { ...data.summary, legacy: true, canReceive: false },
    },
  });
  render(<PurchaseReceiptPanel purchaseContractId="purchase-1" />);
  await screen.findByText(
    "历史收货缺少分批验货记录，保留既有库存，请核对历史记录，不能重复登记入库",
  );
  expect(screen.queryByText("登记分批到货")).not.toBeInTheDocument();
  expect(screen.queryByText("登记验货")).not.toBeInTheDocument();
});

it("小数数量遵循后台精度边界，不把0.1合格加0.2待复验误判超量", async () => {
  const fractional = structuredClone(data);
  Object.assign(fractional.items[0].items[0], {
    arrivedQuantity: 0.3,
    acceptedQuantity: 0,
    pendingQuantity: 0.3,
    reinspectionQuantity: 0,
  });
  list.mockResolvedValue({ data: fractional });
  render(<PurchaseReceiptPanel purchaseContractId="purchase-1" />);
  fireEvent.click(await screen.findByText("登记验货"));
  fireEvent.change(screen.getByLabelText("测试商品 累计合格量"), {
    target: { value: "0.1" },
  });
  fireEvent.change(screen.getByLabelText("测试商品 待复验量"), {
    target: { value: "0.2" },
  });
  fireEvent.change(screen.getByLabelText("验货说明"), {
    target: { value: "合成小数数量复验" },
  });
  fireEvent.submit(screen.getByText("保存验货").closest("form")!);
  await waitFor(() =>
    expect(inspect).toHaveBeenCalledWith(
      "purchase-1",
      "receipt-1",
      expect.objectContaining({
        items: [
          {
            receiptItemId: "ri-1",
            acceptedQuantity: 0.1,
            reinspectionQuantity: 0.2,
          },
        ],
      }),
    ),
  );
});
