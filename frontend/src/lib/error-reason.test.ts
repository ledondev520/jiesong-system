import { describe, expect, it } from 'vitest';
import { describeFailure, getErrorReason } from './error-reason';

describe('error-reason', () => {
  it('取响应体 message，其次 error，其次嵌套 response.data', () => {
    expect(getErrorReason({ message: '无权限查看' })).toBe('无权限查看');
    expect(getErrorReason({ error: '库存不足' })).toBe('库存不足');
    expect(getErrorReason({ response: { data: { message: '服务繁忙' } } })).toBe('服务繁忙');
    expect(getErrorReason(new Error('网络连接失败，请检查网络后重试'))).toBe('网络连接失败，请检查网络后重试');
    expect(getErrorReason('超时')).toBe('超时');
  });

  it('取不到原因时使用兜底文案', () => {
    expect(getErrorReason(null)).toBe('请稍后重试');
    expect(getErrorReason({ message: '  ' })).toBe('请稍后重试');
    expect(getErrorReason(undefined, '再试一次')).toBe('再试一次');
  });

  it('describeFailure 拼成「失败的事：原因」', () => {
    expect(describeFailure('加载港口失败', { message: '数据库忙' })).toBe('加载港口失败：数据库忙');
  });
});
