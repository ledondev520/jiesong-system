/**
 * Input: Production frontend, real auth/CLI-ingested library and private committed-migration SQLite
 * Output: Six ADMIN/FINANCE source/row/page/reload and interrupted-read acceptance definitions
 * Pos: Hosted library UI acceptance; distinct from monthly statement upload, no response mocks
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import { expect, test, type Page } from "@playwright/test";
import {
  forwardLibraryApi,
  loginLibrary,
  readLibraryDatabase,
  startLibraryFixture,
  stopLibraryFixture,
  type LibraryFixture,
} from "./financial-library-fixture";

for (const width of [390, 1440]) {
  test.describe(`financial library ${width}px`, () => {
    test.use({ viewport: { width, height: 1000 } });
    let fixture: LibraryFixture;
    let pageErrors: string[];
    test.beforeEach(async ({ page }) => {
      pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      fixture = await startLibraryFixture();
      await forwardLibraryApi(page, fixture);
    });
    test.afterEach(async () => {
      if (fixture) await stopLibraryFixture(fixture);
      expect(pageErrors).toEqual([]);
    });

    /**
     * 职责：登录现有角色后进入财务报表内唯一资料库区域。
     * @param page 真实前端页面
     * @param role 已有角色
     * @returns 资料库定位器
     */
    async function enterLibrary(page: Page, role: "ADMIN" | "FINANCE") {
      await loginLibrary(page, fixture, role);
      await page.goto("/dashboard/finance/statements");
      const library = page.getByTestId("financial-evidence-library");
      await expect(library).toBeVisible();
      await expect(
        library.getByText("总账.xlsx", { exact: true }),
      ).toBeVisible();
      return library;
    }

    for (const role of ["FINANCE", "ADMIN"] as const) {
      test(`${role} reads actual source sheets, ordered pages, redactions and reload without library writes`, async ({
        page,
      }) => {
        const library = await enterLibrary(page, role);
        const before = readLibraryDatabase(fixture);
        await expect(
          library.getByText("2 份资料", { exact: true }),
        ).toBeVisible();
        await expect(library.getByText("61 行", { exact: true })).toBeVisible();
        await expect(
          library.getByText("8 处脱敏", { exact: true }),
        ).toBeVisible();
        await expect(
          library.getByRole("row").filter({ hasText: "合成账行1" }).first(),
        ).toContainText("125.5");
        await library
          .getByRole("button", { name: "下一页", exact: true })
          .click();
        await expect(
          library.getByText("第 2 / 2 页", { exact: true }),
        ).toBeVisible();
        await expect(
          library.getByRole("row").filter({ hasText: "合计" }),
        ).toContainText("645.5");
        await expect(
          library
            .getByRole("row")
            .filter({ hasText: "合计" })
            .getByRole("cell")
            .first(),
        ).toHaveText("58");
        await library
          .getByRole("button", { name: "备注（2）", exact: true })
          .click();
        await expect(
          library.getByRole("row").filter({ hasText: "合成来源备注" }),
        ).toContainText("是");
        await expect(
          library.getByRole("row").filter({ hasText: "保留尾注" }),
        ).toContainText("-7.5");
        await library.getByRole("button", { name: /工资.*2026-09/ }).click();
        await expect(
          library.getByText("工资表.xls", { exact: true }),
        ).toBeVisible();
        await expect(
          library.getByRole("cell", { name: "1234.5", exact: true }),
        ).toBeVisible();
        await expect(
          library.getByRole("cell", { name: "<已脱敏>", exact: true }),
        ).toHaveCount(8);
        await page.reload();
        await expect(
          library.getByText("总账.xlsx", { exact: true }),
        ).toBeVisible();
        expect(readLibraryDatabase(fixture)).toEqual(before);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
      });
    }

    test("FINANCE empty filters and late old-sheet responses cannot restore an unrelated source", async ({
      page,
    }) => {
      const library = await enterLibrary(page, "FINANCE");
      const before = readLibraryDatabase(fixture);
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      let received!: () => void;
      const delivered = new Promise<void>((resolve) => {
        received = resolve;
      });
      let releaseFinished!: () => void;
      const finished = new Promise<void>((resolve) => {
        releaseFinished = resolve;
      });
      const pattern = `**/api/v1/finance/statements/evidence/documents/${fixture.documents.GENERAL_LEDGER}?**`;
      await page.route(pattern, async (route) => {
        const original = new URL(route.request().url());
        if (!original.searchParams.has("sheetId")) {
          await route.fallback();
          return;
        }
        const response = await route.fetch({
          url: `${fixture.baseURL}${original.pathname}${original.search}`,
          maxRedirects: 0,
        });
        received();
        await held;
        await route.fulfill({ response });
        releaseFinished();
      });
      try {
        await library
          .getByRole("button", { name: "备注（2）", exact: true })
          .click();
        await delivered;
        await library.getByRole("button", { name: /工资.*2026-09/ }).click();
        await expect(
          library.getByText("工资表.xls", { exact: true }),
        ).toBeVisible();
        release();
        await finished;
        await expect(
          library.getByText("工资表.xls", { exact: true }),
        ).toBeVisible();
        await expect(
          library.getByText("合成来源备注", { exact: true }),
        ).toHaveCount(0);
      } finally {
        release();
        await page.unroute(pattern);
      }
      await library.getByRole("combobox").nth(0).click();
      await page
        .getByRole("option", { name: "工资（1）", exact: true })
        .click();
      await library.getByRole("combobox").nth(1).click();
      await page.getByRole("option", { name: "2026-10", exact: true }).click();
      await expect(
        library.getByText("当前筛选 0 份", { exact: true }),
      ).toBeVisible();
      await expect(
        library.getByText("工资表.xls", { exact: true }),
      ).toHaveCount(0);
      await expect(library.getByRole("table")).toHaveCount(0);
      await library.getByRole("combobox").nth(0).click();
      await page.getByRole("option", { name: "全部分类", exact: true }).click();
      await expect(
        library.getByText("总账.xlsx", { exact: true }),
      ).toBeVisible();
      expect(readLibraryDatabase(fixture)).toEqual(before);
    });
  });
}
