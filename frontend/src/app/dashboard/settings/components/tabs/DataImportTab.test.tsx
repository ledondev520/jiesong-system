import { beforeEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataImportTab } from "./DataImportTab";
import * as service from "@/services/catalog-import.service";
vi.mock("@/services/catalog-import.service", () => ({
  downloadCatalogTemplate: vi.fn(),
  previewCatalog: vi.fn(),
  executeCatalog: vi.fn(),
}));
const preview = {
  canImport: true,
  summary: { total: 1, valid: 1, invalid: 0 },
  rows: [{ row: 2, values: { 名称: "合成商品" }, errors: [] }],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(service.previewCatalog).mockResolvedValue(preview);
  vi.mocked(service.executeCatalog).mockResolvedValue(1);
});
it("downloads both formats and previews without importing; changing file discards stale preview", async () => {
  const user = userEvent.setup();
  render(<DataImportTab />);
  await user.click(screen.getByRole("button", { name: "下载 CSV 模板" }));
  expect(service.downloadCatalogTemplate).toHaveBeenCalledWith(
    "products",
    "csv",
  );
  await user.click(screen.getByRole("button", { name: "下载 XLSX 模板" }));
  expect(service.downloadCatalogTemplate).toHaveBeenCalledWith(
    "products",
    "xlsx",
  );
  const file = new File(["synthetic"], "synthetic.csv", { type: "text/csv" });
  await user.upload(screen.getByLabelText("CSV 或 xlsx 文件"), file);
  await user.click(
    screen.getByRole("button", { name: "校验并预览（不落库）" }),
  );
  expect(
    await screen.findByText("共 1 行，有效 1 行，错误 0 行。"),
  ).toBeInTheDocument();
  expect(service.executeCatalog).not.toHaveBeenCalled();
  await user.upload(
    screen.getByLabelText("CSV 或 xlsx 文件"),
    new File(["changed"], "changed.csv", { type: "text/csv" }),
  );
  expect(
    screen.queryByRole("button", { name: "确认导入" }),
  ).not.toBeInTheDocument();
});
it("opening requires explicit confirmation and a successful import consumes the preview", async () => {
  const user = userEvent.setup();
  render(<DataImportTab />);
  await user.selectOptions(
    screen.getByLabelText("导入类型"),
    "opening-inventory",
  );
  const file = new File(["synthetic"], "synthetic.csv", { type: "text/csv" });
  await user.upload(screen.getByLabelText("CSV 或 xlsx 文件"), file);
  await user.click(
    screen.getByRole("button", { name: "校验并预览（不落库）" }),
  );
  const execute = await screen.findByRole("button", { name: "确认导入" });
  expect(execute).toBeDisabled();
  await user.click(screen.getByRole("checkbox"));
  await user.click(execute);
  expect(service.executeCatalog).toHaveBeenCalledWith(
    "opening-inventory",
    file,
    true,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("已导入 1 行。");
  expect(
    screen.queryByRole("button", { name: "确认导入" }),
  ).not.toBeInTheDocument();
});
it("invalid preview blocks execution and renders row errors", async () => {
  vi.mocked(service.previewCatalog).mockResolvedValue({
    ...preview,
    canImport: false,
    summary: { total: 1, valid: 0, invalid: 1 },
    rows: [{ row: 2, values: {}, errors: ["名称必填"] }],
  });
  const user = userEvent.setup();
  render(<DataImportTab />);
  await user.upload(
    screen.getByLabelText("CSV 或 xlsx 文件"),
    new File(["synthetic"], "synthetic.csv", { type: "text/csv" }),
  );
  await user.click(
    screen.getByRole("button", { name: "校验并预览（不落库）" }),
  );
  expect(await screen.findByText("名称必填")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "确认导入" })).toBeDisabled();
});
