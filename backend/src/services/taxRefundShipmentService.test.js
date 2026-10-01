/** 出货清单、机器核验、确认失效及跨月全量导出；只使用虚构业务数据。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const service = require('./taxRefundShipmentService');
const fileService = require('./fileService');
const { EXPORT_PACKET_DESCRIPTION, buildPackingSourceVersion } = require('./exportPacketService');
const invoiceNo = '26110000000000000001';
const purchase = { id: 'pc1', contractNo: 'CG1', invoiceNo, taxRate: 13, totalAmount: 113,
  supplier: { name: '测试供货方', taxId: 'TEST-ID' },
  items: [{ id: 'p1', productId: 'product1', quantity: 2, unit: '件', unitPrice: 50, totalPrice: 113, product: { customsName: '餐盘', unit: '件' } }],
  files: [{ id: 'signed-p', category: 'SIGNED_CONTRACT', fileName: '采购盖章件.pdf' }] };
const invoice = { invNo: invoiceNo, seller: '测试供货方', sellerTaxId: 'TEST-ID', invDate: '2026-09-01', itemName: '餐盘', amount: 100, tax: 13, total: 113, qty: 2, unit: '件', taxRate: '13%', invoiceType: '增值税专用发票', status: '正常', isPositive: '是' };
const contract = { id: 'sc1', contractNo: 'EXP1', status: 'SHIPPED', hasTaxRefund: true, shippedAt: '2026-09-10T00:00:00Z', totalAmount: 50, receivedAmount: 0,
  packingItems: [{ id: 'pack1', isOwnedByJiesong: true, productId: 'product1', purchaseItemId: 'p1', purchaseContractNo: 'CG1', manufacturer: '测试供货方', invoiceNo, purchaseCost: 113, quantity: 2, unit: '件', product: { customsName: '餐盘', unit: '件' } }],
  customsDeclarations: [{ id: 'cd1', declarationNo: 'TEST-DECLARATION-1', status: 'RELEASED', exportDate: '2026-09-10T00:00:00Z', items: [{ packingItemId: 'pack1', productId: 'product1', customsName: '餐盘', quantity: 2, unit: '件', hsCode: '0000000000' }] }],
  taxRefunds: [], forexVerifications: [], packingListChecks: [{ status: 'PASSED', checkedAt: '2026-09-10T00:00:00Z', file: { id: 'carrier-packing', fileName: '船司装箱单.pdf' } }],
  files: [{ id: 'packet', category: 'SYSTEM_GENERATED_XLSX', description: '出口三单生成版本（外销合同、商业发票、装箱单）', fileName: '出口三单.xlsx' }, { id: 'signed-s', category: 'SIGNED_CONTRACT', fileName: '外销盖章件.pdf' }, { id: 'transport', category: 'CARRIER_DOCUMENT', fileName: '提单.pdf' }] };
contract.files[0].checksum = 'c'.repeat(64);
contract.files[0].description = `${EXPORT_PACKET_DESCRIPTION}:${buildPackingSourceVersion(contract.packingItems)}`;
const readiness = { taxRefundReady: true, issues: [], lines: [{ packingItemId: 'pack1', hsEvidence: { refundRate: 13 } }] };
const build = (overrides = {}) => service.buildShipmentPreparation({ salesContract: contract, purchases: [purchase], declaration: contract.customsDeclarations[0], invoiceRecords: [invoice], exportReadiness: readiness, ...overrides });
const client = (contracts = [contract]) => ({ salesContract: { findMany: async () => contracts, findUnique: async () => contracts[0] }, purchaseContract: { findMany: async () => [purchase] }, invoiceRecord: { findMany: async () => [invoice] } });

test('机器核验通过且无退税草稿，也能确认内部出货清单', () => {
  const result = build();
  assert.equal(result.materialReady, true);
  assert.equal(result.preparationReady, false);
  assert.equal(result.invoiceVerification.summary.pass, 1);
  assert.equal(result.confirmationStatus, 'PENDING');
  assert.equal(result.customsDeclarationId, 'cd1');
});
test('装箱单不是运输凭证，未分类附件不是签署件', () => {
  const result = build({ salesContract: { ...contract, files: [contract.files[0], { id: 'other', category: 'OTHER', fileName: '合同.pdf' }, { id: 'carrier-packing', category: 'CARRIER_DOCUMENT', fileName: '船司装箱单.pdf' }] } });
  assert.equal(result.checklist.find(x => x.id === 'transport-documents').status, 'review');
  assert.equal(result.checklist.find(x => x.id === 'sales-signed-contract').status, 'review');
});
test('票面金额、税号和报关数量差异阻止确认', () => {
  for (const bad of [{ ...invoice, total: 999 }, { ...invoice, sellerTaxId: 'WRONG' }]) assert.equal(build({ invoiceRecords: [bad] }).materialReady, false);
  const declaration = { ...contract.customsDeclarations[0], items: [{ ...contract.customsDeclarations[0].items[0], quantity: 3 }] };
  assert.equal(build({ declaration }).materialReady, false);
});
test('确认绑定材料版本，票面变化后失效且不覆盖旧文件', () => {
  const before = build();
  const file = { id: 'confirmed', checksum: 'c'.repeat(64), category: 'SYSTEM_GENERATED_XLSX', description: before.confirmationDescription, fileName: '已确认清单.xlsx' };
  const confirmed = build({ salesContract: { ...contract, files: [...contract.files, file] } });
  assert.equal(confirmed.confirmationStatus, 'CONFIRMED');
  assert.equal(confirmed.sourceVersion, before.sourceVersion);
  const changed = build({ salesContract: { ...contract, files: [...contract.files, file] }, invoiceRecords: [{ ...invoice, invDate: '2026-09-02' }] });
  assert.equal(changed.confirmationStatus, 'CHANGED');
  assert.equal(changed.confirmedFile, null);
});
test('月度全量包含历史补件及同合同多个报关单，排除已申报记录', async () => {
  const contracts = Array.from({ length: 105 }, (_, i) => ({ ...contract, id: `sc${i}`, contractNo: `EXP${i}`, customsDeclarations: [{ ...contract.customsDeclarations[0], id: `cd${i}` }] }));
  contracts.push({ ...contract, id: 'old', customsDeclarations: [{ ...contract.customsDeclarations[0], id: 'old-cd', exportDate: '2025-01-02' }, { ...contract.customsDeclarations[0], id: 'new-cd' }], taxRefunds: [{ customsDeclarationId: 'new-cd', status: 'APPLIED' }] });
  const result = await service.listShipmentPreparations({ filingMonth: '2026-10' }, { prismaClient: client(contracts), readinessLoader: async () => readiness });
  assert.equal(result.length, 106);
  assert.ok(result.some(x => x.customsDeclarationId === 'old-cd'));
  assert.ok(!result.some(x => x.customsDeclarationId === 'new-cd'));
  await assert.rejects(service.listShipmentPreparations({ filingMonth: '2026-13' }, { prismaClient: client() }), /月份/);
});
test('确认拒绝旧版本、重复点击复用文件且不设置正式申报状态', async () => {
  const original = fileService.archiveGeneratedFile;
  let saved = 0;
  const files = [...contract.files];
  const sc = { ...contract, files };
  const options = { prismaClient: client([sc]), readinessLoader: async () => readiness };
  fileService.archiveGeneratedFile = async input => { saved++; const file = { id: 'saved', checksum: 'c'.repeat(64), fileName: input.fileName, category: input.category, description: input.description }; files.push(file); return file; };
  try {
    await assert.rejects(service.confirmShipmentPreparation('sc1', { customsDeclarationId: 'cd1', sourceVersion: 'old' }, options), /变化/);
    const first = await service.getShipmentPreparation('sc1', 'cd1', options);
    const result = await service.confirmShipmentPreparation('sc1', { customsDeclarationId: 'cd1', sourceVersion: first.sourceVersion }, options);
    assert.equal(result.file.id, 'saved');
    await service.confirmShipmentPreparation('sc1', { customsDeclarationId: 'cd1', sourceVersion: first.sourceVersion }, options);
    assert.equal(saved, 1);
    assert.equal(sc.taxRefunds.length, 0);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await service.buildMonthlyPreparationWorkbook('2026-10', [result.preparation]));
    assert.equal(wb.getWorksheet('月度准备清单').rowCount, 2);
    assert.match(String(wb.getWorksheet('月度准备清单').getCell('J2').value), /确认/);
  } finally { fileService.archiveGeneratedFile = original; }
});

test('旧三单变动、未知报关单和多次出货复用发票不能直接确认', async () => {
  const changed = { ...contract, packingItems: contract.packingItems.map(x => ({ ...x, quantity: 3 })) };
  assert.equal(build({ salesContract: changed }).materialReady, false);
  assert.match(build({ salesContract: changed }).materialBlockers.join('；'), /三单版本/);
  for (const updates of [{ specification: '新规格' }, { hsCode: '1111111111' }, { declarationElements: '新申报要素' }, { origin: '新货源地' }, { product: { ...contract.packingItems[0].product, hsCode: '1111111111' } }]) {
    const edited = { ...contract, packingItems: contract.packingItems.map(x => ({ ...x, ...updates })) };
    assert.match(build({ salesContract: edited }).materialBlockers.join('；'), /三单版本/);
  }
  await assert.rejects(service.getShipmentPreparation('sc1', 'other-cd', { prismaClient: client(), readinessLoader: async () => readiness }), /不属于/);
  assert.equal(build({ invoiceUsages: { [invoiceNo]: ['sc1:cd1', 'sc2:cd2'] } }).materialReady, false);
  const fake = { ...contract.files[0], checksum: null };
  assert.equal(build({ salesContract: { ...contract, files: [fake] } }).materialReady, false);
});

test('明确出货数量和采购成本且整张发票总额守恒时，可以自动分配两次出货份额', () => {
  const partial = { ...contract, packingItems: contract.packingItems.map(x => ({ ...x, quantity: 1, purchaseCost: 56.5 })),
    customsDeclarations: [{ ...contract.customsDeclarations[0], items: contract.customsDeclarations[0].items.map(x => ({ ...x, quantity: 1 })) }], files: [...contract.files] };
  partial.files[0] = { ...partial.files[0], description: `${EXPORT_PACKET_DESCRIPTION}:${buildPackingSourceVersion(partial.packingItems)}` };
  const result = build({ salesContract: partial, declaration: partial.customsDeclarations[0], invoiceUsages: { [invoiceNo]: ['sc1:cd1', 'sc2:cd2'] },
    invoiceAllocations: { [invoiceNo]: { verified: true, quantity: 2 } } });
  assert.equal(result.materialReady, true);
  assert.equal(result.invoiceVerification.results[0].allocatedGrossAmount, 56.5);
  assert.equal(result.invoiceVerification.results[0].allocatedQuantity, 1);
});

test('真实加载链路能分配两次出货；另一份额变动会使原确认失效', async () => {
  const make = id => {
    const c = { ...contract, id, files: [...contract.files], packingItems: contract.packingItems.map(x => ({ ...x, id: `pack-${id}`, quantity: 1, purchaseCost: 56.5 })),
      customsDeclarations: [{ ...contract.customsDeclarations[0], id: `cd-${id}`, items: contract.customsDeclarations[0].items.map(x => ({ ...x, packingItemId: `pack-${id}`, quantity: 1 })) }] };
    c.files[0] = { ...c.files[0], description: `${EXPORT_PACKET_DESCRIPTION}:${buildPackingSourceVersion(c.packingItems)}` };
    return c;
  };
  const a = make('a'), b = make('b');
  const options = { prismaClient: client([a, b]), readinessLoader: async () => readiness };
  const result = await service.listShipmentPreparations({ filingMonth: '2026-10' }, options);
  assert.equal(result.length, 2);
  assert.ok(result.every(x => x.materialReady));
  const current = await service.getShipmentPreparation('a', 'cd-a', options);
  a.files.push({ id: 'confirmed-a', category: 'SYSTEM_GENERATED_XLSX', checksum: 'c'.repeat(64), description: current.confirmationDescription });
  b.packingItems[0].purchaseCost = 113;
  const changed = await service.getShipmentPreparation('a', 'cd-a', options);
  assert.equal(changed.materialReady, false);
  assert.equal(changed.confirmationStatus, 'CHANGED');
});

test('历史通过的船司核对不能覆盖后来修改的装箱数量', () => {
  const changed = { ...contract, packingItems: contract.packingItems.map(x => ({ ...x, updatedAt: '2026-09-11T00:00:00Z' })) };
  const result = build({ salesContract: changed });
  assert.equal(result.materialReady, false);
  assert.match(result.materialBlockers.join('；'), /重新核对/);
});

test('核对同币种报关和商业发票金额，不把人民币进货金额混入美元售价', () => {
  const priced = { ...contract, files: [...contract.files], packingItems: contract.packingItems.map(x => ({ ...x, totalPrice: 50, unitPrice: 25 })) };
  priced.files[0] = { ...priced.files[0], description: `${EXPORT_PACKET_DESCRIPTION}:${buildPackingSourceVersion(priced.packingItems)}` };
  const declaration = { ...contract.customsDeclarations[0], currency: 'USD', items: contract.customsDeclarations[0].items.map(x => ({ ...x, totalPrice: 50 })) };
  assert.equal(build({ salesContract: priced, declaration }).materialReady, true);
  const wrong = { ...declaration, items: declaration.items.map(x => ({ ...x, totalPrice: 100 })) };
  assert.equal(build({ salesContract: priced, declaration: wrong }).materialReady, false);
});
