/**
 * Input: 港口管理页、system.service、toast
 * Output: 加载失败原因与重试、停用确认、状态徽章的回归结果
 * Pos: 前端业务页交互测试；验证共享 DataTable / ErrorState / RowActionsMenu 在真实页面上的接入
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PortsPage from "./page";

const mockGetPorts = vi.fn();
const mockDeletePort = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/settings/ports",
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/services/system.service", () => ({
  getSystemPorts: (...args: unknown[]) => mockGetPorts(...args),
  createSystemPort: vi.fn(),
  updateSystemPort: vi.fn(),
  deleteSystemPort: (...args: unknown[]) => mockDeletePort(...args),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// 导入导出按钮拉入 xlsx，与本页行为无关
vi.mock("@/components/settings/ImportExportButtons", () => ({
  ImportExportButtons: () => null,
}));

const port = {
  id: "p1",
  name: "深圳港",
  code: "SZ",
  isActive: true,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("港口管理页", () => {
  beforeEach(() => {
    mockGetPorts.mockReset();
    mockDeletePort.mockReset();
  });

  it("加载失败时显示服务端原因和重试，不显示「共 0 条」，重试成功后显示数据", async () => {
    const user = userEvent.setup();
    mockGetPorts
      .mockRejectedValueOnce({ message: "数据库忙" })
      .mockResolvedValueOnce({ data: { items: [port] } });
    render(<PortsPage />);

    expect(
      (await screen.findAllByText("加载港口失败：数据库忙")).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/共 0 条/)).toBeNull();

    await user.click(screen.getAllByRole("button", { name: "重试" })[0]);
    const table = await screen.findByRole("table");
    expect(await within(table).findByText("深圳港")).toBeInTheDocument();
    expect(within(table).getByText("正常")).toBeInTheDocument();
    expect(screen.getByText("共 1 条")).toBeInTheDocument();
  });

  it("在「更多」里停用港口：确认前不请求，确认后停用并显示已停用", async () => {
    const user = userEvent.setup();
    mockGetPorts.mockResolvedValue({ data: { items: [port] } });
    mockDeletePort.mockResolvedValue({});
    render(<PortsPage />);

    const table = await screen.findByRole("table");
    await within(table).findByText("深圳港");
    await user.click(within(table).getByRole("button", { name: "更多操作" }));
    await user.click(await screen.findByRole("menuitem", { name: "停用" }));
    expect(await screen.findByText("停用港口「深圳港」？")).toBeInTheDocument();
    expect(mockDeletePort).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "确认停用" }));
    await waitFor(() => expect(mockDeletePort).toHaveBeenCalledWith("p1"));
    await waitFor(() =>
      expect(
        within(screen.getByRole("table")).getByText("已停用"),
      ).toBeInTheDocument(),
    );
  });
});
