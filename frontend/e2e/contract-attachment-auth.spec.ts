/**
 * Input: 390/1440px production frontend, tab-scoped synthetic login and generated binary fixtures
 * Output: Authenticated downloads/image/PDF previews, failure retry and late-close/history safety
 * Pos: Attachment browser acceptance; routes are synthetic, never access business documents
 */
import { test, expect } from "@playwright/test";
import { mockApiRoutes, signInAsAdmin } from "./helpers";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=",
  "base64",
);
// Valid one-page fixture with deterministic offsets; no source business document.
const pdf = (() => {
  const stream = "BT /F1 12 Tf 20 100 Td (Synthetic attachment only) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let content = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = content.length;
    content += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = content.length;
  content += `xref\n0 6\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`;
  content += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(content);
})();

const fixtures = [
  { id: "synthetic-image", fileName: "合成附件.png", mimeType: "image/png" },
  {
    id: "synthetic-pdf",
    fileName: "合成附件.pdf",
    mimeType: "application/pdf",
  },
  {
    id: "synthetic-retry",
    fileName: "合成权限错误.png",
    mimeType: "image/png",
  },
  {
    id: "synthetic-delayed",
    fileName: "合成迟到响应.png",
    mimeType: "image/png",
  },
].map((f) => ({
  ...f,
  fileType: f.mimeType,
  fileSize: 100,
  filePath: "unused",
  uploadedAt: "2026-10-05",
  category: "OTHER",
}));
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((r) => {
    release = r;
  });
  return { release, promise };
}

for (const width of [390, 1440]) {
  test(`标签Bearer附件下载、预览、错误重试和关闭迟到 ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      const create = URL.createObjectURL.bind(URL),
        revoke = URL.revokeObjectURL.bind(URL);
      const state = { created: [] as string[], revoked: [] as string[] };
      (window as unknown as { attachmentUrls: typeof state }).attachmentUrls =
        state;
      URL.createObjectURL = (blob) => {
        const url = create(blob);
        state.created.push(url);
        return url;
      };
      URL.revokeObjectURL = (url) => {
        state.revoked.push(url);
        revoke(url);
      };
    });
    await mockApiRoutes(page);
    await page.route("**/api/v1/contracts/*/files**", (route) =>
      route.fulfill({ json: { code: 200, data: fixtures } }),
    );
    const delayed = gate();
    let delayedRequests = 0,
      retryRequests = 0;
    const reads: { path: string; auth: string | undefined }[] = [];
    await page.route("**/api/v1/files/*/download", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      reads.push({ path: url.pathname, auth: request.headers().authorization });
      expect(request.headers().authorization).toBe("Bearer e2e-mock-token");
      expect(url.search).toBe("");
      if (url.pathname.includes("synthetic-delayed")) {
        delayedRequests++;
        await delayed.promise;
      }
      if (url.pathname.includes("synthetic-retry") && ++retryRequests === 1) {
        await route.fulfill({
          status: 403,
          json: { code: 403, message: "仅管理员或财务可访问已确认退税清单" },
        });
        return;
      }
      await route.fulfill({
        body: url.pathname.includes("synthetic-pdf") ? pdf : png,
        contentType: url.pathname.includes("synthetic-pdf")
          ? "application/pdf"
          : "image/png",
      });
    });
    await signInAsAdmin(page, "/dashboard/purchase/pc-001");
    await expect(
      page.getByRole("button", { name: "预览合成附件.png", exact: true }),
    ).toBeVisible();
    expect(
      (await page.context().cookies()).some((cookie) =>
        /jiesong_session/.test(cookie.name),
      ),
    ).toBe(false);

    const incoming = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "下载合成附件.png", exact: true })
      .click();
    const downloaded = await incoming;
    expect(downloaded.suggestedFilename()).toBe("合成附件.png");
    const stream = await downloaded.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks)).toEqual(png);

    const dialog = page.getByRole("dialog");
    await page
      .getByRole("button", { name: "预览合成附件.png", exact: true })
      .click();
    const image = dialog.getByRole("img", { name: "合成附件.png" });
    await expect(image).toHaveAttribute("src", /^blob:/);
    await expect
      .poll(() =>
        image.evaluate((node) => (node as HTMLImageElement).naturalWidth),
      )
      .toBe(1);
    const imageUrl = await image.getAttribute("src");
    await dialog.getByRole("button", { name: "关闭", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(
      await page.evaluate(
        (url) =>
          (
            window as unknown as { attachmentUrls: { revoked: string[] } }
          ).attachmentUrls.revoked.includes(url!),
        imageUrl,
      ),
    ).toBe(true);

    await page
      .getByRole("button", { name: "预览合成附件.pdf", exact: true })
      .click();
    await expect(
      dialog.locator('iframe[title="合成附件.pdf"]'),
    ).toHaveAttribute("src", /^blob:/);
    await expect(dialog.getByText(/PDF 显示取决于浏览器支持/)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();

    await page
      .getByRole("button", { name: "预览合成权限错误.png", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "仅管理员或财务可访问已确认退税清单",
    );
    await dialog.getByRole("button", { name: "重试预览" }).click();
    await expect(
      dialog.getByRole("img", { name: "合成权限错误.png" }),
    ).toHaveAttribute("src", /^blob:/);
    expect(retryRequests).toBe(2);
    await dialog.getByRole("button", { name: "关闭", exact: true }).click();

    await page
      .getByRole("button", { name: "预览合成迟到响应.png", exact: true })
      .click();
    await expect.poll(() => delayedRequests).toBe(1);
    await expect(dialog.getByRole("status")).toHaveText(/正在加载附件/);
    await dialog.getByRole("button", { name: "关闭", exact: true }).click();
    const before = await page.evaluate(
      () =>
        (window as unknown as { attachmentUrls: { created: string[] } })
          .attachmentUrls.created.length,
    );
    delayed.release();
    await page
      .getByRole("button", { name: "预览合成附件.png", exact: true })
      .click();
    await expect(
      dialog.getByRole("img", { name: "合成附件.png" }),
    ).toHaveAttribute("src", /^blob:/);
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { attachmentUrls: { created: string[] } })
            .attachmentUrls.created.length,
      ),
    ).toBe(before + 1);
    await dialog.getByRole("button", { name: "关闭", exact: true }).click();
    await page.goto("/dashboard/suppliers");
    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard\/purchase\/pc-001$/);
    await expect(dialog).not.toBeVisible();
    expect(reads.length).toBeGreaterThanOrEqual(7);
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
