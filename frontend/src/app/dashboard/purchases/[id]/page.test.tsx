/**
 * Input: 采购合同详情页、purchaseService、contractDocService、router、toast
 * Output: 采购合同详情页交互逻辑测试结果
 * Pos: 前端详情页交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Suspense } from "react";
import PurchaseDetailPage from "./page";
import { useAuthStore } from "@/store/auth.store";

const mockIsMobile = vi.fn(() => false);
const mockRouterPush = vi.fn();

vi.mock("@/lib/hooks/useMobile", () => ({ useMobile: () => mockIsMobile() }));

const mockGetById = vi.fn();
const mockToastInfo = vi.fn();
const mockToastError = vi.fn();
const mockExportPurchasePdf = vi.fn();
const mockUpdatePurchaseStatus = vi.fn();
const mockReceiptSummary = vi.fn();
let mockReadOnly = false;

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    use: (value: unknown) => {
      if (value && typeof (value as { then?: unknown }).then === "function") {
        return { id: "p-1" };
      }
      return actual.use(value as never);
    },
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    push: mockRouterPush,
    back: vi.fn(),
  }),
}));

vi.mock("@/services/purchase.service", () => ({
  purchaseService: {
    getById: (...args: unknown[]) => mockGetById(...args),
    updateStatus: (...args: unknown[]) => mockUpdatePurchaseStatus(...args),
  },
}));

vi.mock("@/services/contractDoc.service", () => ({
  contractDocService: {
    generateFromPurchase: vi.fn(),
    downloadDocument: vi.fn(),
    getContractPdf: vi.fn(),
    exportPurchasePdf: (...args: unknown[]) => mockExportPurchasePdf(...args),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
    info: (...args: unknown[]) => mockToastInfo(...args),
  },
}));

vi.mock("@/lib/api-cache", () => ({
  cachedFetch: async (_key: string, fetcher: () => unknown) => fetcher(),
  invalidateCache: vi.fn(),
  clearAllCache: vi.fn(),
}));

vi.mock("@/lib/axios", () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
    create: vi.fn().mockReturnThis(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
}));

vi.mock("@/lib/hooks/useBusinessReadOnly", () => ({
  useBusinessReadOnly: () => mockReadOnly,
  BusinessWrite: ({ children }: { children: React.ReactNode }) =>
    mockReadOnly ? null : <>{children}</>,
}));
vi.mock("@/services/purchaseReceipt.service", () => ({
  purchaseReceiptService: {
    list: (...args: unknown[]) => mockReceiptSummary(...args),
  },
}));
vi.mock("./components/PurchaseReceiptPanel", () => ({
  PurchaseReceiptPanel: ({
    purchaseContractId,
    readOnly,
    onChanged,
  }: {
    purchaseContractId: string;
    readOnly?: boolean;
    onChanged: () => void;
  }) => (
    <div
      data-testid="receipt-panel"
      data-contract={purchaseContractId}
      data-readonly={String(readOnly)}
    >
      <button onClick={onChanged}>模拟验货更新</button>
    </div>
  ),
}));

describe("PurchaseDetailPage 交互逻辑", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    mockRouterPush.mockReset();
    mockToastInfo.mockReset();
    mockIsMobile.mockReturnValue(false);
    mockReadOnly = false;
    useAuthStore.setState({
      user: { id: "synthetic", role: "PURCHASE" } as never,
    });
    mockReceiptSummary.mockResolvedValue({
      data: { summary: { complete: false } },
    });
    mockGetById.mockReset();
    mockToastError.mockReset();
    mockExportPurchasePdf.mockReset();
    mockUpdatePurchaseStatus.mockReset();
  });

  /**
   * 职责：使用 Suspense 渲染依赖 use(params) 的详情页
   * 思路：统一包裹 fallback，确保 Promise params 能被 React 解析
   * @param id 合同ID
   */
  const openTab = async (name: string) =>
    userEvent.click(await screen.findByRole("tab", { name: new RegExp(name) }));

  const renderPage = (id = "p-1") => {
    return render(
      <Suspense fallback={<div>页面加载中...</div>}>
        <PurchaseDetailPage params={Promise.resolve({ id })} />
      </Suspense>,
    );
  };

  it("加载成功后展示合同信息与商品空态", async () => {
    mockGetById.mockResolvedValue({
      data: {
        id: "p-1",
        contractNo: "PO2500001",
        status: "DRAFT",
        totalAmount: 0,
        paidAmount: 0,
        supplier: { name: "供应商A" },
        items: [],
      },
    });

    renderPage("p-1");

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "PO2500001" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("list", { name: "采购合同进度" }),
      ).toBeInTheDocument();
    });
    await openTab("明细");
    expect(screen.getByText("暂无商品明细")).toBeInTheDocument();
    expect(window.location.search).toBe("?tab=items");
  });

  it.each([
    ["DRAFT", false, "草稿 · 不计应付"],
    ["CANCELLED", false, "已取消 · 不计应付"],
    ["SIGNED", true, ""],
  ])(
    "%s 合同按应付口径显示待付金额（payable=%s；草稿与已取消不计应付，与列表同口径）",
    async (status, payable, notice) => {
      mockGetById.mockResolvedValue({
        data: {
          id: "p-1",
          contractNo: "PO2500002",
          status,
          totalAmount: 100000,
          paidAmount: 0,
          taxRate: 0,
          supplier: { name: "供应商A" },
          items: [],
        },
      });

      renderPage("p-1");

      await screen.findByRole("heading", { name: "PO2500002" });
      if (payable) {
        const label = screen.getByText("待付金额");
        expect(label.parentElement).toHaveTextContent("¥100,000");
        expect(screen.queryByText(/不计应付/)).not.toBeInTheDocument();
        expect(screen.getByRole("progressbar")).toBeInTheDocument();
      } else {
        expect(screen.getByText(notice)).toBeInTheDocument();
        expect(screen.queryByText("待付金额")).not.toBeInTheDocument();
        expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
      }
    },
  );

  const draftContract = {
    id: "p-1",
    contractNo: "PO2500001",
    status: "DRAFT",
    totalAmount: 0,
    paidAmount: 0,
    supplier: { name: "供应商A" },
    items: [],
  };

  it("生成购销合同先确认对外法律文件，确认后才打开收货信息弹窗", async () => {
    mockGetById.mockResolvedValue({ data: draftContract });
    const user = userEvent.setup();
    renderPage("p-1");

    await user.click(await screen.findByRole("button", { name: /单证/ }));
    await user.click(
      await screen.findByRole("menuitem", { name: /生成购销合同/ }),
    );
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent("PO2500001");
    expect(confirm).toHaveTextContent("对外");
    expect(
      screen.queryByText("填写收货信息后，系统将自动生成标准购销合同文档"),
    ).not.toBeInTheDocument();
    await user.click(within(confirm).getByRole("button", { name: "继续" }));
    expect(
      await screen.findByText("填写收货信息后，系统将自动生成标准购销合同文档"),
    ).toBeInTheDocument();
  });

  it("SALES 看不到生成/查看合同（含供应商银行信息，后端 403）", async () => {
    useAuthStore.setState({
      user: { id: "synthetic", role: "SALES" } as never,
    });
    mockGetById.mockResolvedValue({ data: draftContract });
    const user = userEvent.setup();
    renderPage("p-1");

    await user.click(await screen.findByRole("button", { name: /单证/ }));
    expect(
      await screen.findByRole("menuitem", { name: /在线盖章/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /生成购销合同/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /查看合同/ }),
    ).not.toBeInTheDocument();
  });

  it("在线盖章与生成购销合同收进同一个「单证」菜单，不再是页头独立按钮", async () => {
    mockGetById.mockResolvedValue({ data: draftContract });
    const user = userEvent.setup();
    renderPage("p-1");

    await screen.findByRole("button", { name: /单证/ });
    expect(
      screen.queryByRole("button", { name: /在线盖章/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /生成购销合同/ }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /单证/ }));
    expect(
      await screen.findByRole("menuitem", { name: /在线盖章/ }),
    ).toBeInTheDocument();
  });

  it("取消盖章或生成确认不会打开外部平台、也不会打开生成弹窗", async () => {
    mockGetById.mockResolvedValue({ data: draftContract });
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    const user = userEvent.setup();
    renderPage("p-1");

    await user.click(await screen.findByRole("button", { name: /单证/ }));
    await user.click(await screen.findByRole("menuitem", { name: /在线盖章/ }));
    const stamp = await screen.findByRole("alertdialog");
    expect(stamp).toHaveTextContent("外部");
    expect(stamp).toHaveTextContent("PO2500001");
    await user.click(within(stamp).getByRole("button", { name: "取消" }));
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(openSpy).not.toHaveBeenCalled();
    expect(mockToastInfo).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /单证/ }));
    await user.click(
      await screen.findByRole("menuitem", { name: /生成购销合同/ }),
    );
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "取消",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByText("填写收货信息后，系统将自动生成标准购销合同文档"),
    ).not.toBeInTheDocument();
    openSpy.mockRestore();
  });

  it("确认盖章后才走盖章入口（未配置平台时提示去设置）", async () => {
    mockGetById.mockResolvedValue({ data: draftContract });
    const user = userEvent.setup();
    renderPage("p-1");

    await user.click(await screen.findByRole("button", { name: /单证/ }));
    await user.click(await screen.findByRole("menuitem", { name: /在线盖章/ }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "前往盖章",
      }),
    );
    expect(mockToastInfo).toHaveBeenCalledWith(
      expect.stringContaining("尚未配置线上盖章平台链接"),
    );
  });

  it("加载失败时提示错误", async () => {
    mockGetById.mockRejectedValue(new Error("load failed"));
    renderPage("p-1");

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("加载合同详情失败");
      expect(screen.getByText("采购合同读取失败")).toBeInTheDocument();
      expect(screen.queryByText("合同不存在")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
    });
  });

  it("仅404显示不存在，未履行草稿提供更正和确认取消", async () => {
    mockGetById.mockRejectedValueOnce({ code: 404, message: "采购合同不存在" });
    const view = renderPage();
    expect(await screen.findByText("合同不存在")).toBeInTheDocument();
    expect(screen.queryByText("采购合同读取失败")).not.toBeInTheDocument();
    view.unmount();
    mockGetById.mockResolvedValue({
      data: {
        id: "p-1",
        contractNo: "synthetic",
        status: "DRAFT",
        paidAmount: 0,
        totalAmount: 100,
        expectedDate: "2026-10-20",
        items: [],
      },
    });
    mockUpdatePurchaseStatus.mockResolvedValue({ data: {} });
    const nativeConfirm = vi.spyOn(window, "confirm");
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("heading", { name: "synthetic" });
    expect(screen.getByText("2026-10-20")).toBeInTheDocument();
    // 取消合同是破坏性操作：不在头部第一层，只在「更多」里
    expect(
      screen.queryByRole("button", { name: "取消合同" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "更多" }));
    expect(
      await screen.findByRole("menuitem", { name: "更正草稿" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "取消合同" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("取消采购合同 synthetic？");
    await user.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(mockUpdatePurchaseStatus).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "更多" }));
    await user.click(await screen.findByRole("menuitem", { name: "取消合同" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "取消合同",
      }),
    );
    await waitFor(() =>
      expect(mockUpdatePurchaseStatus).toHaveBeenCalledWith("p-1", "CANCELLED"),
    );
    expect(nativeConfirm).not.toHaveBeenCalled();
    nativeConfirm.mockRestore();
  });

  it("更正草稿在「更多」里，选中后进入编辑页", async () => {
    mockGetById.mockResolvedValue({ data: draftContract });
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("heading", { name: "PO2500001" });
    await user.click(screen.getByRole("button", { name: "更多" }));
    await user.click(await screen.findByRole("menuitem", { name: "更正草稿" }));
    expect(mockRouterPush).toHaveBeenCalledWith(
      "/dashboard/purchases/new?editId=p-1",
    );
  });

  it("点击导出 PDF 会调用服务", async () => {
    mockGetById.mockResolvedValue({
      data: {
        id: "p-1",
        contractNo: "PO2500001",
        status: "DRAFT",
        totalAmount: 0,
        paidAmount: 0,
        supplier: { name: "供应商A" },
        items: [],
      },
    });
    mockExportPurchasePdf.mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderPage("p-1");

    // 导出 PDF 收进「单证」菜单，头部第一层不再有这个按钮
    await screen.findByRole("heading", { name: "PO2500001" });
    expect(
      screen.queryByRole("button", { name: /导出 PDF/ }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "单证" }));
    await user.click(await screen.findByRole("menuitem", { name: /导出 PDF/ }));

    expect(mockExportPurchasePdf).toHaveBeenCalledWith("p-1", "PO2500001");
  });

  it("详情页提供明确的下一阶段动作并顺序推进状态", async () => {
    mockGetById.mockResolvedValue({
      data: {
        id: "p-1",
        contractNo: "CG2600001",
        status: "DRAFT",
        totalAmount: 1000,
        paidAmount: 0,
        supplier: { name: "供应商A" },
        items: [],
      },
    });
    mockUpdatePurchaseStatus.mockResolvedValue({ data: { status: "SIGNED" } });

    const user = userEvent.setup();
    renderPage("p-1");

    const nextButton = await screen.findByRole("button", {
      name: "确认已签约",
    });
    await user.click(nextButton);
    // 每次状态点击都要先确认：取消不发请求，确认后才推进
    expect(mockUpdatePurchaseStatus).not.toHaveBeenCalled();
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "取消",
      }),
    );
    expect(mockUpdatePurchaseStatus).not.toHaveBeenCalled();
    await user.click(nextButton);
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "确认",
      }),
    );

    expect(mockUpdatePurchaseStatus).toHaveBeenCalledWith("p-1", "SIGNED");
  });

  it("生产中合同直接登记完工资料，无需单独推进生产状态", async () => {
    mockGetById.mockResolvedValue({
      data: {
        id: "p-1",
        contractNo: "CG2600001",
        status: "PRODUCING",
        totalAmount: 1000,
        paidAmount: 300,
        supplier: { name: "供应商A" },
        items: [],
      },
    });

    renderPage("p-1");

    expect(
      await screen.findByRole("button", { name: "登记完工资料" }),
    ).toBeInTheDocument();
  });

  it("生产资料缺项时可直接打开补件表单，不能只改完工状态", async () => {
    mockGetById.mockResolvedValue({
      data: {
        id: "p-1",
        contractNo: "CG2600001",
        status: "PRODUCING",
        totalAmount: 1000,
        paidAmount: 300,
        supplier: { name: "供应商A" },
        items: [
          {
            id: "pi-1",
            productId: "product-1",
            quantity: 10,
            unitPrice: 10,
            totalPrice: 113,
            product: { customsName: "测试商品" },
          },
        ],
        productionReadiness: {
          ready: false,
          itemCount: 1,
          incompleteItemCount: 1,
          estimatedDimensionItemCount: 1,
          totals: { boxes: 0, grossWeight: 0, netWeight: 0, volume: 0 },
          items: [
            {
              id: "pi-1",
              ready: false,
              dimensionsEstimated: true,
              issues: [{ code: "MISSING_BOXES", label: "箱数" }],
            },
          ],
        },
      },
    });

    renderPage("p-1");

    const button = await screen.findByRole("button", { name: "登记完工资料" });
    expect(button).toBeEnabled();
    await userEvent.setup().click(button);
    expect(
      await screen.findByRole("button", { name: "保存并登记完工" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/测试商品：箱数/)).toBeInTheDocument();
  });

  it("历史生产完成合同缺生产资料时也禁止直接确认供应商发货", async () => {
    mockGetById.mockResolvedValue({
      data: {
        id: "p-1",
        contractNo: "CG2600001",
        status: "READY",
        totalAmount: 1000,
        paidAmount: 300,
        supplier: { name: "供应商A" },
        items: [
          {
            id: "pi-1",
            productId: "product-1",
            quantity: 10,
            unitPrice: 10,
            totalPrice: 113,
            product: { customsName: "测试商品" },
          },
        ],
        productionReadiness: {
          ready: false,
          itemCount: 1,
          incompleteItemCount: 1,
          estimatedDimensionItemCount: 1,
          totals: { boxes: 0, grossWeight: 0, netWeight: 0, volume: 0 },
          items: [
            {
              id: "pi-1",
              ready: false,
              dimensionsEstimated: true,
              issues: [{ code: "MISSING_VOLUME", label: "总体积" }],
            },
          ],
        },
      },
    });

    renderPage("p-1");

    expect(
      await screen.findByRole("button", { name: "确认供应商已发货" }),
    ).toBeDisabled();
  });

  it("手机商品卡片展示不含税单价和含税合计且不重复加税", async () => {
    mockIsMobile.mockReturnValue(true);
    mockGetById.mockResolvedValue({
      data: {
        id: "p-1",
        contractNo: "CG2600002",
        status: "SIGNED",
        taxRate: 13,
        totalAmount: 1130,
        paidAmount: 300,
        supplier: { name: "供应商A" },
        items: [
          {
            id: "pi-1",
            purchaseContractId: "p-1",
            productId: "product-1",
            quantity: 10,
            unit: "件",
            unitPrice: 100,
            totalPrice: 1130,
            product: { customsName: "酒架", unit: "件" },
          },
        ],
      },
    });

    renderPage("p-1");

    await openTab("明细");
    // 头部的「含税合计」事实 chip 也有同名文字，所以限定在明细页签内
    const items = within(await screen.findByRole("tabpanel"));
    expect(await items.findByText("不含税合计")).toBeInTheDocument();
    expect(items.getByText("含税合计")).toBeInTheDocument();
    expect(screen.getByText("¥1,000")).toBeInTheDocument();
    expect(screen.getByText("¥130")).toBeInTheDocument();
    expect(screen.queryByText("¥1,276.9")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("不含税单价")).toBeInTheDocument();
  });
  it("已发货只能走分批验货，不暴露整单收货按钮且验货后刷新合同状态", async () => {
    const contract = {
      id: "p-1",
      contractNo: "CG-TEST",
      status: "SHIPPED",
      totalAmount: 100,
      paidAmount: 0,
      supplier: { name: "合成供应商" },
      items: [],
    };
    mockGetById
      .mockResolvedValueOnce({ data: contract })
      .mockResolvedValue({ data: { ...contract, status: "RECEIVED" } });
    renderPage();
    // 阻塞条是持续状态（role=status），「去处理」直达收货验货页签
    // 先等页面渲染完：加载骨架也是 role=status
    await screen.findByRole("heading", { name: "CG-TEST" });
    const blocker = screen.getByRole("status");
    expect(blocker).toHaveTextContent("请在「收货验货」逐批登记到货与验货");
    expect(screen.queryByTestId("receipt-panel")).not.toBeInTheDocument();
    await userEvent
      .setup()
      .click(within(blocker).getByRole("button", { name: "去处理" }));
    const panel = await screen.findByTestId("receipt-panel");
    expect(window.location.search).toBe("?tab=receiving");
    expect(panel).toHaveAttribute("data-contract", "p-1");
    expect(
      screen.queryByRole("button", { name: "全部到齐并验收入库" }),
    ).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByText("模拟验货更新"));
    expect(
      await screen.findByText(
        "已收货，付款记录结清后自动完成采购，无需再确认完成。",
      ),
    ).toBeInTheDocument();
    expect(mockUpdatePurchaseStatus).not.toHaveBeenCalled();
  });
  it("老板的分批记录面板只读，不展示手动收货或完成动作", async () => {
    mockReadOnly = true;
    mockGetById.mockResolvedValue({
      data: {
        id: "p-1",
        contractNo: "CG-TEST",
        status: "SHIPPED",
        totalAmount: 100,
        paidAmount: 0,
        supplier: { name: "合成供应商" },
        items: [],
      },
    });
    renderPage();
    await openTab("收货验货");
    expect(await screen.findByTestId("receipt-panel")).toHaveAttribute(
      "data-readonly",
      "true",
    );
    expect(
      screen.queryByRole("button", { name: /全部到齐并验收入库|确认完成/ }),
    ).not.toBeInTheDocument();
  });

  const signedContract = {
    id: "p-1",
    contractNo: "CG2600009",
    status: "SIGNED",
    taxRate: 0,
    totalAmount: 1000,
    paidAmount: 400,
    signedAt: "2026-10-18T00:00:00.000Z",
    salesContractId: "so-7",
    supplier: { name: "供应商A" },
    items: [],
    subStatus: {
      payment: "PARTIAL",
      arrival: { state: "NONE", ordered: 2, arrived: 0, registered: false },
      docsComplete: false,
    },
  };

  it("头部只有一个主操作，事实 chips 和四个维度状态各自带标签", async () => {
    mockGetById.mockResolvedValue({ data: signedContract });
    renderPage();
    await screen.findByRole("heading", { name: "CG2600009" });

    // 第一层只剩状态驱动的主操作 + 两个菜单；其余动作都收进菜单
    for (const name of ["登记完工资料", "单证"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    // 已有付款，不能更正/取消，「更多」里没有可用项就不显示
    expect(screen.queryByRole("button", { name: "更多" })).toBeNull();
    for (const name of [
      "导出 PDF",
      "查看合同",
      "在线盖章",
      "生成购销合同",
      "取消合同",
      "更正草稿",
    ]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }

    const facts = screen.getByText("供应商").closest("dl")!;
    expect(facts).toHaveTextContent("关联订单查看订单");
    expect(
      within(facts).getByRole("link", { name: "查看订单" }),
    ).toHaveAttribute("href", "/dashboard/orders/so-7");
    expect(facts).toHaveTextContent("签订日2026-10-18");
    expect(facts).toHaveTextContent("已付/应付¥400 / ¥1,000");

    const dims = within(screen.getByRole("list", { name: "合同状态维度" }));
    expect(dims.getAllByRole("listitem").map((i) => i.textContent)).toEqual([
      "合同已签订",
      "付款部分付款",
      "到货未到货 0/2",
      "资料生产资料未齐",
    ]);
  });

  it("没有关联订单的采购合同，关联订单显示「—」", async () => {
    mockGetById.mockResolvedValue({
      data: { ...signedContract, salesContractId: undefined },
    });
    renderPage();
    await screen.findByRole("heading", { name: "CG2600009" });
    expect(screen.getByText("关联订单").nextSibling).toHaveTextContent("—");
    expect(screen.queryByRole("link", { name: "查看订单" })).toBeNull();
  });

  it("供应商缺联系人与开户行时用「未登记」措辞，不出现孤立的「—」分隔", async () => {
    mockGetById.mockResolvedValue({ data: signedContract });
    renderPage();
    await screen.findByRole("heading", { name: "CG2600009" });
    expect(screen.getByText("开户行未登记")).toBeInTheDocument();
    expect(screen.getByText("账号未登记")).toBeInTheDocument();
    expect(screen.queryByText(/— · —/)).toBeNull();
  });

  it.each(["SALES", "WAREHOUSE"])(
    "%s 看不到收款账户块，不被告知银行信息「未登记」",
    async (role) => {
      useAuthStore.setState({
        user: { id: "synthetic", role } as never,
      });
      mockGetById.mockResolvedValue({ data: signedContract });
      renderPage();
      await screen.findByRole("heading", { name: "CG2600009" });
      expect(screen.queryByText("收款账户")).toBeNull();
      expect(screen.queryByText("开户行未登记")).toBeNull();
      expect(screen.queryByText("账号未登记")).toBeNull();
    },
  );

  it("生产资料缺项挡住发货时，阻塞条说明原因，去处理直达生产页签", async () => {
    mockGetById.mockResolvedValue({
      data: {
        ...signedContract,
        status: "READY",
        productionReadiness: {
          ready: false,
          itemCount: 1,
          incompleteItemCount: 1,
          estimatedDimensionItemCount: 0,
          items: [],
          totals: { boxes: 0, grossWeight: 0, netWeight: 0, volume: 0 },
        },
      },
    });
    const user = userEvent.setup();
    renderPage();
    // 先等页面渲染完：加载骨架也是 role=status
    await screen.findByRole("heading", { name: "CG2600009" });
    const blocker = screen.getByRole("status");
    expect(blocker).toHaveTextContent("请先补齐所有商品的规格");
    expect(
      screen.getByRole("button", { name: "确认供应商已发货" }),
    ).toBeDisabled();
    // 生产页签带红点
    expect(
      screen.getByRole("img", { name: "生产有待处理项" }),
    ).toBeInTheDocument();
    await user.click(within(blocker).getByRole("button", { name: "去处理" }));
    await waitFor(() => expect(window.location.search).toBe("?tab=production"));
  });

  it("老板只读时没有主操作，也没有单证/更多菜单", async () => {
    mockReadOnly = true;
    mockGetById.mockResolvedValue({ data: signedContract });
    renderPage();
    await screen.findByRole("heading", { name: "CG2600009" });
    expect(screen.queryByRole("button", { name: "登记完工资料" })).toBeNull();
    expect(screen.queryByRole("button", { name: "单证" })).toBeNull();
    expect(screen.queryByRole("button", { name: "更多" })).toBeNull();
  });

  it("页签以 URL 为准：?tab=payment 直接打开付款与发票", async () => {
    window.history.replaceState(null, "", "/?tab=payment");
    mockGetById.mockResolvedValue({ data: signedContract });
    renderPage();
    expect(
      await screen.findByRole("tab", { name: /付款与发票/ }),
    ).toHaveAttribute("aria-selected", "true");
  });

  it("术语说明区分采购合同与购销合同", async () => {
    mockGetById.mockResolvedValue({ data: signedContract });
    renderPage();
    expect(
      await screen.findByText(/采购合同是本系统里向供应商采购的单据/),
    ).toHaveTextContent("购销合同是据此生成");
  });

  it("单证菜单项失败（服务端拒绝）时有错误提示，不静默", async () => {
    mockGetById.mockResolvedValue({ data: signedContract });
    mockExportPurchasePdf.mockRejectedValue(new Error("导出失败：服务不可用"));
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("heading", { name: "CG2600009" });
    await user.click(screen.getByRole("button", { name: "单证" }));
    await user.click(await screen.findByRole("menuitem", { name: /导出 PDF/ }));
    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith("导出失败：服务不可用"),
    );
  });
});
