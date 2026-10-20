/**
 * Input: 报关单服务与 API 实例
 * Output: 报关单服务接口单元测试
 * Pos: 前端业务服务测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import api from "@/lib/axios";
import { customsDeclarationService } from "./customsDeclaration.service";
import { CustomsDeclarationStatus } from "@/types";

vi.mock("@/lib/axios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("customsDeclarationService", () => {
  it("getAll 传递筛选参数", async () => {
    const params = {
      page: 1,
      pageSize: 20,
      keyword: "CUS",
      status: "SUBMITTED",
    };

    await customsDeclarationService.getAll(params);

    expect(api.get).toHaveBeenCalledWith("/customs-declarations", { params });
  });

  it("getById 调用详情接口", async () => {
    await customsDeclarationService.getById("cd-1");

    expect(api.get).toHaveBeenCalledWith("/customs-declarations/cd-1");
  });

  it("create 调用新增接口", async () => {
    const payload = {
      declarationNo: "CUS-2026-001",
      status: CustomsDeclarationStatus.DRAFT,
      salesContractId: "synthetic-sales",
      customsBroker: "合成报关行",
      declaredAt: "2026-03-01",
      exportDate: null,
      currency: "USD",
      totalAmount: 120000,
      totalQuantity: 1800,
      totalGrossWeight: 21500,
      totalNetWeight: 20800,
      note: "",
      items: [],
    };

    await customsDeclarationService.create(payload);

    expect(api.post).toHaveBeenCalledWith("/customs-declarations", payload);
  });

  it("update 调用更新接口", async () => {
    const payload = {
      declarationNo: "CUS-2026-001",
      status: CustomsDeclarationStatus.DECLARED,
      salesContractId: "synthetic-sales",
      customsBroker: "合成报关行",
      declaredAt: "2026-03-01",
      exportDate: null,
      currency: "USD",
      totalAmount: 120000,
      totalQuantity: 1800,
      totalGrossWeight: 21500,
      totalNetWeight: 20800,
      note: "待放行",
      items: [],
    };

    await customsDeclarationService.update("cd-1", payload);

    expect(api.put).toHaveBeenCalledWith("/customs-declarations/cd-1", payload);
  });

  it("generateDrafts 调用自动草稿接口", async () => {
    const payload = {
      salesContractId: "sc-1",
      replaceExisting: true,
    };

    await customsDeclarationService.generateDrafts(payload);

    expect(api.post).toHaveBeenCalledWith(
      "/customs-declarations/auto-drafts",
      payload,
    );
  });
});
