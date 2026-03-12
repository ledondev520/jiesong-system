/**
 * Input: rateLimit 模块初始化
 * Output: 模块加载后可自然退出的约束测试
 * Pos: 中间件初始化回归测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('rateLimit: 模块初始化不会阻塞进程退出', () => {
  const backendRoot = path.resolve(__dirname, '../..');
  const result = spawnSync(
    process.execPath,
    ['-e', "require('./src/middleware/rateLimit')"],
    {
      cwd: backendRoot,
      encoding: 'utf8',
      timeout: 5000,
    }
  );

  assert.equal(
    result.error,
    undefined,
    `子进程应正常退出，实际错误: ${result.error?.message || result.stderr || result.stdout}`
  );
  assert.equal(result.signal, null, `子进程不应被信号终止: ${result.stderr || result.stdout}`);
  assert.equal(result.status, 0, `模块初始化应退出 0，实际输出: ${result.stderr || result.stdout}`);
});
