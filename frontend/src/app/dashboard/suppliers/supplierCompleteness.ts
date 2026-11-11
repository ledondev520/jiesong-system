/**
 * Input: 供应商档案（列表/详情返回的字段）
 * Output: 缺失的合同/付款必填资料名称，用于「待完善」状态说明
 * Pos: 供应商页状态判定的唯一来源（列表卡片、只读摘要共用）
 */
import type { Supplier } from "@/types";

// 合同生成与付款所需的字段；与表单「联系人 / 合同与财务信息」分区一致。
const COMPLETENESS_FIELDS: [keyof Supplier, string][] = [
  ["contactName", "联系人"],
  ["contactPhone", "联系电话"],
  ["address", "公司地址"],
  ["taxId", "纳税人识别号"],
  ["bankAccountName", "收款户名"],
  ["bankName", "开户银行"],
  ["bankAccount", "银行账号"],
];

export function missingSupplierFields(supplier: Supplier): string[] {
  return COMPLETENESS_FIELDS.filter(([key]) => {
    const value = supplier[key];
    return typeof value !== "string" || value.trim() === "";
  }).map(([, label]) => label);
}
