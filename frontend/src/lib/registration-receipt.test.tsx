import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { RegistrationReceiptPanel } from "@/components/auth/RegistrationReceiptPanel";
import {
  clearRegistrationReceipt,
  saveRegistrationReceipt,
  useRegistrationReceipt,
} from "./registration-receipt";

function Receipt() {
  const receipt = useRegistrationReceipt();
  return receipt ? (
    <RegistrationReceiptPanel receipt={receipt} />
  ) : (
    <p>无提交回执</p>
  );
}
describe("registration receipt", () => {
  beforeEach(() => clearRegistrationReceipt());
  it("跨重新挂载保留提交回执，清除后不再显示", () => {
    saveRegistrationReceipt("applicant@example.com");
    const first = render(<Receipt />);
    expect(
      screen.getByText("申请账号：applicant@example.com"),
    ).toBeInTheDocument();
    first.unmount();
    render(<Receipt />);
    expect(
      screen.getByRole("region", { name: "注册申请回执" }),
    ).toBeInTheDocument();
    act(() => clearRegistrationReceipt());
    expect(screen.getByText("无提交回执")).toBeInTheDocument();
  });
  it("坏的本地回执不导致页面崩溃", () => {
    sessionStorage.setItem("jiesong_registration_receipt", "not-json");
    render(<Receipt />);
    expect(screen.getByText("无提交回执")).toBeInTheDocument();
  });
  it("复制失败提供手动恢复说明，不自动发送给管理员", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    saveRegistrationReceipt("applicant@example.com");
    render(<Receipt />);
    fireEvent.click(screen.getByRole("button", { name: "复制给管理员的说明" }));
    expect(await screen.findByRole("status")).toHaveTextContent("请手动复制");
  });
});
