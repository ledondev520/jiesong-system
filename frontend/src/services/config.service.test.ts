/**
 * Input: 配置服务与API实例
 * Output: 配置服务接口单元测试
 * Pos: 前端业务服务测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/axios';
import { configService } from './config.service';

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('configService', () => {
  it('getSystemConfig: 请求系统配置', async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ code: 200, data: {} });

    await configService.getSystemConfig();

    expect(api.get).toHaveBeenCalledWith('/system/configs');
  });

  it('updateSystemConfig: 空数据时仅回读配置', async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ code: 200, data: {} });

    await configService.updateSystemConfig({});

    expect(api.put).not.toHaveBeenCalled();
    expect(api.get).toHaveBeenCalledWith('/system/configs');
  });

  it('updateSystemConfig: 有字段时先保存再回读', async () => {
    (api.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ code: 200 });
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ code: 200, data: {} });

    await configService.updateSystemConfig({ exchangeRate: 7.2, profitRate: 1.3 });

    expect(api.put).toHaveBeenCalledWith('/system/configs/exchangeRate', { value: 7.2 });
    expect(api.put).toHaveBeenCalledWith('/system/configs/profitRate', { value: 1.3 });
    expect(api.get).toHaveBeenCalledWith('/system/configs');
  });

  it('getUnits/getCustomsBrokers: 返回字符串数组', async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ code: 200, data: { units: ['件', '箱', 1] } })
      .mockResolvedValueOnce({ code: 200, data: { brokers: ['捷淞', null] } });

    const units = await configService.getUnits();
    const brokers = await configService.getCustomsBrokers();

    expect(units.data).toEqual(['件', '箱']);
    expect(brokers.data).toEqual(['捷淞']);
  });

  it('addUnit/deleteUnit: 更新单位集合', async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ code: 200, data: { units: ['件', '箱'] } })
      .mockResolvedValueOnce({ code: 200, data: { units: ['件', '箱'] } });

    (api.put as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ code: 200, data: { units: ['件', '箱', '卷'] } })
      .mockResolvedValueOnce({ code: 200, data: { units: ['件'] } });

    const addRes = await configService.addUnit('卷');
    const delRes = await configService.deleteUnit('箱');

    expect(api.put).toHaveBeenNthCalledWith(1, '/system/configs/units', { value: ['件', '箱', '卷'] });
    expect(api.put).toHaveBeenNthCalledWith(2, '/system/configs/units', { value: ['件'] });
    expect(addRes.data).toEqual(['件', '箱', '卷']);
    expect(delRes.data).toEqual(['件']);
  });
});
