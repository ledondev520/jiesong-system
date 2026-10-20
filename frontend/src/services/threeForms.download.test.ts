/**
 * Input: Real Axios interceptors, synthetic Blob adapter and browser download helpers
 * Output: Download filename/byte, uncached repeat and rejected-response regression checks
 * Pos: Three-form export transport test; no network, browser launch or real documents
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import { Blob as NodeBlob } from "node:buffer";
import {
  AxiosError,
  type AxiosAdapter,
  type InternalAxiosRequestConfig,
} from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import api, { clearApiGetCache } from "@/lib/axios";
import { threeFormsService } from "./threeForms.service";

const originalAdapter = api.defaults.adapter;
const adapter = vi.fn();
const createObjectURL = vi.fn<(blob: Blob) => string>(
  () => "blob:synthetic-three-forms",
);
const revokeObjectURL = vi.fn();
const filename = "三张表_EXP-SYNTHETIC_2026-10-06.xlsx";
const mime =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
let clicked: { name: string; href: string; connected: boolean }[];
/** 职责：构造真实拦截器消费的合成响应
 * @param config 实际 Axios 请求配置
 * @param data 合成二进制内容
 * @returns 带 UTF-8 文件名响应头的成功响应 */
const response = (config: InternalAxiosRequestConfig, data: Blob) => ({
  config,
  data,
  status: 200,
  statusText: "OK",
  headers: {
    "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
  },
});

beforeEach(() => {
  vi.stubGlobal("Blob", NodeBlob);
  vi.stubGlobal(
    "URL",
    Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL }),
  );
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  clicked = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push({
      name: this.download,
      href: this.href,
      connected: this.isConnected,
    });
  });
  adapter
    .mockReset()
    .mockImplementation(async (config) =>
      response(config, new Blob(["PK-synthetic-xlsx"], { type: mime })),
    );
  api.defaults.adapter = adapter as AxiosAdapter;
  clearApiGetCache();
});
afterEach(() => {
  api.defaults.adapter = originalAdapter;
  clearApiGetCache();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("three forms download through real Axios interceptors", () => {
  it("saves the exact returned Blob with the HTTP filename after Axios unwrapping", async () => {
    await threeFormsService.downloadExcel("synthetic-contract", {
      customsDeclarationId: "synthetic-customs",
      forexId: "synthetic-forex",
      taxRefundId: "synthetic-refund",
    });
    expect(adapter).toHaveBeenCalledTimes(1);
    const config = adapter.mock.calls[0][0];
    expect(config.url).toBe(
      "/three-forms/export/synthetic-contract?customsDeclarationId=synthetic-customs&forexId=synthetic-forex&taxRefundId=synthetic-refund",
    );
    expect(config.responseType).toBe("blob");
    expect(config.withCredentials).toBe(true);
    expect(await createObjectURL.mock.calls[0][0].text()).toBe(
      "PK-synthetic-xlsx",
    );
    expect(clicked).toEqual([
      { name: filename, href: "blob:synthetic-three-forms", connected: true },
    ]);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:synthetic-three-forms");
    expect(document.querySelector("a[download]")).toBeNull();
  });
  it("repeated export reads obtain each current response instead of JSON GET cache", async () => {
    for (const value of ["PK-first-version", "PK-current-version"]) {
      adapter.mockImplementationOnce(async (config) =>
        response(config, new Blob([value], { type: mime })),
      );
      await threeFormsService.downloadExcel("synthetic-contract");
    }
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(
      adapter.mock.calls.every(([config]) => config.cache?.enabled === false),
    ).toBe(true);
    expect(await createObjectURL.mock.calls[0][0].text()).toBe(
      "PK-first-version",
    );
    expect(await createObjectURL.mock.calls[1][0].text()).toBe(
      "PK-current-version",
    );
    expect(clicked).toHaveLength(2);
  });
  it.each([
    ["", "三张表_synthetic-contract.xlsx"],
    ['attachment; filename="synthetic-export.xlsx"', "synthetic-export.xlsx"],
  ])(
    "uses missing/quoted filename headers correctly: %s",
    async (header, expected) => {
      adapter.mockImplementationOnce(async (config) => ({
        ...response(config, new Blob(["PK-header-case"], { type: mime })),
        headers: { "content-disposition": header },
      }));
      await threeFormsService.downloadExcel("synthetic-contract");
      expect(clicked[0].name).toBe(expected);
      expect(await createObjectURL.mock.calls[0][0].text()).toBe(
        "PK-header-case",
      );
    },
  );
  it("genuine rejected export creates no download and needs an explicit next request", async () => {
    const errorBody = new Blob(
      ['{"code":400,"message":"合成导出资料不完整"}'],
      { type: "application/json" },
    );
    adapter.mockImplementationOnce(async (config) => {
      throw new AxiosError(
        "synthetic export rejection",
        "ERR_BAD_RESPONSE",
        config,
        null,
        {
          ...response(config, errorBody),
          status: 400,
          statusText: "Bad Request",
        },
      );
    });
    await expect(
      threeFormsService.downloadExcel("synthetic-contract"),
    ).rejects.toBe(errorBody);
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(clicked).toEqual([]);
    await threeFormsService.downloadExcel("synthetic-contract");
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(clicked).toHaveLength(1);
  });
});
