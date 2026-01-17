/**
 * Input: Button组件
 * Output: Button组件单元测试
 * Pos: 前端UI组件测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Button } from './button';

describe('Button', () => {
  it('渲染默认按钮', () => {
    const { getByRole } = render(<Button>提交</Button>);

    expect(getByRole('button').textContent).toBe('提交');
  });

  it('支持variant与size属性', () => {
    const { getByRole } = render(
      <Button variant="outline" size="sm">
        操作
      </Button>,
    );

    const button = getByRole('button', { name: '操作' });
    expect(button.getAttribute('data-variant')).toBe('outline');
    expect(button.getAttribute('data-size')).toBe('sm');
  });
});
