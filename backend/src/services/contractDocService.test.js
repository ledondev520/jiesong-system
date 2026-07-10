/**
 * Input: contractDocService 模块
 * Output: 模块导出冒烟测试
 * Pos: 自动补齐基础测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const AdmZip = require('adm-zip');

const createTemplate = (templatePath) => {
  const zip = new AdmZip();
  zip.addFile('[Content_Types].xml', Buffer.from('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'));
  zip.addFile('word/document.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
      <w:p><w:r><w:t>{{contractNo}}</w:t></w:r><w:r><w:t>{{signYear}}</w:t></w:r><w:r><w:t>{{signMonth}}</w:t></w:r><w:r><w:t>{{signDay}}</w:t></w:r></w:p>
      <w:p><w:r><w:t>{{supplierBankName}}</w:t></w:r><w:r><w:t>{{supplierBankAccount}}</w:t></w:r></w:p>
      <w:tbl><w:tr><w:tc><w:p><w:r><w:t>{{productName}}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{{unit}}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{{quantity}}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{{unitPrice}}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{{amount}}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{{taxRate}}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{{taxAmount}}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{{totalAmount}}</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
      <w:p><w:r><w:t>{{totalAmountChinese}}</w:t></w:r></w:p>
    </w:body></w:document>`));
  zip.writeZip(templatePath);
};

const contractFixture = {
  id: 'pc-1',
  contractNo: 'CG2600001',
  signedAt: new Date('2025-03-04T00:00:00.000Z'),
  taxRate: 13,
  totalAmount: 226,
  paidAmount: 0,
  supplier: {
    name: '佛山供应商',
    taxId: 'TAX-1',
    address: '佛山市',
    bankAccountName: '佛山供应商有限公司',
    bankName: '示例银行',
    bankBranch: '禅城支行',
    bankCode: 'BANK-CODE-001',
    bankAccount: '0001',
  },
  items: [
    { quantity: 1, unit: '件', unitPrice: 100, totalPrice: 113, product: { customsName: '桌&椅' } },
    { quantity: 2, unit: '套', unitPrice: 50, totalPrice: 113, product: { customsName: '酒架' } },
  ],
};

test('contractDocService: 模块可正常加载并导出', () => {
  const mod = require('./contractDocService');
  assert.ok(mod !== undefined);
});

test('contractDocService: Word 复制模板商品行并输出全部明细、合同日期与单次税额', async () => {
  const mod = require('./contractDocService');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-contract-generate-'));
  const templatePath = path.join(tempDir, 'template.docx');
  const originalPath = process.env.CONTRACT_DOC_TEMPLATE_PATH;

  try {
    createTemplate(templatePath);
    process.env.CONTRACT_DOC_TEMPLATE_PATH = templatePath;

    const output = await mod.generatePurchaseContract(contractFixture);
    const outputZip = new AdmZip(output);
    const xml = outputZip.readAsText('word/document.xml');

    assert.match(xml, /桌&amp;椅/);
    assert.match(xml, /酒架/);
    assert.match(xml, /2025/);
    assert.match(xml, />3</);
    assert.match(xml, />4</);
    assert.equal((xml.match(/<w:tr>/g) || []).length, 2);
    assert.doesNotMatch(xml, /\{\{productName\}\}/);
    assert.match(xml, />100</);
    assert.match(xml, />13</);
    assert.match(xml, />113</);
    assert.match(xml, /户名：佛山供应商有限公司/);
    assert.match(xml, /禅城支行/);
    assert.match(xml, /BANK-CODE-001/);
    assert.doesNotMatch(xml, />127\.69</);
  } finally {
    if (originalPath === undefined) delete process.env.CONTRACT_DOC_TEMPLATE_PATH;
    else process.env.CONTRACT_DOC_TEMPLATE_PATH = originalPath;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('contractDocService: 生成真正 application/pdf 内容且视图包含全部商品', async () => {
  const mod = require('./contractDocService');
  const fallbackFont = path.join(__dirname, '../../node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf');
  const view = mod.buildPurchaseContractView(contractFixture);
  const pdf = await mod.generatePurchaseContractPdf(contractFixture, { fontPath: fallbackFont });
  const samePdf = await mod.generatePurchaseContractPdf(contractFixture, { fontPath: fallbackFont });

  assert.deepEqual(view.items.map((item) => item.productName), ['桌&椅', '酒架']);
  assert.equal(view.signDate, '2025-03-04');
  assert.equal(view.amounts.grossAmount, 226);
  assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.ok(pdf.length > 1000);
  assert.equal(pdf.equals(samePdf), true, '同一合同内容应生成可去重的确定性 PDF');
});

test('contractDocService: CONTRACT_DOC_TEMPLATE_PATH 控制模板读写位置', async () => {
  const mod = require('./contractDocService');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-contract-template-'));
  const templatePath = path.join(tempDir, 'template.docx');
  const originalPath = process.env.CONTRACT_DOC_TEMPLATE_PATH;

  try {
    process.env.CONTRACT_DOC_TEMPLATE_PATH = templatePath;

    assert.equal(mod.getTemplatePath(), templatePath);
    assert.equal(await mod.checkTemplateExists(), false);

    await mod.saveTemplate(Buffer.from('test-template'));
    assert.equal(await mod.checkTemplateExists(), true);

    const info = await mod.getTemplateInfo();
    assert.equal(info.exists, true);
    assert.equal(info.filename, 'template.docx');

    await mod.removeTemplate();
    assert.equal(await mod.checkTemplateExists(), false);
  } finally {
    if (originalPath === undefined) {
      delete process.env.CONTRACT_DOC_TEMPLATE_PATH;
    } else {
      process.env.CONTRACT_DOC_TEMPLATE_PATH = originalPath;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
