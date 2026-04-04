import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Slider } from './slider';

describe('slider', () => {
  it('应该渲染 Slider 组件', () => {
    render(<Slider data-testid="slider" />);
    expect(screen.getByTestId('slider')).toBeInTheDocument();
  });

  it('应该支持 value 属性', () => {
    render(<Slider value={[50]} max={100} data-testid="slider" />);
    expect(screen.getByTestId('slider')).toBeInTheDocument();
  });

  it('应该支持 disabled 状态', () => {
    render(<Slider disabled data-testid="slider" />);
    expect(screen.getByTestId('slider')).toHaveAttribute('data-disabled');
  });

  it('应该支持自定义 className', () => {
    render(<Slider className="custom-class" data-testid="slider" />);
    expect(screen.getByTestId('slider')).toHaveClass('custom-class');
  });
});
