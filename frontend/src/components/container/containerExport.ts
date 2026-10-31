/**
 * Input: 已渲染的打印页 DOM 元素（每柜一页）
 * Output: PNG 下载、PDF 下载（页面截图 → 图片；按页宽缩放，长表格在行边界分页；不引入新依赖，jsPDF 默认字体不含中文故不直接写文字）
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

const capture = async (element: HTMLElement) => {
  const { domToPng } = await import("modern-screenshot");
  return domToPng(element, { scale: 2, backgroundColor: "#ffffff" });
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

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });

/** 职责：每个元素按 A4 页宽等比缩放（保持可读字号），超出一页高度的长表格分页续排。 */
export async function exportPagesPdf(
  elements: HTMLElement[],
  filename: string,
) {
  const { jsPDF } = await import("jspdf");
  const orientationOf = (el: HTMLElement) =>
    el.offsetHeight > el.offsetWidth ? "portrait" : "landscape";
  const doc = new jsPDF({
    orientation: orientationOf(elements[0]),
    unit: "mm",
    format: "a4",
  });
  let first = true;
  for (const element of elements) {
    const dataUrl = await capture(element);
    const img = await loadImage(dataUrl);
    const orientation = orientationOf(element);
    const pageW = orientation === "portrait" ? 210 : 297;
    const pageH = orientation === "portrait" ? 297 : 210;
    const scale = img.width / element.offsetWidth; // 截图像素 / CSS 像素
    const pageCssH = (pageH / pageW) * element.offsetWidth;
    const top = element.getBoundingClientRect().top;
    const breaks = Array.from(element.querySelectorAll("tr, table, svg")).map(
      (node) => node.getBoundingClientRect().top - top,
    );
    // 单页放得下就整页输出，与此前一致；放不下才按页宽分页。
    const slices =
      element.offsetHeight <= pageCssH
        ? ([[0, element.offsetHeight]] as Array<[number, number]>)
        : planSlices(element.offsetHeight, pageCssH, breaks);
    for (const [from, to] of slices) {
      if (!first) doc.addPage("a4", orientation);
      first = false;
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = Math.max(1, Math.round((to - from) * scale));
      canvas
        .getContext("2d")
        ?.drawImage(
          img,
          0,
          Math.round(from * scale),
          img.width,
          canvas.height,
          0,
          0,
          img.width,
          canvas.height,
        );
      const ratio = pageW / element.offsetWidth;
      doc.addImage(
        canvas.toDataURL("image/png"),
        "PNG",
        0,
        0,
        pageW,
        (to - from) * ratio,
      );
    }
  }
  doc.save(filename);
}
