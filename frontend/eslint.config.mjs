/**
 * Input: Next.js ESLint 配置与生成目录清单
 * Output: 前端源码及测试 lint，排除构建和验收生成报告
 * Pos: 前端代码质量门禁配置
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next.stale*/**",
    "out/**",
    "build/**",
    "coverage/**",
    // Playwright 生成的报告含第三方压缩脚本，不属于项目源码。
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
