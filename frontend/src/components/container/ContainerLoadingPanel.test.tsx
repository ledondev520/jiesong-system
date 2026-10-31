/**
 * Input: ContainerLoadingPanel / ContainerPrintView / ContainerSummary、两柜装柜计划夹具
 * Output: 摘要状态、桌面 3D 与手机 2D 回退切换、打印页计数与「估算」、导出按钮接线的测试结果
 * Pos: 货柜面板组件测试（Container3DView 与导出库以替身代替）
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContainerLoadingPanel from "./ContainerLoadingPanel";
import ContainerPrintView from "./ContainerPrintView";
import { twoContainerPlan } from "./containerFixtures";

const mockIsMobile = vi.fn(() => false);
const mockRender3D = vi.fn();
const mockExportPng = vi.fn();
const mockExportPdf = vi.fn();

vi.mock("@/lib/hooks/useMobile", () => ({ useMobile: () => mockIsMobile() }));
vi.mock("@/services/sales.service", () => ({
  salesService: { getLoadingPlan: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("./Container3DView", () => ({
  default: (props: { containerIndex?: number }) => {
    mockRender3D(props);
    return <div>3D视图 第{(props.containerIndex ?? 0) + 1}柜</div>;
  },
}));
vi.mock("./containerExport", () => ({
  exportPagePng: (...args: unknown[]) => mockExportPng(...args),
  exportPagesPdf: (...args: unknown[]) => mockExportPdf(...args),
}));

const renderPanel = () =>
  render(
    <ContainerLoadingPanel
      plan={twoContainerPlan()}
      salesContractId="s-1"
      contractNo="EXP001"
    />,
  );

describe("ContainerLoadingPanel", () => {
  beforeEach(() => {
    mockIsMobile.mockReturnValue(false);
    mockRender3D.mockReset();
    mockExportPng.mockReset();
    mockExportPdf.mockReset();
  });

  it("摘要显示柜数、每柜体积/毛重利用率、检查状态与警告", () => {
    renderPanel();
    const summary = screen.getByTestId("container-summary");
    expect(within(summary).getByText("不可出货")).toBeInTheDocument();
    expect(within(summary).getByText(/共 2 个柜/)).toBeInTheDocument();
    expect(within(summary).getByText("第 1 柜 · 3 箱")).toBeInTheDocument();
    expect(
      within(summary).getByText("体积 52.5% · 毛重 0.1%"),
    ).toBeInTheDocument();
    expect(
      within(summary).getByText(/仍有 2 箱装不下/, { selector: "li" }),
    ).toBeInTheDocument();
    expect(within(summary).getByText(/1 行箱规为估算/)).toBeInTheDocument();
  });

  it("桌面端懒加载 3D 视图，并可切换到第 2 柜", async () => {
    const user = userEvent.setup();
    renderPanel();
    expect(await screen.findByText("3D视图 第1柜")).toBeInTheDocument();
    const view = screen.getByTestId("container-view");
    expect(
      within(view).queryByTestId("container-plan-2d"),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "第 2 柜" }));
    expect(await screen.findByText("3D视图 第2柜")).toBeInTheDocument();
  });

  it("手机端回退到静态 2D 图，不渲染 three.js 组件", () => {
    mockIsMobile.mockReturnValue(true);
    renderPanel();
    const view = screen.getByTestId("container-view");
    expect(within(view).getByTestId("container-plan-2d")).toBeInTheDocument();
    expect(within(view).getByLabelText("装柜俯视图")).toBeInTheDocument();
    expect(within(view).getByLabelText("装柜侧视图")).toBeInTheDocument();
    expect(mockRender3D).not.toHaveBeenCalled();
  });

  it("每个柜一页打印版面，含箱数、重量与「估算」标注", () => {
    renderPanel();
    const pages = screen.getAllByTestId("container-print-page");
    expect(pages).toHaveLength(2);
    expect(
      within(pages[0]).getByText(/EXP001 · 装柜图 · 第 1 \/ 2 柜/),
    ).toBeInTheDocument();
    expect(within(pages[0]).getAllByText("测试瓷砖").length).toBeGreaterThan(0);
    expect(within(pages[0]).getByText("估算")).toBeInTheDocument();
    expect(within(pages[1]).getAllByText("溢出餐椅").length).toBeGreaterThan(0);
    expect(within(pages[1]).queryByText("估算")).not.toBeInTheDocument();
  });

  it("保存图片与导出 PDF 调用导出工具并传入正确文件名", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: "保存图片" }));
    await waitFor(() => expect(mockExportPng).toHaveBeenCalledTimes(1));
    expect(mockExportPng.mock.calls[0][1]).toBe("EXP001-装柜图-柜1.png");
    await user.click(screen.getByRole("button", { name: "导出 PDF" }));
    await waitFor(() => expect(mockExportPdf).toHaveBeenCalledTimes(1));
    expect(mockExportPdf.mock.calls[0][0]).toHaveLength(2);
    expect(mockExportPdf.mock.calls[0][1]).toBe("EXP001-装柜图.pdf");
  });

  it("没有装柜结果时给出空态且不提供导出", () => {
    const empty = { ...twoContainerPlan(), containers: [] };
    render(
      <ContainerLoadingPanel
        plan={empty}
        salesContractId="s-1"
        contractNo="EXP001"
      />,
    );
    expect(screen.getByText(/请先添加装箱商品/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "导出 PDF" }),
    ).not.toBeInTheDocument();
  });
});

describe("ContainerPrintView", () => {
  it("分层与装货顺序表列出每个块的排列、箱数、重量和距后墙距离", () => {
    render(
      <ContainerPrintView
        plan={twoContainerPlan()}
        containerIndex={0}
        contractNo="EXP001"
      />,
    );
    expect(screen.getByText("第 1 层")).toBeInTheDocument();
    expect(screen.getByText("3×1×1")).toBeInTheDocument();
    expect(screen.getByText("0.00 m")).toBeInTheDocument();
    expect(screen.getByText("500×500×500")).toBeInTheDocument();
  });

  it("柜序号越界时不渲染", () => {
    const { container } = render(
      <ContainerPrintView
        plan={twoContainerPlan()}
        containerIndex={5}
        contractNo="EXP001"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
