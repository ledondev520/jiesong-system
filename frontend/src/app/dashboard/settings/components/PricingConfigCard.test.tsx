import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PricingConfigCard } from "./PricingConfigCard";
import defaults from "../../../../../../config/pricing.json";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
  preview: vi.fn(),
  categories: vi.fn(),
  role: "ADMIN",
}));
vi.mock("@/services/pricing.service", () => ({
  pricingService: { get: mocks.get, save: mocks.save, preview: mocks.preview },
}));
vi.mock("@/services/system.service", () => ({
  getSystemCategories: mocks.categories,
}));
vi.mock("@/store/auth.store", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { role: mocks.role } }),
}));

const snapshot = { config: defaults, revision: "a".repeat(64) };
const ok = (data: unknown) => ({ code: 200, data });

beforeEach(() => {
  mocks.role = "ADMIN";
  mocks.get.mockReset().mockResolvedValue(ok(snapshot));
  mocks.save.mockReset();
  mocks.preview
    .mockReset()
    .mockResolvedValue(ok({ status: "OK", unitPriceUsd: 19 }));
  mocks.categories
    .mockReset()
    .mockResolvedValue(ok({ items: [{ id: "tile", name: "瓷砖" }] }));
});

describe("报价规则卡片", () => {
  it("非管理员不渲染，也不请求配置", () => {
    mocks.role = "SALES";
    render(<PricingConfigCard />);
    expect(screen.queryByText("报价规则")).toBeNull();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("加载后显示各字段（加价以百分比显示）和服务端计算的预览", async () => {
    render(<PricingConfigCard />);
    expect(await screen.findByLabelText("默认加价 (%)")).toHaveValue(30);
    expect(screen.getByLabelText("现汇 (¥/$)")).toHaveValue(
      defaults.exchangeRate,
    );
    expect(screen.getByLabelText("向上取整步长 ($)")).toHaveValue(1);
    await waitFor(() =>
      expect(screen.getByLabelText("报价预览")).toHaveTextContent(
        "成本 ¥100（普通） → $19",
      ),
    );
    expect(mocks.preview).toHaveBeenCalledWith(
      expect.objectContaining({
        costCny: 100,
        config: expect.objectContaining({ roundUpTo: 1 }),
      }),
    );
  });

  it("保存时按百分比换算并带上版本，成功后提示已保存", async () => {
    const user = userEvent.setup();
    mocks.save.mockResolvedValue(
      ok({
        config: { ...defaults, defaultMarkup: 0.4 },
        revision: "b".repeat(64),
      }),
    );
    render(<PricingConfigCard />);
    const markup = await screen.findByLabelText("默认加价 (%)");
    await user.clear(markup);
    await user.type(markup, "40");
    await user.click(screen.getByRole("button", { name: "保存报价配置" }));
    expect(mocks.save).toHaveBeenCalledWith(
      { ...defaults, defaultMarkup: 0.4 },
      snapshot.revision,
    );
    expect(await screen.findByText("报价配置已保存")).toBeInTheDocument();
  });

  it("添加分类加价后随配置一起保存，预览显示分类单价", async () => {
    const user = userEvent.setup();
    mocks.preview.mockImplementation(
      async ({ categoryId }: { categoryId?: string }) =>
        ok({ status: "OK", unitPriceUsd: categoryId ? 16 : 19 }),
    );
    mocks.save.mockResolvedValue(ok(snapshot));
    render(<PricingConfigCard />);
    const add = await screen.findByRole("button", { name: "添加分类" });
    await waitFor(() => expect(add).toBeEnabled());
    await user.click(add);
    await waitFor(() =>
      expect(screen.getByLabelText("报价预览")).toHaveTextContent(
        "成本 ¥100（瓷砖） → $16",
      ),
    );
    await user.click(screen.getByRole("button", { name: "保存报价配置" }));
    expect(mocks.save.mock.calls[0][0].categoryMarkups).toEqual([
      { categoryId: "tile", categoryName: "瓷砖", markup: 0.1 },
    ]);
  });

  it("非法输入不发请求并提示；加载失败显示固定提示且不渲染表单", async () => {
    const user = userEvent.setup();
    render(<PricingConfigCard />);
    const rate = await screen.findByLabelText("现汇 (¥/$)");
    await user.clear(rate);
    await user.click(screen.getByRole("button", { name: "保存报价配置" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "现汇 (¥/$)必须是数字",
    );
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("响应结构无效时不渲染表单", async () => {
    mocks.get.mockResolvedValue(ok({ items: [] }));
    render(<PricingConfigCard />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "报价配置加载失败，请刷新页面重试",
    );
    expect(screen.queryByLabelText("默认加价 (%)")).toBeNull();
  });
});
