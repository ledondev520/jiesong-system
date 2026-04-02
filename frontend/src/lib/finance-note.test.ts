import { describe, expect, it } from 'vitest';

import { buildReceiptNote } from './finance-note';

describe('buildReceiptNote', () => {
  it('合同号存在时输出标准化备注', () => {
    expect(
      buildReceiptNote({
        contractRef: 'exp250024',
        note: '客户首笔回款',
      }),
    ).toBe('合同号:EXP250024 | 备注:客户首笔回款');
  });

  it('仅备注存在时保留自由备注', () => {
    expect(
      buildReceiptNote({
        contractRef: '',
        note: '客户首笔回款',
      }),
    ).toBe('备注:客户首笔回款');
  });

  it('合同号和备注都为空时返回空串', () => {
    expect(
      buildReceiptNote({
        contractRef: '',
        note: '',
      }),
    ).toBe('');
  });
});

