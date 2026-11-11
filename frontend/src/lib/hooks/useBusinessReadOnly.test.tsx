import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Role } from "@/types";
import { BusinessWrite } from "./useBusinessReadOnly";

const auth = vi.hoisted(() => ({ role: "BOSS" as string | undefined }));
vi.mock("@/store/auth.store", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: auth.role ? { role: auth.role } : null }),
}));
afterEach(cleanup);

it("OD-8：停用角色只保留阅读，ADMIN/SALES 保留写操作", () => {
  const content = () => (
    <>
      <button>筛选</button>
      <BusinessWrite>
        <button>保存合同</button>
      </BusinessWrite>
    </>
  );
  auth.role = "BOSS";
  const view = render(content());
  expect(screen.getByRole("button", { name: "筛选" })).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "保存合同" }),
  ).not.toBeInTheDocument();
  for (const role of [Role.ADMIN, Role.SALES, undefined]) {
    auth.role = role;
    view.rerender(content());
    expect(
      screen.getByRole("button", { name: "保存合同" }),
    ).toBeInTheDocument();
  }
});
