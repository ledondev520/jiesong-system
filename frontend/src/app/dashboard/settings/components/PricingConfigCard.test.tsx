import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PricingConfigCard } from "./PricingConfigCard";
import defaults from "../../../../../../config/pricing.json";
import schema from "../../../../../../config/pricing.schema.json";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
  role: "ADMIN",
}));
vi.mock("@/services/pricing.service", () => ({
  pricingService: { get: mocks.get, save: mocks.save },
}));
vi.mock("@/store/auth.store", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { role: mocks.role } }),
}));
const snapshot = { config: defaults, revision: "a".repeat(64), schema };

async function ready() {
  const view = render(<PricingConfigCard />);
  await screen.findByLabelText("汇率调整值");
  return view;
}

describe("ADMIN export pricing settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.role = "ADMIN";
    mocks.get.mockResolvedValue({ code: 200, data: snapshot });
    mocks.save.mockImplementation(async (config, revision) => ({
      code: 200,
      data: { config, revision, schema },
    }));
  });
  it.each(["BOSS", "SALES", "PURCHASE", "FINANCE", "WAREHOUSE"])(
    "hides configuration and never loads it for %s",
    (role) => {
      mocks.role = role;
      render(<PricingConfigCard />);
      expect(screen.queryByText("出口报价配置")).not.toBeInTheDocument();
      expect(mocks.get).not.toHaveBeenCalled();
    },
  );
  it("loads defaults, edits every parameter, saves one complete versioned document and reloads", async () => {
    const user = userEvent.setup();
    const view = await ready();
    expect(screen.getByLabelText("汇率调整值")).toHaveValue(-0.2);
    expect(screen.getByLabelText("有退税加价比例 (%)")).toHaveValue(30);
    expect(screen.getByLabelText("零退税加价上限 (%)")).toHaveValue(10);
    expect(screen.getByLabelText("乘数")).toHaveValue(1.3);
    for (const [label, value] of [
      ["汇率调整值", "-0.1"],
      ["有退税加价比例 (%)", "40"],
      ["零退税加价上限 (%)", "15"],
      ["乘数", "1.4"],
    ]) {
      await user.clear(screen.getByLabelText(label));
      await user.type(screen.getByLabelText(label), value);
    }
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "固定乘数" }));
    await user.click(screen.getByRole("button", { name: "保存报价配置" }));
    await screen.findByText("报价配置已保存");
    const expected = {
      mode: "multiplier",
      exchangeAdjustment: -0.1,
      refundableMarkup: 0.4,
      noRefundMarkup: 0.15,
      multiplier: 1.4,
    };
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith(
      expected,
      snapshot.revision,
    );
    mocks.get.mockResolvedValue({
      code: 200,
      data: { ...snapshot, config: expected },
    });
    view.unmount();
    render(<PricingConfigCard />);
    await waitFor(() => expect(screen.getByLabelText("乘数")).toHaveValue(1.4));
  });
  it.each([
    ["汇率调整值", "3"],
    ["有退税加价比例 (%)", "101"],
    ["零退税加价上限 (%)", "-1"],
    ["乘数", "0"],
    ["乘数", ""],
  ])("rejects invalid %s=%s without a save", async (label, value) => {
    const user = userEvent.setup();
    await ready();
    await user.clear(screen.getByLabelText(label));
    if (value) await user.type(screen.getByLabelText(label), value);
    await user.click(screen.getByRole("button", { name: "保存报价配置" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/须在/);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("shows load errors without allowing a default overwrite", async () => {
    mocks.get.mockRejectedValue(new Error("unavailable"));
    render(<PricingConfigCard />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "报价配置加载失败",
    );
    expect(
      screen.queryByRole("button", { name: "保存报价配置" }),
    ).not.toBeInTheDocument();
  });
  it("shows server conflict and keeps edited values for review", async () => {
    const user = userEvent.setup();
    await ready();
    mocks.save.mockRejectedValue({
      response: { data: { message: "报价配置已变更，请重新加载后保存" } },
    });
    await user.clear(screen.getByLabelText("乘数"));
    await user.type(screen.getByLabelText("乘数"), "1.5");
    await user.click(screen.getByRole("button", { name: "保存报价配置" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "报价配置已变更",
    );
    expect(screen.getByLabelText("乘数")).toHaveValue(1.5);
    expect(screen.queryByText("报价配置已保存")).not.toBeInTheDocument();
  });
  it("disables repeated saves during pending update", async () => {
    const user = userEvent.setup();
    await ready();
    let resolve!: (value: unknown) => void;
    mocks.save.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await user.click(screen.getByRole("button", { name: "保存报价配置" }));
    expect(
      screen.getByRole("button", { name: "保存报价配置中..." }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "保存报价配置中..." }));
    expect(mocks.save).toHaveBeenCalledTimes(1);
    resolve({ code: 200, data: snapshot });
    await screen.findByText("报价配置已保存");
  });
});
