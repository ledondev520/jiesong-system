/** 公司信息设置：读取三个共享键、只保存改动的键、清空发送空串、保存失败保留输入。 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CompanySettingsPage, { changedCompanyValues } from "./page";

const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), identity: vi.fn() }));
vi.mock("@/services/config.service", () => ({
  configService: {
    getSystemConfig: mocks.get,
    updateSystemConfig: mocks.update,
    getSellerIdentity: mocks.identity,
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const config = (data: Record<string, string>) => ({
  code: 200,
  message: "ok",
  data,
});

const identity = (data: Record<string, unknown> = {}) => ({
  code: 200,
  message: "ok",
  data: { name: "", address: "", phone: "", taxId: "", bank: "", legacyFilled: [], invoiceTitleText: "", ...data },
});

beforeEach(() => {
  mocks.get.mockReset();
  mocks.update.mockReset();
  mocks.identity.mockReset();
  mocks.identity.mockResolvedValue(identity());
});

describe("changedCompanyValues", () => {
  const saved = {
    companyName: "Synthetic Co",
    companyTaxId: "",
    companyAddress: "",
    companyPhone: "",
    companyBankInfo: "Bank: X",
  };
  it("只返回改动的键，忽略首尾空白差异，清空即空串", () => {
    expect(changedCompanyValues(saved, saved)).toEqual({});
    expect(
      changedCompanyValues(saved, { ...saved, companyName: " Synthetic Co " }),
    ).toEqual({});
    expect(
      changedCompanyValues(saved, {
        ...saved,
        companyAddress: "1 Road",
        companyBankInfo: "",
      }),
    ).toEqual({ companyAddress: "1 Road", companyBankInfo: "" });
  });
});

describe("CompanySettingsPage", () => {
  it("没有配置时三个输入都是空的（不编造默认值），保存按钮不可用", async () => {
    mocks.get.mockResolvedValue(config({}));
    render(<CompanySettingsPage />);
    await waitFor(() =>
      expect(screen.getByLabelText("公司名称")).not.toBeDisabled(),
    );
    expect(screen.getByLabelText("公司名称")).toHaveValue("");
    expect(screen.getByLabelText("公司地址")).toHaveValue("");
    expect(screen.getByLabelText("银行资料（每行一项）")).toHaveValue("");
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  });

  it("读取已有值；修改一项只发送该键，然后重新读取", async () => {
    const user = userEvent.setup();
    mocks.get.mockResolvedValue(
      config({
        companyName: "Synthetic Co",
        companyAddress: "1 Road",
        companyBankInfo: "Bank: X",
      }),
    );
    mocks.update.mockResolvedValue(config({}));
    render(<CompanySettingsPage />);
    const name = await screen.findByLabelText("公司名称");
    await waitFor(() => expect(name).toHaveValue("Synthetic Co"));
    expect(screen.getByLabelText("银行资料（每行一项）")).toHaveValue(
      "Bank: X",
    );
    await user.clear(screen.getByLabelText("公司地址"));
    await user.type(screen.getByLabelText("公司地址"), "2 Road");
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith({ companyAddress: "2 Road" }),
    );
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
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "银行资料最多 12 行",
    );
    expect(bank).toHaveValue("Bank: Synthetic");
  });

  it("旧开票抬头只带入尚为空的字段并提示；保存只写入这些 canonical 键（不写 invoiceTitleInfo）", async () => {
    const user = userEvent.setup();
    mocks.get.mockResolvedValue(config({ companyName: "Canon Co" }));
    mocks.identity.mockResolvedValue(identity({
      name: "Canon Co", taxId: "91-X1", address: "1 Legacy Road", phone: "555", bank: "Legacy Bank 000",
      legacyFilled: ["taxId", "address", "phone", "bank"],
    }));
    mocks.update.mockResolvedValue(config({}));
    render(<CompanySettingsPage />);
    expect(await screen.findByRole("status")).toHaveTextContent("旧的「我方开票抬头信息」");
    await waitFor(() => expect(screen.getByLabelText("纳税人识别号")).toHaveValue("91-X1"));
    expect(screen.getByLabelText("公司名称")).toHaveValue("Canon Co");
    expect(screen.getByLabelText("公司地址")).toHaveValue("1 Legacy Road");
    expect(screen.getByLabelText("公司电话")).toHaveValue("555");
    expect(screen.getByLabelText("银行资料（每行一项）")).toHaveValue("Legacy Bank 000");
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({
      companyTaxId: "91-X1", companyAddress: "1 Legacy Road", companyPhone: "555", companyBankInfo: "Legacy Bank 000",
    }));
    expect(JSON.stringify(mocks.update.mock.calls)).not.toContain("invoiceTitleInfo");
  });

  it("别名读取失败时仍显示已保存的值", async () => {
    mocks.get.mockResolvedValue(config({ companyName: "Canon Co" }));
    mocks.identity.mockRejectedValue(new Error("boom"));
    render(<CompanySettingsPage />);
    await waitFor(() => expect(screen.getByLabelText("公司名称")).toHaveValue("Canon Co"));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("编辑后离开并重新挂载只显示服务器原值，没有任何配置写请求（原「普通文本放弃编辑」验收）", async () => {
    const user = userEvent.setup();
    mocks.get.mockResolvedValue(config({ companyName: "合成普通设置公司" }));
    const page = render(<CompanySettingsPage />);
    const field = await screen.findByLabelText("公司名称");
    await waitFor(() => expect(field).toHaveValue("合成普通设置公司"));
    await user.clear(field);
    await user.type(field, "合成未保存草稿");
    page.unmount();
    render(<CompanySettingsPage />);
    await waitFor(() => expect(screen.getByLabelText("公司名称")).toHaveValue("合成普通设置公司"));
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
