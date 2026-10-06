/**
 * Input: Real SALES login/menu, existing private role fixture and rendered canvas pixels
 * Output: One 3D lifecycle case with independent zero-write readback and page/console error checks
 * Pos: Hosted Chromium acceptance for the existing export-detail visualization
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  startRoleFixture,
  stopRoleFixture,
  forwardRealApi,
  loginAs,
  readExportDocuments,
  type RoleFixture,
} from "./real-role-fixture";

interface RenderedFrame {
  signature: string;
  paintedPixels: number;
  coloredPixels: number;
  width: number;
  height: number;
  cssWidth: number;
  cssHeight: number;
  left: number;
  right: number;
  viewportWidth: number;
}

/**
 * 职责：读取真实画布输出，区分透明空白、灰色框架及商品有色像素
 * 思路：跨两个浏览器动画帧后复制已有 preserveDrawingBuffer 画布；不读取 Three 内部状态。
 * @param canvas 当前可视化唯一的真实 canvas 定位器
 * @returns 实际像素指纹、绘制数量及画布尺寸
 * @throws 画布未初始化、像素不可读取或二维复制上下文不可用
 */
async function readRenderedFrame(canvas: Locator): Promise<RenderedFrame> {
  return canvas.evaluate(async (element) => {
    // 0. Let the previous animation frame reach the browser's rendered output.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const source = element as HTMLCanvasElement;
    if (!source.width || !source.height)
      throw new Error("3D canvas has no pixels");

    // 1. Read only GPU output. DOM statistics/tooltips cannot satisfy this check.
    const copy = document.createElement("canvas");
    copy.width = 512;
    copy.height = 256;
    const context = copy.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas pixel observation is unavailable");
    context.drawImage(source, 0, 0, copy.width, copy.height);
    const pixels = context.getImageData(0, 0, copy.width, copy.height).data;
    let hash = 2166136261;
    let paintedPixels = 0;
    let coloredPixels = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const [red, green, blue, alpha] = pixels.subarray(index, index + 4);
      hash = Math.imul(hash ^ red, 16777619);
      hash = Math.imul(hash ^ green, 16777619);
      hash = Math.imul(hash ^ blue, 16777619);
      hash = Math.imul(hash ^ alpha, 16777619);
      if (alpha > 16) {
        paintedPixels += 1;
        // Frame/grid/labels are grayscale; the seeded boxes use a colored material.
        if (Math.max(red, green, blue) - Math.min(red, green, blue) > 24)
          coloredPixels += 1;
      }
    }
    const bounds = source.getBoundingClientRect();
    return {
      signature: (hash >>> 0).toString(16),
      paintedPixels,
      coloredPixels,
      width: source.width,
      height: source.height,
      cssWidth: bounds.width,
      cssHeight: bounds.height,
      left: bounds.left,
      right: bounds.right,
      viewportWidth: window.innerWidth,
    };
  });
}

/**
 * 职责：等待有色商品实际绘制、像素稳定且画布比例已响应布局
 * 思路：连续三次真实绘制观测一致才就绪；不按任意等待时间或截图基线猜测场景完成。
 * @param canvas 当前真实画布
 * @returns 最后一个稳定且非空白的可见绘制结果
 * @throws 10秒内没有实际商品像素、稳定帧或正确画布比例
 */
async function waitForRenderedFrame(canvas: Locator): Promise<RenderedFrame> {
  let result: RenderedFrame | undefined;
  let previous = "";
  let consecutive = 0;
  await expect
    .poll(
      async () => {
        result = await readRenderedFrame(canvas);
        const observation = `${result.width}:${result.height}:${result.cssWidth}:${result.cssHeight}:${result.signature}`;
        consecutive = observation === previous ? consecutive + 1 : 1;
        previous = observation;
        return (
          result.paintedPixels > 20 &&
          result.coloredPixels >= 4 &&
          result.cssWidth > 0 &&
          result.cssHeight > 0 &&
          Math.abs(
            result.width / result.height - result.cssWidth / result.cssHeight,
          ) < 0.01 &&
          consecutive >= 3
        );
      },
      {
        timeout: 10000,
        message:
          "3D must paint colored cargo and settle at its visible aspect ratio",
      },
    )
    .toBe(true);
  if (!result) throw new Error("No rendered 3D observation");
  return result;
}

/**
 * 职责：执行既有旋转/缩放/平移手势，并核对真实绘制结果发生变化
 * @param page 当前浏览器页面
 * @param canvas 当前可视化画布
 * @param gesture 界面明确支持的鼠标手势
 * @returns 稳定绘制后的 Promise
 * @throws 手势不改变可见画布、商品消失或画布尺寸意外变化
 */
async function exerciseControl(
  page: Page,
  canvas: Locator,
  gesture: "rotate" | "zoom" | "pan",
) {
  // 0. Remove hover highlighting before both pixel observations.
  await page.mouse.move(1, 1);
  const before = await waitForRenderedFrame(canvas);
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("3D canvas is not visible");
  const x = bounds.x + bounds.width * 0.6;
  const y = bounds.y + bounds.height * 0.5;
  await page.mouse.move(x, y);

  // 1. Keep gestures away from the existing statistics/help overlays.
  if (gesture === "zoom") {
    await page.mouse.wheel(0, -240);
  } else {
    const button = gesture === "pan" ? "right" : "left";
    await page.mouse.down({ button });
    await page.mouse.move(
      x + bounds.width * (gesture === "pan" ? 0.025 : 0.04),
      y + bounds.height * 0.02,
      { steps: 6 },
    );
    await page.mouse.up({ button });
  }
  await page.mouse.move(1, 1);
  const after = await waitForRenderedFrame(canvas);
  expect(after.width).toBe(before.width);
  expect(after.height).toBe(before.height);
  expect(
    after.signature,
    `${gesture} must change rendered scene pixels`,
  ).not.toBe(before.signature);
}

/**
 * 职责：打开既有 3D 页签并核对合成缺尺寸货物的统计与实际绘制
 * @param page 当前出口详情页面
 * @returns 当前真实画布的定位器
 * @throws 页签、真实箱数、尺寸预估提示或商品绘制缺失
 */
async function openVisualization(page: Page): Promise<Locator> {
  await page.getByRole("tab", { name: "3D 可视化", exact: true }).click();
  const panel = page.getByRole("tabpanel", { name: "3D 可视化", exact: true });
  await expect(panel.getByText("已装: 2 箱", { exact: true })).toBeVisible();
  await expect(panel.getByText("未装: 0 箱", { exact: true })).toBeVisible();
  await expect(
    panel.getByText("⚠ 1 项尺寸已预估", { exact: true }),
  ).toBeVisible();
  await expect(panel.getByText("拖拽旋转 | 滚轮缩放 | 右键平移")).toBeVisible();
  const canvas = panel.locator("canvas");
  await expect(canvas).toHaveCount(1);
  await canvas.scrollIntoViewIfNeeded();
  await page.mouse.move(1, 1);
  await waitForRenderedFrame(canvas);
  return canvas;
}

test.use({ viewport: { width: 1440, height: 900 } });
test("SALES 3D canvas renders estimated cargo, controls and resize survive tab return/reload without writes", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  const consoleErrors: string[] = [];
  const writes: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Shader-link failures can log console.error without an uncaught exception.
  // Keep every console error, including WebGL, even if colored outlines render.
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (
      pathname.startsWith("/api/v1/") &&
      !["GET", "HEAD", "OPTIONS"].includes(request.method()) &&
      pathname !== "/api/v1/auth/login"
    ) {
      writes.push(`${request.method()} ${pathname}`);
    }
  });
  let fixture: RoleFixture | undefined;
  try {
    // 0. Reuse migrated private SQLite and unchanged real HTTP, without new seeds.
    fixture = await startRoleFixture("menu-export-documents");
    await forwardRealApi(page, fixture);
    await loginAs(page, fixture, "SALES");
    await page.getByRole("link", { name: "出口", exact: true }).first().click();
    await expect(page).toHaveURL(/\/dashboard\/sales$/);
    await page
      .getByRole("button", { name: `查看合同 ${fixture.salesNo}`, exact: true })
      .click();
    await expect(page).toHaveURL(`/dashboard/sales/${fixture.salesId}`);
    await expect(
      page.getByRole("heading", { name: fixture.salesNo!, exact: true }),
    ).toBeVisible();
    const before = readExportDocuments(fixture);

    // 1. All advertised mouse controls must affect real painted output.
    let canvas = await openVisualization(page);
    for (const gesture of ["rotate", "zoom", "pan"] as const)
      await exerciseControl(page, canvas, gesture);
    expect(readExportDocuments(fixture)).toEqual(before);

    // 2. Observe ResizeObserver/camera output across the existing height breakpoint.
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await canvas.scrollIntoViewIfNeeded();
      const frame = await waitForRenderedFrame(canvas);
      expect(frame.cssHeight).toBe(width < 768 ? 420 : 520);
      expect(frame.left).toBeGreaterThanOrEqual(0);
      expect(frame.right).toBeLessThanOrEqual(frame.viewportWidth + 1);
      await exerciseControl(page, canvas, "rotate");
    }

    // 3. The ordinary tab return remounts the scene; reload reads unchanged cargo.
    await page.getByRole("tab", { name: "装箱明细", exact: true }).click();
    await expect(canvas).toHaveCount(0);
    canvas = await openVisualization(page);
    await exerciseControl(page, canvas, "zoom");
    await page.reload();
    await expect(
      page.getByRole("heading", { name: fixture.salesNo!, exact: true }),
    ).toBeVisible();
    canvas = await openVisualization(page);
    await exerciseControl(page, canvas, "pan");
    expect(readExportDocuments(fixture)).toEqual(before);
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    await expect(page.getByText("页面出现异常", { exact: true })).toHaveCount(
      0,
    );
  } finally {
    if (fixture) await stopRoleFixture(fixture);
  }
});
