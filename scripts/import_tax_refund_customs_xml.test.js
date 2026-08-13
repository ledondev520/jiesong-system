/**
 * Input: 仿真海关 XML、出口合同/装箱明细和既有报关单
 * Output: XML 解析、例外映射、逐项校验和幂等写入回归测试
 * Pos: 出口退税报关 XML 关联 CLI Adapter 测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  applyImportPlan,
  buildImportPlan,
  expandContracts,
  parseDeclarationXml,
} = require('./import_tax_refund_customs_xml');

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<RtxMessage><Dec><DecHead>
<bgd_no>530420260000000001</bgd_no><lj_date>20260709</lj_date><ht_no>EXP260008</ht_no>
</DecHead><DecLists><DecList>
<spxh>1</spxh><cmcode>8419810000</cmcode><cm_name>自助餐台</cm_name>
<Yb_bz>USD</Yb_bz><yb_amt>7000</yb_amt><Fd_unit>001</Fd_unit><Fd_qnt>1</Fd_qnt>
<No2_Fd_unit>035</No2_Fd_unit><No2_Fd_qnt>800</No2_Fd_qnt><Cj_unit>006</Cj_unit><Cj_qnt>1</Cj_qnt>
</DecList></DecLists></Dec></RtxMessage>`;

function tempSource() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'customs-xml-test-'));
  fs.writeFileSync(path.join(directory, 'formal.xml'), xml);
  return directory;
}

function contract(totalPrice = 7000) {
  return {
    id: 'sales-contract-9',
    contractNo: 'EXP260009',
    customsBroker: '捷淞',
    packingItems: [{
      id: 'packing-1',
      productId: 'product-1',
      quantity: 1,
      totalPrice,
      product: { id: 'product-1', customsName: '自助餐台', hsCode: '8419810000' },
      customsDeclarationItems: [],
    }],
  };
}

function prisma({ totalPrice = 7000, existing = [] } = {}) {
  return {
    salesContract: { findMany: async () => [contract(totalPrice)] },
    customsDeclaration: { findMany: async () => existing },
  };
}

function options(sourceDir) {
  return {
    sourceDir,
    contracts: expandContracts('EXP260009'),
    mappings: new Map([['530420260000000001', 'EXP260009']]),
    outDir: sourceDir,
    apply: false,
  };
}

test('parseDeclarationXml: 读取报关头、明细和法定千克净重', () => {
  const [declaration] = parseDeclarationXml(xml, 'formal.xml', 'hash');
  assert.equal(declaration.declarationNo, '530420260000000001');
  assert.equal(declaration.xmlContractNo, 'EXP260008');
  assert.equal(declaration.items[0].customsName, '自助餐台');
  assert.equal(declaration.items[0].unit, '套');
  assert.equal(declaration.items[0].netWeight, 800);
});

test('buildImportPlan: 人工确认映射后仍须按品名、数量、HS 和金额唯一命中', async (t) => {
  const sourceDir = tempSource();
  t.after(() => fs.rmSync(sourceDir, { recursive: true, force: true }));
  const plan = await buildImportPlan(options(sourceDir), prisma());
  assert.equal(plan.summary.createDeclarations, 1);
  assert.equal(plan.summary.createItems, 1);
  assert.equal(plan.summary.businessConfirmedMappings, 1);
  assert.equal(plan.operations.creates[0].contractNo, 'EXP260009');
  assert.equal(plan.operations.creates[0].xmlContractNo, 'EXP260008');
  assert.equal(plan.operations.creates[0].items[0].packingItemId, 'packing-1');
  assert.match(plan.operations.creates[0].note, /business_confirmed_mapping/);
});

test('buildImportPlan: 已有金额与 XML 超出容差时停止', async (t) => {
  const sourceDir = tempSource();
  t.after(() => fs.rmSync(sourceDir, { recursive: true, force: true }));
  await assert.rejects(
    buildImportPlan(options(sourceDir), prisma({ totalPrice: 7100 })),
    /金额与 XML 不一致/,
  );
});

test('applyImportPlan: 单事务创建报关单及明细且不创建退税草稿', async () => {
  const calls = [];
  const fakePrisma = {
    $transaction: async (callback) => callback({
      customsDeclaration: {
        create: async (value) => calls.push(value),
      },
    }),
  };
  const plan = {
    summary: { createDeclarations: 1 },
    operations: {
      creates: [{
        declarationNo: '530420260000000001',
        salesContractId: 'sales-contract-9',
        contractNo: 'EXP260009',
        xmlContractNo: 'EXP260008',
        status: 'RELEASED',
        items: [{ productId: 'product-1', customsName: '自助餐台', quantity: 1 }],
      }],
    },
  };
  const result = await applyImportPlan(plan, fakePrisma);
  assert.deepEqual(result, { createdDeclarations: 1, createdItems: 1 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].data.items.create.length, 1);
  assert.equal(Object.hasOwn(calls[0].data, 'contractNo'), false);
  assert.equal(Object.hasOwn(calls[0].data, 'xmlContractNo'), false);
});
