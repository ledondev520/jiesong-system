import { afterEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import NotFoundPage from "./not-found";
import { clearAuthToken, setAuthToken } from "@/lib/auth-token";

describe("NotFoundPage", () => {
  afterEach(() => clearAuthToken());

  it("提供业务友好的 404 文案与返回入口，且标题是唯一的 h1", () => {
    render(<NotFoundPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "页面不存在" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "返回工作台" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(screen.getByRole("link", { name: "返回登录页" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("未登录时主按钮是返回登录页，已登录时是返回工作台", async () => {
    const { unmount } = render(<NotFoundPage />);
    const first = () => screen.getAllByRole("link")[0].textContent;
    expect(first()).toBe("返回登录页");
    unmount();

    setAuthToken("test-token");
    render(<NotFoundPage />);
    await waitFor(() => expect(first()).toBe("返回工作台"));
  });
});
