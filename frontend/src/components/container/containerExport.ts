/**
 * Input: 已渲染的打印页 DOM 元素（每柜一页）
 * Output: PNG 下载、PDF 下载（页面截图 → 图片；不引入新依赖，jsPDF 默认字体不含中文故不直接写文字）
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

/** 职责：每个元素一页（A4，按页面长宽比选横/竖，等比缩放居中）合成 PDF 并下载。 */
export async function exportPagesPdf(elements: HTMLElement[], filename: string) {
  const { jsPDF } = await import("jspdf");
  const orientationOf = (el: HTMLElement) =>
    el.offsetHeight > el.offsetWidth ? "portrait" : "landscape";
  const doc = new jsPDF({ orientation: orientationOf(elements[0]), unit: "mm", format: "a4" });
  for (let index = 0; index < elements.length; index += 1) {
    const element = elements[index];
    const dataUrl = await capture(element);
    if (index > 0) doc.addPage("a4", orientationOf(element));
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const ratio = Math.min(pageW / element.offsetWidth, pageH / element.offsetHeight);
    const w = element.offsetWidth * ratio;
    const h = element.offsetHeight * ratio;
    doc.addImage(dataUrl, "PNG", (pageW - w) / 2, (pageH - h) / 2, w, h);
  }
  doc.save(filename);
}
