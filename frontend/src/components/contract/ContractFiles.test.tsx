/** Synthetic fixtures: authenticated binary actions, interruptions, URL lifecycle and unchanged uploads. */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ContractFiles from "./ContractFiles";
import { clearExpiredAuthSessionState } from "@/lib/auth-session";
import { useAuthStore } from "@/store/auth.store";
import type { ContractFile } from "@/services/contractFile.service";
import { Role } from "@/types";
import { toast } from "sonner";

const mockUpload = vi.fn();
const mockFetchBlob = vi.fn();
vi.mock("@/services/contractFile.service", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/services/contractFile.service")>();
  return {
    ...original,
    uploadContractFile: (...args: unknown[]) => mockUpload(...args),
    deleteContractFile: vi.fn(),
    fetchContractFileBlob: (...args: unknown[]) => mockFetchBlob(...args),
  };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const file = (id = "f-1", mime = "application/pdf"): ContractFile => ({
  id,
  fileName: `${id}.${mime.startsWith("image/") ? "png" : "pdf"}`,
  filePath: "synthetic-unused",
  fileType: mime,
  mimeType: mime,
  fileSize: 100,
  uploadedAt: "2026-10-05",
  category: "SYSTEM_GENERATED_PDF",
});
const createUrl = vi.fn();
const revokeUrl = vi.fn();
const clickAnchor = vi.fn();
let sequence = 0;
const fixture = (files = [file()], contractId = "pc-1") => (
  <ContractFiles
    contractId={contractId}
    contractType="PURCHASE"
    files={files}
    onChange={vi.fn()}
  />
);
const preview = (name = "f-1.pdf") =>
  fireEvent.click(screen.getByRole("button", { name: `预览${name}` }));
const download = (name = "f-1.pdf") =>
  fireEvent.click(screen.getByRole("button", { name: `下载${name}` }));
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.clearAllMocks();
  mockUpload.mockReset();
  mockFetchBlob
    .mockReset()
    .mockResolvedValue(
      new Blob(["synthetic pdf"], { type: "application/pdf" }),
    );
  createUrl.mockImplementation(() => `blob:synthetic-${++sequence}`);
  class ObjectURL extends URL {
    static createObjectURL = createUrl;
    static revokeObjectURL = revokeUrl;
  }
  vi.stubGlobal("URL", ObjectURL);
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clickAnchor(this.href, this.download);
  });
  useAuthStore.setState({ user: null, token: null, isAuthenticated: false });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("ContractFiles", () => {
  it("区分生成件/盖章件并用按钮发起认证下载", () => {
    render(fixture([file(), { ...file("f-2"), category: "SIGNED_CONTRACT" }]));
    expect(screen.getByText("系统生成 PDF")).toBeInTheDocument();
    expect(screen.getByText("供应商盖章件")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "下载f-1.pdf" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "下载f-1.pdf" }),
    ).not.toBeInTheDocument();
  });
  it("采购分类上传保持；取消选文件和失败重试不改已有附件", async () => {
    const uploaded = { ...file("f-3"), category: "SIGNED_CONTRACT" };
    mockUpload
      .mockRejectedValueOnce(new Error("合成上传失败"))
      .mockResolvedValueOnce({ data: uploaded });
    const onChange = vi.fn();
    render(
      <ContractFiles
        contractId="pc-1"
        contractType="PURCHASE"
        files={[file()]}
        onChange={onChange}
        categoryOptions={[
          { value: "SIGNED_CONTRACT", label: "供应商盖章件" },
          { value: "PRODUCTION_PHOTO", label: "生产实物图" },
        ]}
      />,
    );
    const input = screen.getByLabelText("上传合同附件");
    fireEvent.change(input, { target: { files: [] } });
    expect(mockUpload).not.toHaveBeenCalled();
    const upload = new File(["%PDF"], "synthetic-signed.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(input, { target: { files: [upload] } });
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("合成上传失败"),
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("f-1.pdf")).toBeInTheDocument();
    fireEvent.change(input, { target: { files: [upload] } });
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith([uploaded, file()]),
    );
    expect(mockUpload).toHaveBeenLastCalledWith(
      "pc-1",
      "PURCHASE",
      upload,
      undefined,
      "SIGNED_CONTRACT",
    );
  });
  it("预览经过认证二进制服务且仅嵌入临时URL；关闭释放", async () => {
    render(fixture());
    preview();
    await waitFor(() =>
      expect(mockFetchBlob).toHaveBeenCalledWith(
        "f-1",
        expect.any(AbortSignal),
      ),
    );
    const frame = await within(screen.getByRole("dialog")).findByTitle(
      "f-1.pdf",
    );
    const url = frame.getAttribute("src");
    expect(url).toMatch(/^blob:synthetic-/);
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(revokeUrl).toHaveBeenCalledWith(url);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("重复下载拦截、文件名保留；URL延后释放以供浏览器消费", async () => {
    vi.useFakeTimers();
    const pending = deferred<Blob>();
    mockFetchBlob.mockReturnValue(pending.promise);
    render(fixture());
    download();
    download();
    expect(mockFetchBlob).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "下载f-1.pdf" })).toBeDisabled();
    await act(async () =>
      pending.resolve(new Blob(["synthetic pdf"], { type: "application/pdf" })),
    );
    expect(clickAnchor).toHaveBeenCalledWith(
      expect.stringMatching(/^blob:/),
      "f-1.pdf",
    );
    expect(revokeUrl).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(60_000));
    expect(revokeUrl).toHaveBeenCalledWith(clickAnchor.mock.calls[0][0]);
  });
  it("关闭再重开拒绝迟到预览，新文件只展示自身响应", async () => {
    const old = deferred<Blob>();
    mockFetchBlob.mockReturnValueOnce(old.promise);
    render(fixture([file(), file("f-2")]));
    preview();
    const signal = mockFetchBlob.mock.calls[0][1];
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(signal.aborted).toBe(true);
    preview("f-2.pdf");
    await within(screen.getByRole("dialog")).findByTitle("f-2.pdf");
    await act(async () =>
      old.resolve(new Blob(["old"], { type: "application/pdf" })),
    );
    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(
      document.querySelector('iframe[title="f-1.pdf"]'),
    ).not.toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });
  it("预览错误可重试；不支持的实际响应类型不被嵌入", async () => {
    mockFetchBlob
      .mockRejectedValueOnce(new Error("文件不存在"))
      .mockResolvedValueOnce(new Blob(["<svg/>"], { type: "image/svg+xml" }));
    render(fixture());
    preview();
    expect(await screen.findByRole("alert")).toHaveTextContent("文件不存在");
    fireEvent.click(screen.getByRole("button", { name: "重试预览" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "此文件类型不支持在线预览",
      ),
    );
    expect(createUrl).not.toHaveBeenCalled();
    expect(
      document.querySelector('iframe[title="f-1.pdf"]'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下载附件" })).toBeEnabled();
  });
  it("图片使用响应MIME而不是PDF元数据；解码失败释放URL", async () => {
    mockFetchBlob.mockResolvedValue(
      new Blob(["synthetic png"], { type: "image/png" }),
    );
    render(fixture());
    preview();
    const image = await screen.findByRole("img", { name: "f-1.pdf" });
    const url = image.getAttribute("src");
    fireEvent.error(image);
    expect(revokeUrl).toHaveBeenCalledWith(url);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "浏览器无法显示此附件",
    );
  });
  for (const invalidate of [
    "close",
    "expired-clear",
    "logout",
    "new-login",
    "contract",
    "unmount",
  ])
    for (const result of ["success", "failure"]) {
      it(`${invalidate}撤销已展示URL并取消迟到下载${result}，旧错误不提示`, async () => {
        const pending = deferred<Blob>();
        mockFetchBlob
          .mockResolvedValueOnce(
            new Blob(["synthetic"], { type: "application/pdf" }),
          )
          .mockReturnValueOnce(pending.promise);
        const view = render(fixture());
        preview();
        const frame = await within(screen.getByRole("dialog")).findByTitle(
          "f-1.pdf",
        );
        const url = frame.getAttribute("src");
        fireEvent.click(
          within(screen.getByRole("dialog")).getByRole("button", {
            name: "下载附件",
          }),
        );
        const signal = mockFetchBlob.mock.calls[1][1];
        act(() => {
          if (invalidate === "close")
            fireEvent.click(screen.getByRole("button", { name: "关闭" }));
          else if (invalidate === "expired-clear")
            clearExpiredAuthSessionState();
          else if (invalidate === "logout") useAuthStore.getState().logout();
          else if (invalidate === "new-login")
            useAuthStore
              .getState()
              .login(
                { id: "synthetic-user", role: Role.ADMIN } as never,
                "synthetic-tab-token",
              );
          else if (invalidate === "contract")
            view.rerender(fixture([file("f-2")], "pc-2"));
          else view.unmount();
        });
        expect(signal.aborted).toBe(true);
        expect(revokeUrl).toHaveBeenCalledWith(url);
        await act(async () => {
          if (result === "success")
            pending.resolve(new Blob(["old"], { type: "application/pdf" }));
          else pending.reject(new Error("迟到旧会话错误"));
        });
        expect(clickAnchor).not.toHaveBeenCalled();
        expect(createUrl).toHaveBeenCalledTimes(1);
        expect(toast.error).not.toHaveBeenCalled();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    }
  it("下载失败显示权限错误且允许点击重试", async () => {
    mockFetchBlob.mockRejectedValueOnce(
      new Error("仅管理员或财务可访问已确认退税清单"),
    );
    render(fixture());
    download();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "仅管理员或财务可访问已确认退税清单",
      ),
    );
    expect(clickAnchor).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "下载f-1.pdf" })).toBeEnabled();
    download();
    await waitFor(() => expect(clickAnchor).toHaveBeenCalledTimes(1));
  });
  it("老板保留原有阅读权限，不新增上传/删除动作", async () => {
    useAuthStore.setState({
      user: { id: "synthetic-boss", role: Role.BOSS } as never,
    });
    render(fixture());
    expect(
      screen.queryByRole("button", { name: "上传附件" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "删除f-1.pdf" }),
    ).not.toBeInTheDocument();
    download();
    await waitFor(() => expect(clickAnchor).toHaveBeenCalled());
  });
});
