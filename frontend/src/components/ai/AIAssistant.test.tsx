/**
 * Input: AIAssistant组件、fetch/aiService mock
 * Output: AI统一助手组件交互测试结果（流式+图片+二步确认）
 * Pos: 全局AI助手组件测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AIAssistant } from './AIAssistant';

const OriginalFileReader = globalThis.FileReader;
const mockExecuteAgentAction = vi.fn();
const mockCancelAgentAction = vi.fn();

vi.mock('@/services/ai.service', () => ({
  aiService: {
    executeAgentAction: (...args: unknown[]) => mockExecuteAgentAction(...args),
    cancelAgentAction: (...args: unknown[]) => mockCancelAgentAction(...args),
  },
}));

function createMockFileReader() {
  return class MockFileReader {
    onload: ((event: { target: { result: string } }) => void) | null = null;
    readAsDataURL() {
      this.onload?.({ target: { result: 'data:image/png;base64,mocked' } });
    }
  };
}

/**
 * 职责：构造可控的 SSE 流式响应 reader
 * @param chunks SSE 事件文本数组
 */
function createMockSseReader(chunks: string[]) {
  const encodedChunks = chunks.map((chunk) => new TextEncoder().encode(chunk));
  let index = 0;
  return {
    read: vi.fn().mockImplementation(async () => {
      if (index >= encodedChunks.length) {
        return { done: true, value: undefined };
      }
      const value = encodedChunks[index];
      index += 1;
      return { done: false, value };
    }),
  };
}

describe('AIAssistant', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.FileReader = createMockFileReader() as unknown as typeof FileReader;
    mockExecuteAgentAction.mockReset();
    mockCancelAgentAction.mockReset();
  });

  afterAll(() => {
    globalThis.FileReader = OriginalFileReader;
  });

  it('点击低存在感触发器后打开侧边面板', async () => {
    const user = userEvent.setup();
    render(<AIAssistant />);

    await user.click(screen.getByRole('button', { name: 'AI 助手' }));
    expect(screen.getByRole('complementary', { name: 'AI 助手侧边面板' })).toBeInTheDocument();
    expect(screen.getByText('捷淞智能助手')).toBeInTheDocument();
  });

  it('流式发送消息显示逐步内容', async () => {
    const reader = createMockSseReader([
      'data: {"type":"session","sessionId":"unified_1"}\n\n',
      'data: {"type":"chunk","content":"当前"}\n\n',
      'data: {"type":"chunk","content":"汇率为"}\n\n',
      'data: {"type":"chunk","content":"6.84"}\n\n',
      'data: {"type":"done","model":"kimi","pendingActions":[]}\n\n',
    ]);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      body: { getReader: () => reader },
    } as unknown as Response);

    const user = userEvent.setup();
    render(<AIAssistant />);

    await user.click(screen.getByRole('button', { name: 'AI 助手' }));
    await user.type(screen.getByPlaceholderText('输入问题或粘贴图片...'), '汇率多少？');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText('当前汇率为6.84')).toBeInTheDocument();
    });
  });

  it('发送失败时显示错误提示消息', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Failed to fetch'));

    const user = userEvent.setup();
    render(<AIAssistant />);

    await user.click(screen.getByRole('button', { name: 'AI 助手' }));
    await user.type(screen.getByPlaceholderText('输入问题或粘贴图片...'), '你好');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText('无法连接到服务器，请检查网络连接。')).toBeInTheDocument();
    });
  });

  it('返回 pendingActions 时显示确认卡片', async () => {
    const reader = createMockSseReader([
      'data: {"type":"session","sessionId":"unified_2"}\n\n',
      'data: {"type":"chunk","content":"好的，修改汇率。"}\n\n',
      `data: ${JSON.stringify({
        type: 'done',
        model: 'kimi',
        pendingActions: [
          {
            actionId: 'pa_1',
            actionType: 'UpdateSystemConfig',
            description: '将汇率修改为 6.84',
            params: { key: 'exchangeRate', value: '6.84' },
          },
        ],
      })}\n\n`,
    ]);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      body: { getReader: () => reader },
    } as unknown as Response);

    const user = userEvent.setup();
    render(<AIAssistant />);

    await user.click(screen.getByRole('button', { name: 'AI 助手' }));
    await user.type(screen.getByPlaceholderText('输入问题或粘贴图片...'), '改汇率');
    await user.click(screen.getByRole('button', { name: '发送消息' }));

    await waitFor(() => {
      expect(screen.getByText(/将汇率修改为 6\.84/)).toBeInTheDocument();
      expect(screen.getByText('确认执行')).toBeInTheDocument();
      expect(screen.getByText('取消')).toBeInTheDocument();
    });
  });

  it('确认 pendingAction 后调用 executeAgentAction', async () => {
    const reader = createMockSseReader([
      'data: {"type":"session","sessionId":"u3"}\n\n',
      'data: {"type":"chunk","content":"修改。"}\n\n',
      `data: ${JSON.stringify({
        type: 'done',
        model: 'kimi',
        pendingActions: [
          { actionId: 'pa_e1', actionType: 'UpdateSystemConfig', description: '修改汇率', params: {} },
        ],
      })}\n\n`,
    ]);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      body: { getReader: () => reader },
    } as unknown as Response);
    mockExecuteAgentAction.mockResolvedValue({
      data: { actionId: 'pa_e1', success: true, detail: '已更新' },
    });

    const user = userEvent.setup();
    render(<AIAssistant />);

    await user.click(screen.getByRole('button', { name: 'AI 助手' }));
    await user.type(screen.getByPlaceholderText('输入问题或粘贴图片...'), '改');
    await user.click(screen.getByRole('button', { name: '发送消息' }));

    await waitFor(() => expect(screen.getByText('确认执行')).toBeInTheDocument());
    await user.click(screen.getByText('确认执行'));

    await waitFor(() => {
      expect(mockExecuteAgentAction).toHaveBeenCalledWith('pa_e1');
    });
  });

  it('done 事件返回 actionRecommendations 时展示诊断建议', async () => {
    const reader = createMockSseReader([
      'data: {"type":"session","sessionId":"u5"}\n\n',
      'data: {"type":"chunk","content":"已完成诊断。"}\n\n',
      `data: ${JSON.stringify({
        type: 'done',
        model: 'kimi',
        pendingActions: [],
        actionRecommendations: [
          {
            code: 'trade-compliance.create-tax-refund-record',
            title: '补建退税草稿',
            domain: 'trade-compliance',
            priority: 'medium',
            executionMode: 'confirmable_write',
            reason: '退税链路尚未落单，需补退税记录',
          },
        ],
      })}\n\n`,
    ]);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      body: { getReader: () => reader },
    } as unknown as Response);

    const user = userEvent.setup();
    render(<AIAssistant />);

    await user.click(screen.getByRole('button', { name: 'AI 助手' }));
    await user.type(screen.getByPlaceholderText('输入问题或粘贴图片...'), '检查退税链路');
    await user.click(screen.getByRole('button', { name: '发送消息' }));

    await waitFor(() => {
      expect(screen.getByText('诊断建议')).toBeInTheDocument();
      expect(screen.getByText('补建退税草稿')).toBeInTheDocument();
      expect(screen.getByText('可确认执行')).toBeInTheDocument();
    });
  });

  it('取消 pendingAction 后调用 cancelAgentAction', async () => {
    const reader = createMockSseReader([
      'data: {"type":"session","sessionId":"u4"}\n\n',
      'data: {"type":"chunk","content":"修改。"}\n\n',
      `data: ${JSON.stringify({
        type: 'done',
        model: 'kimi',
        pendingActions: [
          { actionId: 'pa_c1', actionType: 'UpdateSystemConfig', description: '修改', params: {} },
        ],
      })}\n\n`,
    ]);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      body: { getReader: () => reader },
    } as unknown as Response);
    mockCancelAgentAction.mockResolvedValue({
      data: { actionId: 'pa_c1', success: true, detail: '已取消' },
    });

    const user = userEvent.setup();
    render(<AIAssistant />);

    await user.click(screen.getByRole('button', { name: 'AI 助手' }));
    await user.type(screen.getByPlaceholderText('输入问题或粘贴图片...'), '改');
    await user.click(screen.getByRole('button', { name: '发送消息' }));

    await waitFor(() => expect(screen.getByText('取消')).toBeInTheDocument());
    await user.click(screen.getByText('取消'));

    await waitFor(() => {
      expect(mockCancelAgentAction).toHaveBeenCalledWith('pa_c1');
    });
  });

  it('上传图片后展示待发送预览并可清除', async () => {
    const user = userEvent.setup();
    render(<AIAssistant />);

    await user.click(screen.getByRole('button', { name: 'AI 助手' }));
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const image = new File(['img'], 'test.png', { type: 'image/png' });
    await user.upload(fileInput, image);

    expect(screen.getByText('图片已准备好')).toBeInTheDocument();

    const previewText = screen.getByText('图片已准备好');
    const previewContainer = previewText.closest('div');
    const clearButton = previewContainer?.querySelector('button');
    expect(clearButton).toBeTruthy();
    await user.click(clearButton as HTMLButtonElement);
    expect(screen.queryByText('图片已准备好')).not.toBeInTheDocument();
  });

  it('在输入框粘贴图片时会生成待发送预览', async () => {
    const user = userEvent.setup();
    render(<AIAssistant />);

    await user.click(screen.getByRole('button', { name: 'AI 助手' }));
    const input = screen.getByPlaceholderText('输入问题或粘贴图片...');
    const image = new File(['img'], 'paste.png', { type: 'image/png' });

    fireEvent.paste(input, {
      clipboardData: {
        items: [{ type: 'image/png', getAsFile: () => image }],
      },
    });

    await waitFor(() => {
      expect(screen.getByText('图片已准备好')).toBeInTheDocument();
    });
  });

  it('拖拽图片到聊天区域时会生成待发送预览', async () => {
    const user = userEvent.setup();
    render(<AIAssistant />);

    await user.click(screen.getByRole('button', { name: 'AI 助手' }));
    const dropArea = document.querySelector('[data-slot="card-content"]') as HTMLElement;
    const image = new File(['img'], 'drop.png', { type: 'image/png' });

    fireEvent.drop(dropArea, {
      dataTransfer: { files: [image] },
    });

    await waitFor(() => {
      expect(screen.getByText('图片已准备好')).toBeInTheDocument();
    });
  });

  it('悬浮按钮可拖拽移动', async () => {
    render(<AIAssistant />);

    const trigger = screen.getByRole('button', { name: 'AI 助手' });
    fireEvent.pointerDown(trigger, { clientX: 320, clientY: 640 });
    fireEvent.pointerMove(window, { clientX: 120, clientY: 320 });
    fireEvent.pointerUp(window, { clientX: 120, clientY: 320 });

    expect(trigger.style.left).not.toBe('');
    expect(trigger.style.top).not.toBe('');
  });
});
