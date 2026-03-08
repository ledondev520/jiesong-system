/**
 * Input: import-hscode-live script exports
 * Output: 真实 HSCode JSON 清洗与导入测试
 * Pos: 后端脚本测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  flattenDeclarationElements,
  normalizeLiveRecord,
  importLiveHsCodes,
} = require('./import-hscode-live');

const sampleRecord = {
  hs_code: '6904100000',
  title: '6904100000的HS编码_陶瓷制建筑用砖_HS编码查询',
  source_url: 'https://www.hsbianma.com/Code/6904100000.html',
  fetched_at: '2026-03-08T11:28:28+00:00',
  basic_info: {
    商品编码: '6904100000',
    商品名称: '陶瓷制建筑用砖',
    编码状态: '正常',
  },
  tax_info: {
    计量单位: '千克/千块',
    出口税率: '0%',
    出口退税税率: '9%',
    增值税率: '13%',
  },
  declaration_elements: [
    { index: 0, code: null, value: '品牌类型 [ ? ]' },
    { index: 1, code: null, value: '出口享惠情况 [ ? ]' },
    { index: 2, code: null, value: '种类(建筑用砖、地面砖等)' },
  ],
  supervision_conditions: [{ index: null, code: null, value: '无' }],
  inspection_quarantine: [{ index: null, code: 'L', value: '民用商品入境验证' }],
  agreement_rates: { 东盟: '0%' },
  rcep_rates: { 日本: '9.5%' },
  chapter_hierarchy: [{ code: '69', value: '陶瓷产品' }],
  ciq_codes: [{ code: '6904100000999', value: '陶瓷制建筑用砖' }],
};

test('flattenDeclarationElements: 保留顺序并拼接申报要素文本', () => {
  assert.equal(
    flattenDeclarationElements(sampleRecord.declaration_elements),
    '品牌类型 [ ? ] | 出口享惠情况 [ ? ] | 种类(建筑用砖、地面砖等)',
  );
});

test('normalizeLiveRecord: 提取关键查询字段并保留完整原始 payload', () => {
  const normalized = normalizeLiveRecord(sampleRecord);

  assert.equal(normalized.hsCode, '6904100000');
  assert.equal(normalized.productName, '陶瓷制建筑用砖');
  assert.equal(normalized.taxRate, 9);
  assert.equal(normalized.refundRate, 9);
  assert.equal(normalized.vatRate, 13);
  assert.equal(normalized.unit, '千克/千块');
  assert.equal(normalized.declarationElements, '品牌类型 [ ? ] | 出口享惠情况 [ ? ] | 种类(建筑用砖、地面砖等)');
  assert.equal(normalized.supervisionConditions, '无');
  assert.equal(normalized.inspectionQuarantine, 'L:民用商品入境验证');
  assert.equal(normalized.sourceUrl, 'https://www.hsbianma.com/Code/6904100000.html');
  assert.equal(normalized.rawPayloadJson, JSON.stringify(sampleRecord));
  assert.ok(normalized.fetchedAt instanceof Date);
  assert.ok(normalized.effectiveDate instanceof Date);
});

test('importLiveHsCodes: 从目录读取 JSON 并逐条 upsert', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hscode-live-'));
  await fs.writeFile(
    path.join(tempDir, '6904100000.json'),
    JSON.stringify(sampleRecord),
    'utf8',
  );

  const upserts = [];
  let deleteManyCalls = 0;
  const mockClient = {
    hsCode: {
      deleteMany: async () => {
        deleteManyCalls += 1;
      },
      upsert: async (args) => {
        upserts.push(args);
        return { id: `row-${upserts.length}` };
      },
    },
  };

  try {
    const result = await importLiveHsCodes(mockClient, { inputDir: tempDir });

    assert.equal(result.processed, 1);
    assert.equal(result.upserted, 1);
    assert.equal(deleteManyCalls, 1);
    assert.equal(upserts.length, 1);
    assert.equal(upserts[0].where.hsCode, '6904100000');
    assert.equal(upserts[0].create.productName, '陶瓷制建筑用砖');
    assert.equal(upserts[0].create.declarationElements, '品牌类型 [ ? ] | 出口享惠情况 [ ? ] | 种类(建筑用砖、地面砖等)');
    assert.equal(upserts[0].create.rawPayloadJson, JSON.stringify(sampleRecord));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
