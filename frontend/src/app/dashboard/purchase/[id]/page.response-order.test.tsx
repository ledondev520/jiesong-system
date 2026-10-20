/**
 * Input: 采购详情页 id 切换时旧/新详情请求在同一轮内先后结算
 * Output: 成功/失败处理相对顺序与原 async try/await 一致的回归测试
 * Pos: 前端采购详情页加载时序测试
 */

import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { Suspense } from "react";
import PurchaseDetailPage from "./page";

const mockGetById = vi.hoisted(() => vi.fn());

vi.mock("@/services/purchase.service", () => ({
  purchaseService: { getById: (...args: unknown[]) => mockGetById(...args) },
}));
vi.mock("@/services/contractFile.service", () => ({
  listContractFiles: async () => ({ data: [] }),
}));
vi.mock("@/services/contractDoc.service", () => ({ contractDocService: {} }));
vi.mock("@/services/config.service", () => ({ configService: {} }));
vi.mock("@/lib/api-cache", () => ({ invalidateCache: vi.fn() }));
vi.mock("@/components/contract/ContractFiles", () => ({ default: () => null }));
vi.mock("./components/PurchaseReceiptPanel", () => ({
  PurchaseReceiptPanel: () => null,
}));
vi.mock("./components/PurchaseFlowPanel", () => ({
  PurchaseFlowPanel: () => null,
}));
vi.mock("./components/PurchaseProductionPanel", () => ({
  PurchaseProductionPanel: () => null,
}));
vi.mock("@/lib/hooks/useBusinessReadOnly", () => ({
  useBusinessReadOnly: () => true,
  BusinessWrite: () => null,
}));
vi.mock("@/lib/hooks/useMobile", () => ({ useMobile: () => false }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
  usePathname: () => "/dashboard/purchase/A",
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const contractB = {
  id: "B",
  contractNo: "CG-ORDER-B",
  status: "DRAFT",
  totalAmount: 0,
  paidAmount: 0,
  supplier: { name: "合成供应商" },
  items: [],
};

describe("PurchaseDetailPage 详情响应处理顺序", () => {
  it('切换合同后旧请求 404 与新请求成功同一轮结算时，展示新合同而非"合同不存在"', async () => {
    const oldRequest = deferred<unknown>();
    const newRequest = deferred<unknown>();
    mockGetById.mockImplementation((id: string) =>
      id === "A" ? oldRequest.promise : newRequest.promise,
    );
    const paramsA = Promise.resolve({ id: "A" });
    const paramsB = Promise.resolve({ id: "B" });
    const renderWith = (params: Promise<{ id: string }>) => (
      <Suspense fallback={<div>页面加载中...</div>}>
        <PurchaseDetailPage params={params} />
      </Suspense>
    );

    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(renderWith(paramsA));
      await paramsA;
    });
    await waitFor(() => expect(mockGetById).toHaveBeenCalledWith("A"));
    await act(async () => {
      view.rerender(renderWith(paramsB));
      await paramsB;
    });
    await waitFor(() => expect(mockGetById).toHaveBeenCalledWith("B"));

    await act(async () => {
      oldRequest.reject({ code: 404 });
      newRequest.resolve({ data: contractB });
    });

    expect(
      await screen.findByRole("heading", { name: "CG-ORDER-B" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("合同不存在")).not.toBeInTheDocument();
  });
});
