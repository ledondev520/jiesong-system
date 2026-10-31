/** 客户表单：必填/格式校验先于请求；编辑时清空字段发送 null，未改动字段不被清掉。 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Customer } from "@/types";
import { buildCustomerPayload, CustomerDialog } from "./CustomerDialog";

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));
vi.mock("@/services/customer.service", () => ({
  INCOTERM_OPTIONS: ["FOB", "CFR", "CIF", "EXW", "DDP"],
  customerService: { create: mocks.create, update: mocks.update },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const existing: Customer = {
  id: "c1", name: "Seapot", legalName: "Seapot Group", contactName: "Amy", contactEmail: null, country: "US",
  defaultCurrency: "USD", defaultIncoterm: "FOB", isActive: true, createdAt: "", updatedAt: "",
};

beforeEach(() => {
  mocks.create.mockReset();
  mocks.update.mockReset();
});

describe("buildCustomerPayload", () => {
  const form = {
    name: " Seapot ", country: "us", note: "", defaultIncoterm: "CIF", legalName: "Seapot Group", address: "",
    contactName: "", contactPhone: "", contactEmail: "", defaultPaymentTerms: "", defaultPortOfLoading: "",
  };
  it("新增：空值不发送，国家大写", () => {
    expect(buildCustomerPayload(form)).toEqual({ name: "Seapot", country: "US", defaultIncoterm: "CIF", legalName: "Seapot Group" });
  });
  it("编辑：原来有值、现在清空的字段发送 null，原来就为空的不发送", () => {
    expect(buildCustomerPayload(form, existing)).toEqual({
      name: "Seapot", country: "US", defaultIncoterm: "CIF", legalName: "Seapot Group", contactName: null,
    });
  });
});

describe("CustomerDialog", () => {
  it("名称为空时不发请求并提示", async () => {
    const user = userEvent.setup();
    render(<CustomerDialog onClose={vi.fn()} onSaved={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(screen.getByRole("alert")).toHaveTextContent("客户名称不能为空");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("国家和邮箱格式错误时不发请求", async () => {
    const user = userEvent.setup();
    render(<CustomerDialog onClose={vi.fn()} onSaved={vi.fn()} />);
    await user.type(screen.getByLabelText("客户名称 *"), "新客户");
    await user.type(screen.getByLabelText("国家（两位代码）"), "U");
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(screen.getByRole("alert")).toHaveTextContent("两位字母代码");
    await user.clear(screen.getByLabelText("国家（两位代码）"));
    await user.type(screen.getByLabelText("联系邮箱"), "bad");
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(screen.getByRole("alert")).toHaveTextContent("邮箱格式");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("新增成功后回调保存结果；失败时保留输入并显示原因", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    mocks.create.mockRejectedValueOnce({ message: "客户名称已存在" });
    render(<CustomerDialog onClose={vi.fn()} onSaved={onSaved} />);
    await user.type(screen.getByLabelText("客户名称 *"), "Seapot");
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("客户名称已存在"));
    expect(screen.getByLabelText("客户名称 *")).toHaveValue("Seapot");
    mocks.create.mockResolvedValueOnce({ data: { ...existing, id: "c2" } });
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: "c2" })));
    expect(mocks.create).toHaveBeenCalledTimes(2);
  });
});
