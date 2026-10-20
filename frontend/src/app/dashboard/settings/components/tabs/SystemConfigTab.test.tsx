/**
 * Input: SystemConfigTab、configService mock
 * Output: 系统配置 Tab 关键 UI 与保存字段回归
 * Pos: 设置 > 系统配置单测
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SystemConfigTab } from './SystemConfigTab';

const mockGetSystemConfig = vi.fn();
const mockUpdateSystemConfig = vi.fn();

vi.mock('@/services/config.service', () => ({
  configService: {
    getSystemConfig: (...args: unknown[]) => mockGetSystemConfig(...args),
    updateSystemConfig: (...args: unknown[]) => mockUpdateSystemConfig(...args),
  },
}));

vi.mock('@/lib/axios', () => ({
  default: { post: vi.fn() },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('SystemConfigTab', () => {
  beforeEach(() => {
    mockGetSystemConfig.mockReset();
    mockUpdateSystemConfig.mockReset();
    mockGetSystemConfig.mockResolvedValue({
      data: {
        exchangeRate: 7.2,
        profitRate: 1.3,
        units: ['件'],
        brokers: ['捷淞'],
        aiTemperature: 0.7,
        aiMaxTokens: 4096,
      },
    });
    mockUpdateSystemConfig.mockResolvedValue({});
  });

  it('加载后展示 AI 模型优先级与温度、Max tokens', async () => {
    render(<SystemConfigTab />);

    await waitFor(() => {
      expect(screen.getByText(/采样温度/)).toBeInTheDocument();
    });

    expect(screen.getAllByText(/采样温度/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/最大输出长度/).length).toBeGreaterThan(0);
    expect(screen.getByText(/0\.7 — 均衡/)).toBeInTheDocument();
  });

  it('保存时写入 aiTemperature 与 aiMaxTokens', async () => {
    const user = userEvent.setup();
    render(<SystemConfigTab />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /保存配置/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /保存配置/ }));

    await waitFor(() => {
      const calls = mockUpdateSystemConfig.mock.calls.map((c) => c[0] as Record<string, unknown>);
      const hasTemp = calls.some((p) => p.aiTemperature === 0.7);
      const hasMax = calls.some((p) => p.aiMaxTokens === 4096);
      expect(hasTemp).toBe(true);
      expect(hasMax).toBe(true);
    });
  });

  it('从不渲染后端返回的完整 Kimi 密钥，只展示已配置状态', async () => {
    const secret = 'sk-test-secret-should-never-render';
    mockGetSystemConfig.mockResolvedValueOnce({
      data: {
        exchangeRate: 7.2,
        profitRate: 1.3,
        units: ['件'],
        brokers: ['捷淞'],
        apiKey: secret,
      },
    });

    render(<SystemConfigTab />);

    await waitFor(() => {
      expect(screen.getByText('已配置（只写）')).toBeInTheDocument();
    });

    expect(screen.queryByText(secret)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(secret);
  });

  it('Kimi 配置仍将新密钥写入原 apiKey 字段', async () => {
    const user = userEvent.setup();
    render(<SystemConfigTab />);
    const input = await screen.findByPlaceholderText('输入 Kimi API Key (sk-...)');
    // 合成测试占位符，不是生产凭据。
    await user.type(input, 'test-only-nonproduction-placeholder');
    await user.click(screen.getByRole('button', { name: /保存配置/ }));
    await waitFor(() => expect(mockUpdateSystemConfig).toHaveBeenCalledWith({ apiKey: 'test-only-nonproduction-placeholder' }));
  });

  it('DeepSeek 限定 Flash 模型、思考模式和专用密钥字段，保留原温度', async () => {
    // 合成测试占位符，不是生产凭据。
    const newKey = 'test-only-nonproduction-placeholder';
    mockGetSystemConfig.mockResolvedValueOnce({ data: {
      exchangeRate: 7.2, profitRate: 1.3, aiProvider: 'deepseek',
      apiKey: '********configured', deepseekApiKey: '********configured',
      aiChatModel: 'kimi-k2-turbo-preview', aiHsCodeModel: 'moonshot-v1-8k',
      aiThinking: true, aiReasoningEffort: 'high', aiTemperature: 0.7,
    } });
    const user = userEvent.setup();
    render(<SystemConfigTab />);

    expect(await screen.findByText('DeepSeek API Key')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '控制台' })).toHaveAttribute('href', 'https://platform.deepseek.com/api_keys');
    expect(screen.getByText(/思考模式已开启.*high/)).toBeInTheDocument();
    expect(screen.getByText(/0\.7 — 均衡/)).toBeInTheDocument();
    expect(screen.getByRole('slider')).toHaveAttribute('data-disabled');
    const keyInput = screen.getByPlaceholderText('输入新 Key 以覆盖');
    expect(keyInput).toHaveValue('');
    await user.click(screen.getAllByRole('combobox')[0]);
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option', { name: /deepseek-flash/ })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.type(keyInput, newKey);
    await user.click(screen.getByRole('button', { name: /保存配置/ }));

    await waitFor(() => expect(mockUpdateSystemConfig).toHaveBeenCalledWith({ deepseekApiKey: newKey }));
    const writes = Object.assign({}, ...mockUpdateSystemConfig.mock.calls.map(c => c[0]));
    expect(writes).toMatchObject({ aiChatModel: 'deepseek-flash', aiHsCodeModel: 'deepseek-flash' });
    expect(writes).not.toHaveProperty('apiKey');
    expect(writes).not.toHaveProperty('aiTemperature');
  });
});
