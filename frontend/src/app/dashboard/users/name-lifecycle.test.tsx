/**
 * Input: Both human-user pages, real UserDialog and private migrated loopback API
 * Output: Name-only search/save/reopen/reload, cancellation and genuine failure retry evidence
 * Pos: Account management ordinary-name lifecycle regression; Agent section excluded
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { User } from "@/types";
import UsersPage from "./page";
import SettingsUsersPage from "../settings/users/page";
import {
  accountNameApi,
  readAccountName,
  settleAccountNameRequests,
  setAccountNameFault,
  startAccountNameFixture,
  stopAccountNameFixture,
  type AccountNameFixture,
} from "@/test/account-name-fixture";

const transport = vi.hoisted(() => ({
  request: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));
// Only the HTTP transport is adapted to the real private server. All human user
// service, pagination, page, form, validation and business responses stay real.
vi.mock("@/lib/axios", () => ({
  clearApiGetCache: vi.fn(),
  default: {
    get: (route: string, config?: { params?: Record<string, unknown> }) => {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(config?.params ?? {}))
        query.set(key, String(value));
      return transport.request("GET", route + (query.size ? `?${query}` : ""));
    },
    put: (route: string, body: Partial<User>) =>
      transport.request("PUT", route, body),
    post: () => {
      throw new Error("Create is outside name-only QA");
    },
    delete: () => {
      throw new Error("Delete is outside name-only QA");
    },
  },
}));
// Row31 loads its Agent section independently. Stop that unrelated call before
// HTTP rather than reading credentials/Agent tables or supplying business rows.
vi.mock("@/services/agent.service", () => ({
  agentService: {
    getAll: () =>
      Promise.reject(new Error("Agent section outside name-only QA")),
  },
}));
vi.mock("@/components/dialog/AgentAccountDialog", () => ({
  AgentAccountDialog: () => null,
}));
vi.mock("@/components/layout/ModuleTabHeader", () => ({
  ModuleTabHeader: () => null,
  ADMIN_TABS: [],
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("sonner", () => ({
  toast: { error: transport.error, success: transport.success },
}));

let fixture: AccountNameFixture;
const searchPlaceholder = "搜索姓名、账号、邮箱、角色...";

/**
 * Opens the ordinary target after its real HTTP catalog has settled.
 * @param target Synthetic ordinary user shown by the real directory response
 * @returns Resolves after the edit form and unchanged identity fields are verified
 */
async function openTarget(target: AccountNameFixture["first"]) {
  fireEvent.change(screen.getByPlaceholderText(searchPlaceholder), {
    target: { value: target.username },
  });
  await act(async () => settleAccountNameRequests(fixture));
  const row = await screen.findByRole("row", {
    name: new RegExp(target.username),
  });
  // The legacy settings table has unnamed icon buttons; choose its first (edit).
  await userEvent.click(within(row).getAllByRole("button")[0]);
  await screen.findByRole("dialog", { name: "编辑用户" });
  expect(screen.getByLabelText("用户名 (登录账号)")).toBeDisabled();
  expect(screen.getByLabelText(/密码/)).toHaveValue("");
  expect(screen.getByRole("switch", { name: "账号开通" })).toBeChecked();
  expect(screen.getByRole("combobox", { name: "角色权限" })).toHaveTextContent(
    "销售人员",
  );
}

/**
 * Saves only the display-name field after existing form validation completes.
 * @param name Synthetic display name to enter
 * @returns Resolves after the enabled save action is clicked
 */
async function saveName(name: string) {
  fireEvent.change(screen.getByLabelText("显示姓名"), {
    target: { value: name },
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled(),
  );
  await userEvent.click(screen.getByRole("button", { name: "保存" }));
}

/**
 * Checks outgoing writes retain username/role/activation and leave password blank.
 * @param target Original ordinary user whose unchanged identity is expected
 * @param name Expected display name in each write
 * @param count Expected number of attempted writes
 * @returns Nothing; assertions fail when a write changes another field
 */
function expectNameWrites(
  target: AccountNameFixture["first"],
  name: string,
  count: number,
) {
  const writes = fixture.requests.filter((request) => request.method !== "GET");
  expect(writes).toHaveLength(count);
  for (const request of writes) {
    expect(request).toEqual({
      method: "PUT",
      route: `/users/${target.id}`,
      body: {
        username: target.username,
        name,
        role: target.role,
        isActive: target.isActive,
        password: "",
      },
    });
  }
}

describe("ordinary account-name lifecycle through real localhost APIs", () => {
  beforeAll(async () => {
    fixture = await startAccountNameFixture();
  }, 45000);
  afterAll(async () => {
    if (fixture) await stopAccountNameFixture(fixture);
  });
  afterEach(async () => {
    // Finish real requests before resetting evidence/faults for the next case.
    if (fixture) await act(async () => settleAccountNameRequests(fixture));
  });
  beforeEach(() => {
    fixture.requests = [];
    fixture.responses = [];
    transport.error.mockClear();
    transport.success.mockClear();
    transport.request.mockImplementation((method, route, body) =>
      accountNameApi(fixture, method, route, body),
    );
    setAccountNameFault(fixture);
  });

  it.each([
    ["row31", UsersPage],
    ["row33", SettingsUsersPage],
  ] as const)(
    "%s cancellation sends zero PUTs; saved name survives reopen and reload",
    async (label, Page) => {
      const target = fixture.first;
      const view = render(<Page />);
      await openTarget(target);
      const before = readAccountName(fixture, target.id);
      expect(screen.getByLabelText("显示姓名")).toHaveValue(before.name);
      fireEvent.change(screen.getByLabelText("显示姓名"), {
        target: { value: "合成放弃姓名" },
      });
      await userEvent.click(screen.getByRole("button", { name: "关闭" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(
        fixture.requests.filter((request) => request.method === "PUT"),
      ).toHaveLength(0);
      expect(readAccountName(fixture, target.id)).toEqual(before);

      await openTarget(target);
      expect(screen.getByLabelText("显示姓名")).toHaveValue(before.name);
      const name = `合成保存姓名 ${label}`;
      await saveName(name);
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      const saved = readAccountName(fixture, target.id);
      expect(saved).toEqual({ ...before, name, updatedAt: expect.any(Number) });
      expectNameWrites(target, name, 1);
      const readback = await accountNameApi<{ data: User }>(
        fixture,
        "GET",
        `/users/${target.id}`,
      );
      expect(readback.data).toMatchObject({ ...target, name });

      await openTarget(target);
      expect(screen.getByLabelText("显示姓名")).toHaveValue(name);
      await userEvent.click(screen.getByRole("button", { name: "关闭" }));
      view.unmount();
      render(<Page />);
      await openTarget(target);
      expect(screen.getByLabelText("显示姓名")).toHaveValue(name);
      expectNameWrites(target, name, 1);
      await userEvent.click(screen.getByRole("button", { name: "关闭" }));
    },
  );

  it.each([
    ["row31", UsersPage],
    ["row33", SettingsUsersPage],
  ] as const)(
    "%s real failed update retains draft and requires explicit retry",
    async (label, Page) => {
      const target = fixture.first;
      render(<Page />);
      await openTarget(target);
      const before = readAccountName(fixture, target.id);
      setAccountNameFault(fixture, target.id);
      const name = `合成失败后重试姓名 ${label}`;
      await saveName(name);
      await waitFor(() =>
        expect(fixture.responses).toContainEqual({
          method: "PUT",
          route: `/users/${target.id}`,
          status: 500,
        }),
      );
      expect(readAccountName(fixture, target.id)).toEqual(before);
      expectNameWrites(target, name, 1);
      expect(screen.getByLabelText("显示姓名")).toHaveValue(name);
      await screen.findByRole("alert");
      expect(screen.getByRole("alert")).toHaveTextContent(
        "保存失败，修改内容已保留，请重试。",
      );
      expect(
        screen.getByRole("dialog", { name: "编辑用户" }),
      ).toBeInTheDocument();
      expect(screen.getByLabelText("显示姓名")).toHaveValue(name);
      expect(readAccountName(fixture, target.id)).toEqual(before);
      expectNameWrites(target, name, 1);
      expect(transport.success).not.toHaveBeenCalled();
      setAccountNameFault(fixture);
      await act(async () => {});
      expectNameWrites(target, name, 1);
      await userEvent.click(screen.getByRole("button", { name: "保存" }));
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(readAccountName(fixture, target.id)).toEqual({
        ...before,
        name,
        updatedAt: expect.any(Number),
      });
      expectNameWrites(target, name, 2);
      await openTarget(target);
      expect(screen.getByLabelText("显示姓名")).toHaveValue(name);
      await userEvent.click(screen.getByRole("button", { name: "关闭" }));
    },
  );

  it.each([
    ["row31", UsersPage],
    ["row33", SettingsUsersPage],
  ] as const)(
    "%s search finds independently seeded target beyond the first 100 users",
    async (label, Page) => {
      const target = fixture.later;
      const pageOne = await accountNameApi<{ data: { items: User[] } }>(
        fixture,
        "GET",
        "/users?page=1&pageSize=100",
      );
      expect(pageOne.data.items).toHaveLength(100);
      expect(pageOne.data.items.some((item) => item.id === target.id)).toBe(
        false,
      );
      const pageTwo = await accountNameApi<{ data: { items: User[] } }>(
        fixture,
        "GET",
        "/users?page=2&pageSize=100",
      );
      expect(pageTwo.data.items.some((item) => item.id === target.id)).toBe(
        true,
      );
      const view = render(<Page />);
      await openTarget(target);
      const before = readAccountName(fixture, target.id);
      const name = `合成后页保存姓名 ${label}`;
      await saveName(name);
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(readAccountName(fixture, target.id)).toEqual({
        ...before,
        name,
        updatedAt: expect.any(Number),
      });
      expectNameWrites(target, name, 1);
      view.unmount();
      render(<Page />);
      await openTarget(target);
      expect(screen.getByLabelText("显示姓名")).toHaveValue(name);
      await userEvent.click(screen.getByRole("button", { name: "关闭" }));
    },
  );
});
