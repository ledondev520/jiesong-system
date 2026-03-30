import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Dialog, DialogContent, DialogTitle } from './dialog';

describe('DialogContent', () => {
  it('默认携带移动端全屏弹层样式，确保关闭按钮可达', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>测试弹窗</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    const content = screen.getByRole('dialog');
    expect(content.className).toContain('inset-x-0');
    expect(content.className).toContain('top-0');
    expect(content.className).toContain('rounded-none');
    expect(content.className).toContain('sm:top-[50%]');
  });
});
