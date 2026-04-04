import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Alert, AlertTitle, AlertDescription } from './alert';

describe('alert', () => {
  it('应该渲染 Alert 组件', () => {
    render(<Alert>测试内容</Alert>);
    expect(screen.getByRole('alert')).toHaveTextContent('测试内容');
  });

  it('应该应用默认样式', () => {
    render(<Alert>默认样式</Alert>);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('relative', 'w-full', 'rounded-lg', 'border', 'p-4');
  });

  it('应该支持自定义 className', () => {
    render(<Alert className="custom-class">自定义样式</Alert>);
    expect(screen.getByRole('alert')).toHaveClass('custom-class');
  });

  it('应该支持 destructive variant', () => {
    render(<Alert variant="destructive">危险提示</Alert>);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('border-destructive/50', 'text-destructive');
  });

  it('应该渲染 AlertTitle', () => {
    render(
      <Alert>
        <AlertTitle>标题</AlertTitle>
      </Alert>
    );
    expect(screen.getByText('标题')).toBeInTheDocument();
    expect(screen.getByText('标题').tagName).toBe('H5');
  });

  it('应该渲染 AlertDescription', () => {
    render(
      <Alert>
        <AlertDescription>描述内容</AlertDescription>
      </Alert>
    );
    expect(screen.getByText('描述内容')).toBeInTheDocument();
  });

  it('应该支持 ref 转发', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<Alert ref={(el) => { ref.current = el; }}>ref 测试</Alert>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
