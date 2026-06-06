/**
 * Input: patrolService
 * Output: 巡检服务核心逻辑测试
 * Pos: 验证巡检规则分类、严重级别和结果结构
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  PATROL_CATEGORIES,
  SEVERITY,
  AUTO_FIX_POLICY,
} = require('./patrolService');

describe('patrolService', () => {
  it('导出完整的常量枚举', () => {
    assert.deepStrictEqual(PATROL_CATEGORIES, { BUSINESS: 'BUSINESS', SYSTEM: 'SYSTEM' });
    assert.deepStrictEqual(SEVERITY, { INFO: 'INFO', WARNING: 'WARNING', CRITICAL: 'CRITICAL' });
    assert.deepStrictEqual(AUTO_FIX_POLICY, {
      AUTO: 'AUTO',
      CONFIRM: 'CONFIRM',
      REPORT_ONLY: 'REPORT_ONLY',
    });
  });

  it('模块可正常加载并导出所有函数', () => {
    const service = require('./patrolService');
    assert.equal(typeof service.runBusinessPatrol, 'function');
    assert.equal(typeof service.runSystemPatrol, 'function');
    assert.equal(typeof service.persistPatrolFindings, 'function');
    assert.equal(typeof service.runFullPatrol, 'function');
  });

  it('巡检通知接收人使用当前 User Interface 的启用字段', () => {
    const source = fs.readFileSync(path.join(__dirname, 'patrolService.js'), 'utf8');

    assert.match(source, /where:\s*\{\s*role:\s*'ADMIN',\s*isActive:\s*true\s*\}/);
    assert.doesNotMatch(source, /status:\s*'active'/);
  });

  it('系统巡检操作日志使用 OperationLog 当前 Interface', () => {
    const source = fs.readFileSync(path.join(__dirname, 'patrolService.js'), 'utf8');

    assert.match(source, /actorType:\s*'SYSTEM'/);
    assert.doesNotMatch(source, /userId:\s*'system'/);
    assert.doesNotMatch(source, /detail:\s*JSON\.stringify/);
  });
});
