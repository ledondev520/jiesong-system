/**
 * Input: 已渲染的打印页 DOM 元素（每柜一页）
 * Output: PNG 下载、PDF 下载（页面截图 → 图片；按页宽缩放，长表格在行边界分页且逐页截取；PDF 页统一 A4 竖版、以 JPEG 嵌入控制体积；不引入新依赖，jsPDF 默认字体不含中文故不直接写文字）
 * Pos: 装柜图导出工具，供 ContainerLoadingPanel 调用
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const download = (href: string, filename: string) => {
  const link = document.createElement("a");
  link.download = filename;
  link.href = href;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/** 截取元素的 [from, to) CSS 像素纵向区间：克隆根节点上移 from，画布只有切片高度，避免整页超出浏览器画布上限。 */
const capture = async (
  element: HTMLElement,
  from = 0,
  to?: number,
  format: "png" | "jpeg" = "png",
) => {
  const { domToPng, domToJpeg } = await import("modern-screenshot");
  return (format === "png" ? domToPng : domToJpeg)(element, {
    scale: 2,
    quality: 0.85, // 仅 JPEG 生效：未压缩 2200px RGB 每页约 20 MB，JPEG 约数百 KB
    backgroundColor: "#ffffff",
    ...(to === undefined
      ? {}
      : {
          width: element.offsetWidth,
          height: to - from,
          style: { transform: `translateY(${-from}px)` },
        }),
  });
};

/** 职责：把一页截成 PNG 并下载。 */
export async function exportPagePng(element: HTMLElement, filename: string) {
  download(await capture(element), filename);
}

/**
 * 职责：把总高度 total 按每页 pageH 切片，尽量在 breaks（块/行顶边）处断开，
 * 不在单行中间切开；没有可用断点时（单块高于一页）硬切。返回 [start, end) 区间。
 */
export function planSlices(total: number, pageH: number, breaks: number[]) {
  const slices: Array<[number, number]> = [];
  let start = 0;
  while (start < total) {
    let end = Math.min(start + pageH, total);
    if (end < total) {
      const fit = breaks.filter((b) => b > start && b <= end);
      if (fit.length > 0) end = Math.max(...fit);
    }
    slices.push([start, end]);
    start = end;
  }
  return slices;
}

/**
 * 职责：收集允许断页的纵向位置（相对元素顶边）：带标题的表/图块顶边、svg 顶边、表体行顶边；
 * 不含每表第一行体行——在那里断开会把标题+表头单独留在上一页（表头无数据行）。
 */
export function collectBreaks(element: HTMLElement) {
  const top = element.getBoundingClientRect().top;
  return Array.from(
    element.querySelectorAll(
      "[data-pdf-block], svg, tbody tr:not(:first-child)",
    ),
  ).map((node) => node.getBoundingClientRect().top - top);
}

/** 职责：每个元素按 A4 页宽等比缩放（保持可读字号），超出一页高度的长表格分页续排。 */
export async function exportPagesPdf(
  elements: HTMLElement[],
  filename: string,
) {
  const { jsPDF } = await import("jspdf");
  // 统一 A4 竖版：截图宽度固定，按宽高比自动转横版会让短的柜（如 1 个块）变横版并被拆页。
  const pageW = 210;
  const pageH = 297;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let first = true;
  for (const element of elements) {
    const pageCssH = (pageH / pageW) * element.offsetWidth;
    // 单页放得下就整页输出；放不下才按页宽分页。
    const slices =
      element.offsetHeight <= pageCssH
        ? ([[0, element.offsetHeight]] as Array<[number, number]>)
        : planSlices(element.offsetHeight, pageCssH, collectBreaks(element));
    for (const [from, to] of slices) {
      if (!first) doc.addPage("a4", "portrait");
      first = false;
      const ratio = pageW / element.offsetWidth;
      doc.addImage(
        await capture(element, from, to, "jpeg"),
        "JPEG",
        0,
        0,
        pageW,
        (to - from) * ratio,
      );
    }
  }
  doc.save(filename);
}
