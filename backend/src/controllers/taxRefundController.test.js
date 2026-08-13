/**
 * Input: taxRefundController、taxRefundService
 * Output: 退税控制器关键行为测试
 * Pos: 后端控制器测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const taxRefundController = require('./taxRefundController');
const taxRefundService = require('../services/taxRefundService');
const taxRefundDraftService = require('../services/taxRefundDraftService');
const taxRefundExportService = require('../services/taxRefundExportService');
const taxRefundWorkbenchService = require('../services/taxRefundWorkbenchService');

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

test('listTaxRefunds: 透传分页和筛选参数', async () => {
  const original = taxRefundService.listTaxRefunds;
  let capturedArgs = null;

  taxRefundService.listTaxRefunds = async (args) => {
    capturedArgs = args;
    return {
      items: [{ id: 'tr-1', refundNo: 'TR-001' }],
      total: 1,
      page: args.page,
      pageSize: args.pageSize,
    };
  };

  try {
    const req = {
      query: {
        page: '2',
        pageSize: '15',
        salesContractId: 'sc-1',
        status: 'APPLIED',
        keyword: '2026',
      },
    };
    const res = createMockRes();
    let capturedError = null;
    const next = (error) => {
      capturedError = error;
    };

    await taxRefundController.listTaxRefunds(req, res, next);

    assert.equal(capturedError, null);
    assert.deepEqual(capturedArgs, {
      page: 2,
      pageSize: 15,
      salesContractId: 'sc-1',
      status: 'APPLIED',
      keyword: '2026',
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload.data.items, [{ id: 'tr-1', refundNo: 'TR-001' }]);
    assert.equal(res.payload.data.pagination.total, 1);
  } finally {
    taxRefundService.listTaxRefunds = original;
  }
});

test('getWorkbench: 返回退税工作台汇总与候选合同', async () => {
  const original = taxRefundWorkbenchService.getTaxRefundWorkbench;
  taxRefundWorkbenchService.getTaxRefundWorkbench = async (query) => ({
    items: [{ salesContractId: 'sc-1', contractNo: 'EXP260001' }],
    total: 1,
    page: Number(query.page),
    pageSize: Number(query.pageSize),
    summary: { contracts: 1, readyToExport: 0 },
  });
  try {
    const req = { query: { page: '2', pageSize: '10', stage: 'PREPARATION' } };
    const res = createMockRes();
    let capturedError = null;
    await taxRefundController.getWorkbench(req, res, (error) => { capturedError = error; });
    assert.equal(capturedError, null);
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.data.items[0].contractNo, 'EXP260001');
    assert.equal(res.payload.data.page, 2);
  } finally {
    taxRefundWorkbenchService.getTaxRefundWorkbench = original;
  }
});

test('getInvoiceVerification: 返回单份出口合同的逐票核验', async () => {
  const original = taxRefundWorkbenchService.getContractInvoiceVerification;
  let capturedId = null;
  taxRefundWorkbenchService.getContractInvoiceVerification = async (id) => {
    capturedId = id;
    return { salesContractId: id, contractNo: 'EXP260001', summary: { pass: 1 }, results: [] };
  };
  try {
    const req = { params: { salesContractId: 'sc-1' } };
    const res = createMockRes();
    let capturedError = null;
    await taxRefundController.getInvoiceVerification(req, res, (error) => { capturedError = error; });
    assert.equal(capturedError, null);
    assert.equal(capturedId, 'sc-1');
    assert.equal(res.payload.data.summary.pass, 1);
  } finally {
    taxRefundWorkbenchService.getContractInvoiceVerification = original;
  }
});

test('createTaxRefund: 创建成功返回 201 与成功消息', async () => {
  const original = taxRefundService.createTaxRefund;

  taxRefundService.createTaxRefund = async (payload) => ({
    id: 'tr-2',
    refundNo: payload.refundNo,
  });

  try {
    const req = {
      body: {
        refundNo: 'TR-20260307-01',
        salesContractId: 'sc-2',
        customsDeclarationId: 'cd-2',
      },
    };
    const res = createMockRes();
    let capturedError = null;
    const next = (error) => {
      capturedError = error;
    };

    await taxRefundController.createTaxRefund(req, res, next);

    assert.equal(capturedError, null);
    assert.equal(res.statusCode, 201);
    assert.equal(res.payload.message, '退税记录创建成功');
    assert.deepEqual(res.payload.data, {
      id: 'tr-2',
      refundNo: 'TR-20260307-01',
    });
  } finally {
    taxRefundService.createTaxRefund = original;
  }
});

test('removeTaxRefund: 删除成功返回统一成功响应', async () => {
  const original = taxRefundService.removeTaxRefund;
  let capturedId = null;

  taxRefundService.removeTaxRefund = async (id) => {
    capturedId = id;
  };

  try {
    const req = { params: { id: 'tr-3' } };
    const res = createMockRes();
    let capturedError = null;
    const next = (error) => {
      capturedError = error;
    };

    await taxRefundController.removeTaxRefund(req, res, next);

    assert.equal(capturedError, null);
    assert.equal(capturedId, 'tr-3');
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.message, '退税记录删除成功');
    assert.equal(res.payload.data, null);
  } finally {
    taxRefundService.removeTaxRefund = original;
  }
});

test('generateTaxRefundDrafts: 返回自动生成结果汇总', async () => {
  const original = taxRefundDraftService.generateTaxRefundDrafts;
  let capturedPayload = null;

  taxRefundDraftService.generateTaxRefundDrafts = async (payload) => {
    capturedPayload = payload;
    return {
      created: 2,
      skipped: 1,
      items: [
        { customsDeclarationId: 'cd-1', refundId: 'tr-1', reason: null },
        { customsDeclarationId: 'cd-2', refundId: null, reason: 'existing_refund' },
      ],
    };
  };

  try {
    const req = {
      body: {
        customsDeclarationId: 'cd-1',
        replaceExisting: true,
      },
    };
    const res = createMockRes();
    let capturedError = null;
    const next = (error) => {
      capturedError = error;
    };

    await taxRefundController.generateTaxRefundDrafts(req, res, next);

    assert.equal(capturedError, null);
    assert.deepEqual(capturedPayload, {
      customsDeclarationId: 'cd-1',
      replaceExisting: true,
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.message, '退税草稿生成完成');
    assert.equal(res.payload.data.created, 2);
    assert.equal(res.payload.data.skipped, 1);
  } finally {
    taxRefundDraftService.generateTaxRefundDrafts = original;
  }
});

test('exportTaxRefunds: 校验失败时返回 409 与错误详情', async () => {
  const original = taxRefundExportService.exportTaxRefunds;

  taxRefundExportService.exportTaxRefunds = async () => ({
    blocked: true,
    exportedCount: 0,
    items: [],
    warnings: [],
    fixes: [],
    errors: [{ code: 'missing_relation_no', taxRefundId: 'tr-5' }],
    csv: '',
  });

  try {
    const req = { body: { ids: ['tr-5'] } };
    const res = createMockRes();
    let capturedError = null;
    const next = (error) => {
      capturedError = error;
    };

    await taxRefundController.exportTaxRefunds(req, res, next);

    assert.equal(capturedError, null);
    assert.equal(res.statusCode, 409);
    assert.equal(res.payload.message, '出口退税导出校验未通过');
    assert.equal(res.payload.data.errors[0].code, 'missing_relation_no');
  } finally {
    taxRefundExportService.exportTaxRefunds = original;
  }
});

test('exportTaxRefunds: 校验通过时返回导出结果', async () => {
  const original = taxRefundExportService.exportTaxRefunds;

  taxRefundExportService.exportTaxRefunds = async () => ({
    blocked: false,
    exportedCount: 1,
    items: [{ refund_no: 'TR-006', match_status: 'passed' }],
    warnings: [],
    fixes: [],
    errors: [],
    csv: 'refund_no,match_status\nTR-006,passed',
  });

  try {
    const req = { body: { ids: ['tr-6'] } };
    const res = createMockRes();
    let capturedError = null;
    const next = (error) => {
      capturedError = error;
    };

    await taxRefundController.exportTaxRefunds(req, res, next);

    assert.equal(capturedError, null);
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.message, '退税导出成功');
    assert.equal(res.payload.data.exportedCount, 1);
    assert.equal(res.payload.data.items[0].match_status, 'passed');
  } finally {
    taxRefundExportService.exportTaxRefunds = original;
  }
});

test('exportTaxRefunds: download=1 时返回 UTF-8 CSV 附件', async () => {
  const original = taxRefundExportService.exportTaxRefunds;
  taxRefundExportService.exportTaxRefunds = async () => ({
    blocked: false,
    exportedCount: 1,
    items: [{ refund_no: 'TR-001' }],
    warnings: [],
    fixes: [],
    errors: [],
    csv: 'refund_no\nTR-001',
  });
  try {
    const headers = {};
    const res = {
      statusCode: null,
      body: null,
      setHeader: (name, value) => { headers[name] = value; },
      status(code) { this.statusCode = code; return this; },
      send(body) { this.body = body; return this; },
    };
    let capturedError = null;
    await taxRefundController.exportTaxRefunds(
      { body: { ids: ['tr-1'] }, query: { download: '1' } },
      res,
      (error) => { capturedError = error; },
    );
    assert.equal(capturedError, null);
    assert.equal(res.statusCode, 200);
    assert.match(headers['Content-Disposition'], /\.csv/);
    assert.equal(res.body, '\uFEFFrefund_no\nTR-001');
  } finally {
    taxRefundExportService.exportTaxRefunds = original;
  }
});
