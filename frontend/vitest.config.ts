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
      reporter: ['text', 'html', 'lcov'],
      // 覆盖范围：组件层 + 服务层 + 工具库 + 页面层（FE-COV-98 Phase 2）
      include: [
        'src/components/**/*.ts',
        'src/components/**/*.tsx',
        'src/lib/**/*.ts',
        'src/services/**/*.ts',
        'src/app/**/*.ts',
        'src/app/**/*.tsx',
      ],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/test/**',
        'src/**/*.d.ts',
        // Next.js 路由特殊文件无需覆盖率统计
        'src/app/layout.tsx',
        'src/app/page.tsx',
        'src/app/**/layout.tsx',
        'src/app/**/loading.tsx',
        'src/app/**/error.tsx',
        'src/app/**/not-found.tsx',
      ],
      // 覆盖率门禁（FE-COV-98 Phase 2：扩围后基线，逐步向 50% 推进）
      // 运行命令：npm run test -- --coverage
      thresholds: {
        statements: 20,
        lines: 20,
        functions: 20,
        branches: 15,
      },
    },
  },
});
