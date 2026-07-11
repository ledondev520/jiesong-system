/**
 * Input: backend launchd 启动脚本
 * Output: 本地常驻后端默认生产运行、显式可切回开发模式的回归约束
 * Pos: launchd 运行模式测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const script = fs.readFileSync(path.join(__dirname, 'start-launchd-dev.sh'), 'utf8');

test('launchd 后端默认使用生产运行模式，避免 nodemon 与查询日志开销', () => {
  assert.match(script, /JIESONG_BACKEND_MODE:-production/);
  assert.match(script, /export NODE_ENV="production"/);
  assert.match(script, /npm.*run start|NPM_BIN.*run start/);
});

test('launchd 后端仅在显式 development 模式下启动 nodemon', () => {
  assert.match(script, /MODE.*development.*MODE.*dev/s);
  assert.match(script, /npm.*run dev|NPM_BIN.*run dev/);
});
