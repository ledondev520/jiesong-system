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

test('contractDocService: 模块可正常加载并导出', () => {
  const mod = require('./contractDocService');
  assert.ok(mod !== undefined);
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
