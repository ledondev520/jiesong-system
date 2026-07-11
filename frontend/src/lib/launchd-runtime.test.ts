/**
 * Input: 本地 launchd 前端启动脚本
 * Output: 默认生产运行、显式开发回退和构建新鲜度检查的静态契约
 * Pos: 本地常驻前端性能回归测试
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const launchdScript = readFileSync('scripts/start-launchd-dev.sh', 'utf8');

describe('launchd 前端运行模式', () => {
  it('默认使用生产模式并保留显式开发模式', () => {
    expect(launchdScript).toContain('JIESONG_FRONTEND_MODE:-production');
    expect(launchdScript).toContain('exec "$NPM_BIN" run start');
    expect(launchdScript).toContain('exec "$NPM_BIN" run dev');
  });

  it('生产模式只在构建缺失或源码更新时重新构建', () => {
    expect(launchdScript).toContain('.next/BUILD_ID');
    expect(launchdScript).toContain('-newer');
    expect(launchdScript).toContain('"$NPM_BIN" run build');
  });
});
