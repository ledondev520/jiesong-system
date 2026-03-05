/**
 * Input: ClaudeCostCalculator组件、AI识别接口、toast
 * Output: 费用计算器交互与异常分支测试结果
 * Pos: 工作台工具组件测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClaudeCostCalculator } from './ClaudeCostCalculator';

const mockToastSuccess = vi.fn();
const mockToastInfo = vi.fn();
const mockToastError = vi.fn();
const OriginalFileReader = globalThis.FileReader;

const mockParseImageTokenUsage = vi.fn();

vi.mock('@/services/ai.service', () => ({
  aiService: {
    parseImageTokenUsage: (...args: unknown[]) => mockParseImageTokenUsage(...args),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    info: (...args: unknown[]) => mockToastInfo(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

/**
 * 职责：构造测试用 FileReader，读图后立即返回固定 base64。
 * @returns 可注入到全局的 FileReader 构造器
 */
function createMockFileReader() {
  return class MockFileReader {
    onload: ((event: { target: { result: string } }) => void) | null = null;

    readAsDataURL() {
      this.onload?.({ target: { result: 'data:image/png;base64,mocked' } });
    }
  };
}

describe('ClaudeCostCalculator', () => {
  beforeEach(() => {
    mockParseImageTokenUsage.mockReset();
    mockToastSuccess.mockReset();
    mockToastInfo.mockReset();
    mockToastError.mockReset();
    globalThis.FileReader = createMockFileReader() as unknown as typeof FileReader;
  });

  afterEach(() => {
    globalThis.FileReader = OriginalFileReader;
  });

  it('手动输入 token 后正确更新总 token 与总费用', async () => {
    render(<ClaudeCostCalculator />);

    // 使用 change 直接赋值，避免覆盖率模式下逐字符输入引发偶发超时
    fireEvent.change(screen.getByLabelText('Cache Read'), { target: { value: '1000000' } });
    fireEvent.change(screen.getByLabelText('Cache Write'), { target: { value: '1000000' } });
    fireEvent.change(screen.getByLabelText('Input'), { target: { value: '1000000' } });
    fireEvent.change(screen.getByLabelText('Output'), { target: { value: '1000000' } });

    expect(screen.getByText('总 token 数: 4,000,000')).toBeInTheDocument();
    expect(screen.getByText('$31.75')).toBeInTheDocument();
  });

  it('上传图片后识别 JSON 并回填数据', async () => {
    mockParseImageTokenUsage.mockResolvedValue({
      data: {
        message: '{"cacheRead":1000000,"cacheWrite":2000000,"input":3000000,"output":4000000,"total":10000000}',
      },
    });

    const user = userEvent.setup();
    render(<ClaudeCostCalculator />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const image = new File(['img'], 'usage.png', { type: 'image/png' });
    await user.upload(fileInput, image);

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith('已识别图片中的数据');
    });
    expect(screen.getByDisplayValue('1,000,000')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2,000,000')).toBeInTheDocument();
    expect(screen.getByDisplayValue('3,000,000')).toBeInTheDocument();
    expect(screen.getByDisplayValue('4,000,000')).toBeInTheDocument();
    expect(screen.getByText('总 token 数: 10,000,000')).toBeInTheDocument();
  });

  it('AI 返回文本格式时走兜底解析并回填', async () => {
    mockParseImageTokenUsage.mockResolvedValue({
      data: {
        message: 'Cache Read: 1,111\nCache Write: 2,222\nInput: 3,333\nOutput: 4,444\nTotal: 11,110',
      },
    });

    const user = userEvent.setup();
    render(<ClaudeCostCalculator />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const image = new File(['img'], 'usage.png', { type: 'image/png' });
    await user.upload(fileInput, image);

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith('已识别图片中的数据');
    });
    expect(screen.getByDisplayValue('1,111')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2,222')).toBeInTheDocument();
    expect(screen.getByDisplayValue('3,333')).toBeInTheDocument();
    expect(screen.getByDisplayValue('4,444')).toBeInTheDocument();
  });

  it('全局粘贴图片时触发识别流程', async () => {
    mockParseImageTokenUsage.mockResolvedValue({
      data: {
        message: '{"cacheRead":9,"cacheWrite":8,"input":7,"output":6,"total":30}',
      },
    });

    render(<ClaudeCostCalculator />);
    const image = new File(['img'], 'paste.png', { type: 'image/png' });
    fireEvent.paste(document, {
      clipboardData: {
        items: [
          {
            type: 'image/png',
            getAsFile: () => image,
          },
        ],
      },
    });

    await waitFor(() => {
      expect(mockParseImageTokenUsage).toHaveBeenCalled();
    });
  });

  it('识别失败时提示错误消息', async () => {
    mockParseImageTokenUsage.mockRejectedValue(new Error('boom'));

    const user = userEvent.setup();
    render(<ClaudeCostCalculator />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const image = new File(['img'], 'usage.png', { type: 'image/png' });
    await user.upload(fileInput, image);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled();
    });
  });
});
