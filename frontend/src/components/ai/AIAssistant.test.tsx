/**
 * Input: AIAssistant组件、fetch
 * Output: AI助手组件交互测试结果
 * Pos: 全局AI助手组件测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AIAssistant } from './AIAssistant';

const OriginalFileReader = globalThis.FileReader;

/**
 * 职责：构造可控的流式响应 reader，模拟SSE分片返回。
 * 思路：
 * 1. 将输入字符串逐条编码为 Uint8Array；
 * 2. 按顺序在 read() 中返回；
 * 3. 消费完后返回 done=true。
 * @param chunks SSE分片文本数组
 * @returns 可用于 fetch Response.body.getReader 的对象
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

/**
 * 职责：构造测试用 FileReader，使 readAsDataURL 立即回填结果。
 * 思路：在 readAsDataURL 时同步触发 onload，返回固定 base64 结果。
 * @returns 可替换全局 FileReader 的构造器
 */
function createMockFileReader() {
  return class MockFileReader {
    onload: ((event: { target: { result: string } }) => void) | null = null;

    readAsDataURL() {
      this.onload?.({ target: { result: 'data:image/png;base64,mocked' } });
    }
  };
}

describe('AIAssistant', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.FileReader = createMockFileReader() as unknown as typeof FileReader;
  });

  afterEach(() => {
    globalThis.FileReader = OriginalFileReader;
  });

  it('点击低存在感触发器后打开侧边面板', async () => {
    const user = userEvent.setup();
    render(<AIAssistant />);

    await user.click(screen.getByRole('button', { name: 'AI 助手' }));
    expect(screen.getByRole('complementary', { name: 'AI 助手侧边面板' })).toBeInTheDocument();
    expect(screen.getByText('捷淞智能助手')).toBeInTheDocument();
  });

  it('发送失败时显示错误提示消息', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Failed to fetch'));

    const user = userEvent.setup();
    render(<AIAssistant />);

    await user.click(screen.getByRole('button', { name: 'AI 助手' }));
    const input = screen.getByPlaceholderText('输入问题或粘贴图片...');
    await user.type(input, '你好');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText('无法连接到服务器，请检查网络连接。')).toBeInTheDocument();
    });
  });

  it('流式响应成功时展示回答与思考折叠入口', async () => {
    const reader = createMockSseReader([
      'data: {"type":"session","sessionId":"session-1"}\n',
      'data: {"type":"thinking","content":"先分析问题。"}\n',
      'data: {"type":"chunk","content":"这是最终回答。"}\n',
      'data: {"type":"done"}\n',
    ]);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      body: {
        getReader: () => reader,
      },
    } as Response);

    const user = userEvent.setup();
    render(<AIAssistant />);

    await user.click(screen.getByRole('button', { name: 'AI 助手' }));
    const input = screen.getByPlaceholderText('输入问题或粘贴图片...');
    await user.type(input, '请给出建议');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText('这是最终回答。')).toBeInTheDocument();
    });
    expect(screen.getByText('查看思考过程')).toBeInTheDocument();
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

  it('上传超大图片时弹出大小限制提示', async () => {
    const alertSpy = vi.spyOn(globalThis, 'alert').mockImplementation(() => undefined);

    const user = userEvent.setup();
    render(<AIAssistant />);

    await user.click(screen.getByRole('button', { name: 'AI 助手' }));
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const oversizedImage = new File([new Uint8Array(6 * 1024 * 1024)], 'big.png', { type: 'image/png' });
    await user.upload(fileInput, oversizedImage);

    expect(alertSpy).toHaveBeenCalledWith('图片大小不能超过5MB');
    expect(screen.queryByText('图片已准备好')).not.toBeInTheDocument();
  });

  it('上传非图片文件时忽略该文件', async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<AIAssistant />);

    await user.click(screen.getByRole('button', { name: 'AI 助手' }));
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const textFile = new File(['plain text'], 'note.txt', { type: 'text/plain' });
    await user.upload(fileInput, textFile);

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
        items: [
          {
            type: 'image/png',
            getAsFile: () => image,
          },
        ],
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
      dataTransfer: {
        files: [image],
      },
    });

    await waitFor(() => {
      expect(screen.getByText('图片已准备好')).toBeInTheDocument();
    });
  });
});
