/** 公司信息设置：读取三个共享键、只保存改动的键、清空发送空串、保存失败保留输入。 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CompanySettingsPage, { changedCompanyValues } from "./page";

const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));
vi.mock("@/services/config.service", () => ({ configService: { getSystemConfig: mocks.get, updateSystemConfig: mocks.update } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const config = (data: Record<string, string>) => ({ code: 200, message: "ok", data });

beforeEach(() => {
  mocks.get.mockReset();
  mocks.update.mockReset();
});

describe("changedCompanyValues", () => {
  const saved = { companyName: "Synthetic Co", companyAddress: "", companyBankInfo: "Bank: X" };
  it("只返回改动的键，忽略首尾空白差异，清空即空串", () => {
    expect(changedCompanyValues(saved, saved)).toEqual({});
    expect(changedCompanyValues(saved, { ...saved, companyName: " Synthetic Co " })).toEqual({});
    expect(changedCompanyValues(saved, { ...saved, companyAddress: "1 Road", companyBankInfo: "" })).toEqual({ companyAddress: "1 Road", companyBankInfo: "" });
  });
});

describe("CompanySettingsPage", () => {
  it("没有配置时三个输入都是空的（不编造默认值），保存按钮不可用", async () => {
    mocks.get.mockResolvedValue(config({}));
    render(<CompanySettingsPage />);
    await waitFor(() => expect(screen.getByLabelText("公司名称")).not.toBeDisabled());
    expect(screen.getByLabelText("公司名称")).toHaveValue("");
    expect(screen.getByLabelText("公司地址")).toHaveValue("");
    expect(screen.getByLabelText("银行资料（每行一项）")).toHaveValue("");
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  });

  it("读取已有值；修改一项只发送该键，然后重新读取", async () => {
    const user = userEvent.setup();
    mocks.get.mockResolvedValue(config({ companyName: "Synthetic Co", companyAddress: "1 Road", companyBankInfo: "Bank: X" }));
    mocks.update.mockResolvedValue(config({}));
    render(<CompanySettingsPage />);
    const name = await screen.findByLabelText("公司名称");
    await waitFor(() => expect(name).toHaveValue("Synthetic Co"));
    expect(screen.getByLabelText("银行资料（每行一项）")).toHaveValue("Bank: X");
    await user.clear(screen.getByLabelText("公司地址"));
    await user.type(screen.getByLabelText("公司地址"), "2 Road");
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ companyAddress: "2 Road" }));
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  it("保存失败时保留输入并显示原因", async () => {
    const user = userEvent.setup();
    mocks.get.mockResolvedValue(config({}));
    mocks.update.mockRejectedValue({ message: "银行资料最多 12 行" });
    render(<CompanySettingsPage />);
    const bank = await screen.findByLabelText("银行资料（每行一项）");
    await waitFor(() => expect(bank).not.toBeDisabled());
    await user.type(bank, "Bank: Synthetic");
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("银行资料最多 12 行");
    expect(bank).toHaveValue("Bank: Synthetic");
  });
});
