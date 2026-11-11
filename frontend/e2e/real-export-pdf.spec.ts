/**
 * Input: Real SALES login, existing private role fixture order and the 导出 PDF button
 * Output: One case asserting the downloaded loading-plan PDF bytes (A4 portrait pages, size, page count) for the single-page fixture and for a forced multi-page layout, plus the real-DOM page-break rule using the product's PDF_BREAK_SELECTOR
 * Pos: Hosted Chromium acceptance for containerExport.ts / ContainerPrintView.tsx (no product code)
 */
import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { PDF_BREAK_SELECTOR } from "../src/components/container/containerExport";
import {
  startRoleFixture,
  stopRoleFixture,
  forwardRealApi,
  loginAs,
  type RoleFixture,
} from "./real-role-fixture";

test.use({ viewport: { width: 1440, height: 900 } });
test("SALES 导出 PDF downloads A4 portrait pages and never separates a heading from its first row", async ({
  page,
}) => {
  test.setTimeout(90000);
  let fixture: RoleFixture | undefined;
  try {
    fixture = await startRoleFixture("menu-export-documents");
    await forwardRealApi(page, fixture);
    await loginAs(page, fixture, "SALES");
    await page.goto(`/dashboard/orders/${fixture.salesId}`);
    await page.getByRole("tab", { name: "货柜", exact: true }).click();
    const panel = page.getByRole("tabpanel", { name: "货柜", exact: true });
    await expect(panel.getByText("已装: 2 箱", { exact: true })).toBeVisible();

    // 0. Real-DOM break rule, using the exported selector collectBreaks() itself uses
    // (so dropping `:not(:first-child)` there fails here): the first body row of a table
    // is never a break, otherwise the h3 + header would be stranded on the previous page.
    const printPages = page.getByTestId("container-print-page");
    const containers = await printPages.count();
    expect(containers).toBeGreaterThan(0);
    const layout = await page.evaluate(
      (breakSelector) =>
        Array.from(
          document.querySelectorAll<HTMLElement>(
            '[data-testid="container-print-page"]',
          ),
        ).flatMap((root) => {
          const top = root.getBoundingClientRect().top;
          const breaks = Array.from(root.querySelectorAll(breakSelector)).map(
            (node) => node.getBoundingClientRect().top - top,
          );
          return Array.from(root.querySelectorAll("h3")).map((h3) => {
            const first = h3.parentElement!.querySelector("tbody tr");
            const rowTop = first!.getBoundingClientRect().top - top;
            const h3Top = h3.getBoundingClientRect().top - top;
            return {
              blockIsBreak: breaks.some((b) => Math.abs(b - h3Top) < 1),
              firstRowIsBreak: breaks.some((b) => Math.abs(b - rowTop) < 1),
            };
          });
        }),
      PDF_BREAK_SELECTOR,
    );
    expect(layout.length).toBeGreaterThan(0);
    for (const block of layout) {
      expect(block.firstRowIsBreak).toBe(false);
      expect(block.blockIsBreak).toBe(true);
    }

    // 1. The download itself: bytes, size, page geometry and count.
    const exportPdf = async () => {
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 60000 }),
        panel.getByRole("button", { name: "导出 PDF" }).click(),
      ]);
      expect(download.suggestedFilename()).toMatch(/-装柜图\.pdf$/);
      const bytes = await readFile((await download.path())!);
      expect(bytes.subarray(0, 4).toString("latin1")).toBe("%PDF");
      expect(bytes.length).toBeLessThan(5 * 1024 * 1024);
      const pdf = bytes.toString("latin1");
      const boxes = Array.from(pdf.matchAll(/\/MediaBox\s*\[([^\]]+)\]/g)).map(
        (match) => match[1].trim().split(/\s+/).map(Number),
      );
      const pages = pdf.match(/\/Type\s*\/Page\b(?!s)/g)?.length ?? 0;
      expect(boxes.length).toBe(pages);
      for (const [x0, y0, width, height] of boxes) {
        expect([x0, y0]).toEqual([0, 0]);
        expect(Math.abs(width - 595)).toBeLessThanOrEqual(1);
        expect(Math.abs(height - 842)).toBeLessThanOrEqual(1);
      }
      return pages;
    };
    expect(await exportPdf()).toBeGreaterThanOrEqual(containers);

    // 2. Multi-page path (planSlices/collectBreaks): the fixture alone fits one A4 page,
    // so test-only CSS makes every body cell 800px tall. Assert the precondition on the
    // real DOM (a print page taller than one A4 page of its own width) before the export.
    await page.addStyleTag({
      content: "#container-print-root tbody td { height: 800px }",
    });
    const tooTall = await printPages.evaluateAll((nodes) =>
      (nodes as HTMLElement[]).every(
        (root) => root.offsetHeight > (297 / 210) * root.offsetWidth,
      ),
    );
    expect(tooTall).toBe(true);
    expect(await exportPdf()).toBeGreaterThan(containers);
  } finally {
    if (fixture) await stopRoleFixture(fixture);
  }
});
