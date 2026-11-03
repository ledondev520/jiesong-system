/**
 * Input: orders / purchases / purchase / sales / inventory / inventory-status / hs-codes / products 下的非测试源文件
 * Output: 守护测试：这些模块页不得再写死调色板类（emerald-600、bg-red-50 等）、dark: 调色板变体或十六进制色
 * Pos: 重设计 Phase 2 批 2（B31） + B50（hs-codes、products）；颜色统一走 globals.css 的 status-* / primary 令牌
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const AREAS = [
  "orders",
  "purchases",
  "purchase",
  "sales",
  "inventory",
  "inventory-status",
  "hs-codes",
  "products",
];
const FAMILIES =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
// 含 hover:/md:/dark: 等变体前缀；#abc 与 #aabbcc 两种十六进制写法
const PALETTE = new RegExp(
  `(?<![\\w-])(?:[a-z0-9]+:)*(?:bg|text|border|ring|fill|stroke|from|to|via|divide|outline|decoration|accent|shadow)-(?:${FAMILIES})-\\d{2,3}\\b|#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\\b|\\btext-white\\b`,
);

const sources = (dir: string): string[] =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return sources(full);
        return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
          ? [full]
          : [];
      })
    : [];

describe("ops module pages use design tokens (B31)", () => {
  for (const area of AREAS) {
    it(`${area} has no hardcoded palette values`, () => {
      const offenders = sources(path.join(__dirname, area)).filter((file) =>
        PALETTE.test(fs.readFileSync(file, "utf8")),
      );
      expect(offenders).toEqual([]);
    });
  }
});
