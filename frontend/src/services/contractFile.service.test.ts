/** Shared Axios interceptors, synthetic bytes and adapter responses; no network or real credentials. */
import { Blob as NodeBlob } from "node:buffer";
import {
  AxiosError,
  type AxiosAdapter,
  type InternalAxiosRequestConfig,
} from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import api, { clearApiGetCache } from "@/lib/axios";
import { setAuthToken, clearAuthToken } from "@/lib/auth-token";
import { getAuthGeneration, setBrowserCsrf } from "@/lib/browser-session";
import {
  fetchContractFileBlob,
  isContractFilePreviewMime,
} from "./contractFile.service";
const originalAdapter = api.defaults.adapter;
const adapter = vi.fn();
const response = (
  config: InternalAxiosRequestConfig,
  data: unknown,
  status = 200,
) => ({ config, data, status, statusText: String(status), headers: {} });
beforeEach(() => {
  vi.stubGlobal("Blob", NodeBlob);
  adapter
    .mockReset()
    .mockImplementation(async (config) =>
      response(
        config,
        new Blob(["synthetic bytes"], { type: "application/pdf" }),
      ),
    );
  api.defaults.adapter = adapter as AxiosAdapter;
  clearApiGetCache();
  clearAuthToken();
  setBrowserCsrf(null);
});
afterEach(() => {
  api.defaults.adapter = originalAdapter;
  clearAuthToken();
  setBrowserCsrf(null);
  vi.unstubAllGlobals();
});
describe("contract authenticated binary service", () => {
  it("uses shared Bearer, cancellation and no-cache on every read without credentials in URL", async () => {
    setAuthToken("synthetic-tab-only");
    const controller = new AbortController();
    for (let i = 0; i < 2; i++)
      expect(
        await (
          await fetchContractFileBlob("synthetic/file", controller.signal)
        ).text(),
      ).toBe("synthetic bytes");
    expect(adapter).toHaveBeenCalledTimes(2);
    const config = adapter.mock.calls[0][0];
    expect(config.url).toBe("/files/synthetic%2Ffile/download");
    expect(config.url).not.toContain("synthetic-tab-only");
    expect(config.headers.Authorization).toBe("Bearer synthetic-tab-only");
    expect(config.withCredentials).toBe(true);
    expect(config.signal).toBe(controller.signal);
    expect(config.responseType).toBe("blob");
    expect(config.cache).toEqual({ enabled: false });
    expect(config.authGeneration).toBe(getAuthGeneration());
    expect(localStorage.getItem("jiesong_access_token")).toBeNull();
  });
  it("cookie mode needs no Bearer and keeps existing credentials/CSRF transport", async () => {
    setBrowserCsrf("synthetic-memory-proof");
    await fetchContractFileBlob("synthetic-cookie-file");
    const config = adapter.mock.calls[0][0];
    expect(config.withCredentials).toBe(true);
    expect(config.headers.Authorization).toBeUndefined();
    expect(config.headers["X-CSRF-Token"]).toBe("synthetic-memory-proof");
  });
  it.each([
    [403, "仅管理员或财务可访问已确认退税清单"],
    [404, "文件不存在"],
  ])(
    "HTTP %i JSON Blob errors retain backend message",
    async (status, message) => {
      adapter.mockImplementationOnce(async (config) => {
        throw new AxiosError(
          "synthetic HTTP failure",
          "ERR_BAD_RESPONSE",
          config,
          null,
          response(
            config,
            new Blob([JSON.stringify({ code: status, message })], {
              type: "application/json",
            }),
            status,
          ),
        );
      });
      await expect(fetchContractFileBlob("synthetic")).rejects.toThrow(message);
    },
  );
  it("invalid/HTML/oversized JSON errors cannot be shown as raw content", async () => {
    for (const body of [
      "<html>synthetic</html>",
      "{broken",
      JSON.stringify({ message: "<script>synthetic</script>" }),
      JSON.stringify({ message: "x".repeat(5000) }),
    ]) {
      adapter.mockImplementationOnce(async (config) => {
        throw new AxiosError(
          "synthetic",
          "ERR_BAD_RESPONSE",
          config,
          null,
          response(config, new Blob([body], { type: "application/json" }), 500),
        );
      });
      await expect(fetchContractFileBlob("synthetic")).rejects.toThrow(
        "附件读取失败",
      );
    }
  });
  it("empty or successful JSON bodies cannot become file downloads", async () => {
    for (const blob of [
      new Blob([]),
      new Blob(['{"code":200}'], { type: "application/json" }),
    ]) {
      adapter.mockImplementationOnce(async (config) => response(config, blob));
      await expect(fetchContractFileBlob("synthetic")).rejects.toThrow(
        "附件内容不可用",
      );
    }
  });
  it("preview allowlist excludes executable formats and Word/Excel", () => {
    for (const mime of [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "IMAGE/WEBP; charset=utf-8",
    ])
      expect(isContractFilePreviewMime(mime)).toBe(true);
    for (const mime of [
      "text/html",
      "image/svg+xml",
      "",
      "application/octet-stream",
      "application/msword",
    ])
      expect(isContractFilePreviewMime(mime)).toBe(false);
  });
});
