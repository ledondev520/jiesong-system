import { AxiosError, type AxiosAdapter } from "axios";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import api, { clearApiGetCache } from "@/lib/axios";
import { pricingService } from "@/services/pricing.service";
import { PricingConfigCard } from "./PricingConfigCard";
import defaults from "../../../../../../config/pricing.json";
import schema from "../../../../../../config/pricing.schema.json";

vi.mock("@/store/auth.store", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { role: "ADMIN" } }),
}));

const originalAdapter = api.defaults.adapter;
const adapter = vi.fn();
const snapshot = { config: defaults, revision: "a".repeat(64), schema };

beforeEach(() => {
  clearApiGetCache();
  adapter.mockReset().mockImplementation(async (config) => ({
    config,
    status: 200,
    statusText: "OK",
    headers: { "cache-control": "no-store" },
    data: { code: 200, data: snapshot },
  }));
  api.defaults.adapter = adapter as AxiosAdapter;
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  clearApiGetCache();
});

it("shows the actual conflict message after the shared Axios interceptor unwraps it", async () => {
  const user = userEvent.setup();
  render(<PricingConfigCard />);
  await screen.findByLabelText("乘数");
  const message = "报价配置已变更，请重新加载后保存";
  adapter.mockImplementationOnce(async (config) => {
    throw new AxiosError("Conflict", "ERR_BAD_REQUEST", config, {}, {
      config,
      status: 409,
      statusText: "Conflict",
      headers: {},
      data: { code: 409, message, data: null },
    });
  });
  await user.clear(screen.getByLabelText("乘数"));
  await user.type(screen.getByLabelText("乘数"), "1.5");
  await user.click(screen.getByRole("button", { name: "保存报价配置" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(message);
  expect(screen.getByLabelText("乘数")).toHaveValue(1.5);
});

it("loads the current configuration revision on every read after an external change", async () => {
  expect((await pricingService.get()).data.revision).toBe(snapshot.revision);
  const changed = {
    ...snapshot,
    revision: "b".repeat(64),
    config: { ...defaults, refundableMarkup: 0.4 },
  };
  adapter.mockImplementationOnce(async (config) => ({
    config,
    status: 200,
    statusText: "OK",
    headers: { "cache-control": "no-store" },
    data: { code: 200, data: changed },
  }));
  const current = (await pricingService.get()).data;
  expect(current.revision).toBe(changed.revision);
  expect(current.config.refundableMarkup).toBe(0.4);
});
