import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DraftRestorePrompt } from './draft-restore-prompt';

describe('draft-restore-prompt', () => {
  it('应该渲染草稿恢复提示', async () => {
    render(
      <DraftRestorePrompt
        draftDate={new Date()}
        onRestore={vi.fn()}
        onDiscard={vi.fn()}
        delay={0}
      />
    );

    expect(await screen.findByText('发现未提交的草稿')).toBeInTheDocument();
  });

  it('应该显示相对时间', async () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    render(
      <DraftRestorePrompt
        draftDate={fiveMinutesAgo}
        onRestore={vi.fn()}
        onDiscard={vi.fn()}
        delay={0}
      />
    );

    expect(await screen.findByText(/5 分钟前/)).toBeInTheDocument();
  });

  it('点击恢复按钮应该触发 onRestore', async () => {
    const onRestore = vi.fn();
    const user = userEvent.setup();

    render(
      <DraftRestorePrompt
        draftDate={new Date()}
        onRestore={onRestore}
        onDiscard={vi.fn()}
        delay={0}
      />
    );

    await user.click(await screen.findByRole('button', { name: '恢复草稿' }));
    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  it('点击丢弃按钮应该触发 onDiscard', async () => {
    const onDiscard = vi.fn();
    const user = userEvent.setup();

    render(
      <DraftRestorePrompt
        draftDate={new Date()}
        onRestore={vi.fn()}
        onDiscard={onDiscard}
        delay={0}
      />
    );

    await user.click(await screen.findByRole('button', { name: '丢弃' }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });
});
