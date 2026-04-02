import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './button';

describe('Button', () => {
  it('渲染默认按钮', () => {
    render(<Button>提交</Button>);
    expect(screen.getByRole('button', { name: '提交' })).toBeInTheDocument();
  });

  it('暴露 variant 与 size 数据属性', () => {
    render(
      <Button variant="outline" size="sm">
        操作
      </Button>,
    );

    const button = screen.getByRole('button', { name: '操作' });
    expect(button).toHaveAttribute('data-variant', 'outline');
    expect(button).toHaveAttribute('data-size', 'sm');
  });
});
