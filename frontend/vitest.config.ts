/**
 * Input: Vitest配置需求
 * Output: 前端单元测试配置
 * Pos: 前端测试配置入口
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['src/test/setup.ts'],
    // Page-level interaction tests exceed Vitest's 5s default under full-suite load in CI,
    // especially with coverage instrumentation enabled.
    testTimeout: 20000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/components/**/*.ts', 'src/components/**/*.tsx', 'src/lib/**/*.ts'],
      thresholds: {
        statements: 10,
        lines: 10,
        functions: 20,
        branches: 20,
      },
    },
  },
});
