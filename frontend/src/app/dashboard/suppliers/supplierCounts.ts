/**
 * Input: 供应商目录（status=all，含已归档）
 * Output: 供应商索引计数；total = normal + issue + archived，三类互斥（已归档不再计入正常/质量问题）
 * Pos: 供应商页「供应商索引」摘要
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
export function countSuppliers(
  suppliers: { isActive?: boolean; hasQualityIssue?: boolean }[],
) {
  let normal = 0;
  let issue = 0;
  let archived = 0;
  for (const supplier of suppliers) {
    if (supplier.isActive === false) archived += 1;
    else if (supplier.hasQualityIssue) issue += 1;
    else normal += 1;
  }
  return { total: suppliers.length, normal, issue, archived };
}
