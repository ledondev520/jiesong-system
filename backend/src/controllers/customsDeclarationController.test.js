/**
 * Input: customsDeclarationController、customsDeclarationDraftService
 * Output: 报关单控制器关键行为测试
 * Pos: 后端控制器测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const customsDeclarationController = require('./customsDeclarationController');
const customsDeclarationDraftService = require('../services/customsDeclarationDraftService');

const createMockRes = () => {
  const res = {
    statusCode: null,
    payload: null,
  };

  res.status = (code) => {
    res.statusCode = code;
    return res;
  };

  res.json = (payload) => {
    res.payload = payload;
    return res;
  };

  return res;
};

test('generateCustomsDeclarationDrafts: 返回自动生成结果汇总', async () => {
  const original = customsDeclarationDraftService.generateCustomsDeclarationDrafts;
  let capturedPayload = null;

  customsDeclarationDraftService.generateCustomsDeclarationDrafts = async (payload) => {
    capturedPayload = payload;
    return {
      created: 1,
      skipped: 2,
      items: [
        { salesContractId: 'sc-1', customsDeclarationId: 'cd-1', reason: null },
      ],
    };
  };

  try {
    const req = {
      body: {
        salesContractId: 'sc-1',
        replaceExisting: false,
      },
    };
    const res = createMockRes();
    let capturedError = null;
    const next = (error) => {
      capturedError = error;
    };

    await customsDeclarationController.generateCustomsDeclarationDrafts(req, res, next);

    assert.equal(capturedError, null);
    assert.deepEqual(capturedPayload, {
      salesContractId: 'sc-1',
      replaceExisting: false,
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.message, '报关单草稿生成完成');
    assert.equal(res.payload.data.created, 1);
    assert.equal(res.payload.data.skipped, 2);
  } finally {
    customsDeclarationDraftService.generateCustomsDeclarationDrafts = original;
  }
});
