/**
 * Input: Existing settings page and synthetic responses at the Axios network boundary
 * Output: Ordinary invoice text load and edit-then-leave/remount discard evidence
 * Pos: Row 30 component acceptance; no full-form save, credential, provider or accounting writes
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SettingsPage from "./page";

const network = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@/lib/axios", () => ({ default: network }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

const original = "公司名称：合成普通设置公司";
describe("系统配置既有普通固定文本的放弃编辑", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    network.get.mockImplementation(async (pathname: string) => {
      if (pathname === "/system/configs") {
        return { code: 200, data: { invoiceTitleInfo: original } };
      }
      if (pathname === "/hs-codes/hsciq-usage")
        return { code: 200, data: null };
      throw new Error("Unexpected ordinary-text read");
    });
    network.put.mockRejectedValue(
      new Error(
        "Ordinary-text component acceptance never submits the mixed form",
      ),
    );
  });

  it("显示已保存文本；编辑后离开并重新挂载只显示原值，没有任何配置写请求", async () => {
    const user = userEvent.setup();
    const page = render(<SettingsPage />);
    const field = await screen.findByLabelText("我方开票抬头信息");
    expect(field).toHaveValue(original);
    await user.clear(field);
    await user.type(field, "公司名称：合成未保存草稿");
    expect(field).toHaveValue("公司名称：合成未保存草稿");
    page.unmount();
    render(<SettingsPage />);
    expect(await screen.findByLabelText("我方开票抬头信息")).toHaveValue(
      original,
    );
    expect(network.put).not.toHaveBeenCalled();
  });

  it("普通文本在清空编辑后离开时也保留服务器原值，当前表单没有取消按钮", async () => {
    const user = userEvent.setup();
    const page = render(<SettingsPage />);
    await user.clear(await screen.findByLabelText("我方开票抬头信息"));
    expect(screen.getByLabelText("我方开票抬头信息")).toHaveValue("");
    expect(
      screen.queryByRole("button", { name: /^取消$/ }),
    ).not.toBeInTheDocument();
    page.unmount();
    render(<SettingsPage />);
    expect(await screen.findByLabelText("我方开票抬头信息")).toHaveValue(
      original,
    );
    expect(network.put).not.toHaveBeenCalled();
  });
});
