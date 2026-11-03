/**
 * Input: 报关单号（库内原值）
 * Output: 展示用单号与是否带 DRAFT 后缀；库内编号不变
 * Pos: 报关单列表/详情共用的展示辅助，后缀改由「草稿」徽章表达
 */
export function splitDraftSuffix(declarationNo: string | null | undefined) {
  const value = declarationNo ?? "";
  const match = value.match(/^(.*?)[\s_-]*draft$/i);
  return match && match[1]
    ? { displayNo: match[1], isDraft: true }
    : { displayNo: value, isDraft: false };
}
