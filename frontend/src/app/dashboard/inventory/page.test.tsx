import { beforeEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import InventoryPage from "./page";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/app/dashboard/inventory/components/InventoryTab", () => ({
  InventoryTab: () => <p>库存内容</p>,
}));
vi.mock("@/app/dashboard/inventory/components/ReceivingWorkbench", () => ({
  ReceivingWorkbench: () => <p>收货验货内容</p>,
}));

beforeEach(() => window.history.replaceState(null, "", "/dashboard/inventory"));

it("默认仍打开库存（旧链接不变），两个页签都可见", () => {
  render(<InventoryPage />);
  expect(screen.getByText("库存内容")).toBeInTheDocument();
  expect(screen.queryByText("收货验货内容")).toBeNull();
  expect(screen.getByRole("tab", { name: "收货验货" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "库存" })).toBeInTheDocument();
});

it("?tab=receiving 打开收货验货", () => {
  window.history.replaceState(null, "", "/dashboard/inventory?tab=receiving");
  render(<InventoryPage />);
  expect(screen.getByText("收货验货内容")).toBeInTheDocument();
  expect(screen.queryByText("库存内容")).toBeNull();
});
