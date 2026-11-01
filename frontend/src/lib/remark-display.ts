/**
 * Input: 后端存储的备注原文（可能含导入脚本追加的内部来源痕迹）
 * Output: { text: 用户应看到的备注, source: 可折叠展示的导入来源行 }
 * Pos: 展示层拆分（不改存储）；采购/报关/退税等备注显示处共用，组件见 components/ui/remark-text.tsx
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

// 导入脚本写入的标记形如 [WPS_PURCHASE_EVIDENCE]、[CUSTOMS_XML]：全大写、至少含一个下划线。
const MARKER_TAG = /\[[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\]/;
// 报关 XML 导入追加的 key=value 痕迹；只认这些已知键，避免误伤正常备注里的「a=b」。
const TRACE_PAIR =
  /\b(?:sha256|xml_ht_no|target_contract|business_confirmed_mapping)=\S*/g;
// Prisma cuid（c + 24 位小写字母数字）是内部单据 ID，用户看不懂也无需看到。
const INTERNAL_ID = /\bc[a-z0-9]{24}\b/g;
// 系统生成备注里的「关联报关单 <id>、核销单 <id>」整句移走，避免剩下「关联报关单 、」的残句。
const INTERNAL_REF =
  /(?:关联)?[\u4e00-\u9fa5]{1,6}单\s*c[a-z0-9]{24}(?:\s*[、，,]\s*(?=[\u4e00-\u9fa5]{1,6}单\s*c[a-z0-9]{24}))?/g;

export interface SplitRemark {
  text: string;
  source: string[];
}

/**
 * 职责：逐行拆分。标记行从标记起到行尾归入 source，标记前的正常文字保留；
 * 其余行只抽出已知痕迹键值和内部 ID。没有任何内容被移走时，备注原样返回（含空白与空行）。
 */
export function splitRemark(note: unknown): SplitRemark {
  const raw = typeof note === "string" ? note : "";
  const text: string[] = [];
  const source: string[] = [];

  for (const line of raw.split(/\r?\n/)) {
    const cut = line.search(MARKER_TAG);
    const head = cut >= 0 ? line.slice(0, cut) : line;
    if (cut >= 0) source.push(line.slice(cut).trim());

    const refs = head.match(INTERNAL_REF) ?? [];
    const rest = head.replace(INTERNAL_REF, "");
    const traces = rest.match(TRACE_PAIR) ?? [];
    const ids = rest.match(INTERNAL_ID) ?? [];
    const moved = [
      ...refs.map((r) => r.replace(/[、，,]\s*$/, "")),
      ...traces,
      ...ids,
    ];
    if (moved.length) source.push(moved.join(" "));

    const kept = rest
      .replace(TRACE_PAIR, "")
      .replace(INTERNAL_ID, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (kept) text.push(kept);
  }

  // 普通备注不做任何改写，只有真的拆出了来源才用整理后的正文。
  if (source.length === 0) return { text: raw.trim() ? raw : "", source };
  return { text: text.join("\n"), source };
}
