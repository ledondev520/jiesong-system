import { expect, it } from "vitest";
import { countSuppliers } from "./supplierCounts";

it("索引计数：总数 = 正常 + 质量问题 + 已归档（回归：曾显示共 95 而 94+1+1=96）", () => {
  const suppliers = [
    ...Array.from({ length: 94 }, () => ({
      isActive: true,
      hasQualityIssue: false,
    })),
    { isActive: true, hasQualityIssue: true },
    { isActive: false, hasQualityIssue: false },
  ];
  const counts = countSuppliers(suppliers);
  expect(counts).toEqual({ total: 96, normal: 94, issue: 1, archived: 1 });
  expect(counts.normal + counts.issue + counts.archived).toBe(counts.total);
});

it("已归档且有质量问题的只计入已归档；缺省 isActive 视为在用", () => {
  const counts = countSuppliers([
    { isActive: false, hasQualityIssue: true },
    { hasQualityIssue: false },
  ]);
  expect(counts).toEqual({ total: 2, normal: 1, issue: 0, archived: 1 });
});
