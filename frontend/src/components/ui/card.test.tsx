import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardAction } from './card';

describe('card', () => {
  it('应该渲染 Card 组件', () => {
    render(<Card data-testid="card">卡片内容</Card>);
    expect(screen.getByTestId('card')).toHaveTextContent('卡片内容');
  });

  it('应该应用默认样式', () => {
    render(<Card data-testid="card">默认样式</Card>);
    const card = screen.getByTestId('card');
    expect(card).toHaveClass('flex', 'flex-col', 'gap-6', 'rounded-xl', 'border', 'bg-card');
  });

  it('应该支持自定义 className', () => {
    render(<Card className="custom-class" data-testid="card">自定义样式</Card>);
    expect(screen.getByTestId('card')).toHaveClass('custom-class');
  });

  it('应该渲染 CardHeader', () => {
    render(
      <Card>
        <CardHeader data-testid="header">标题区域</CardHeader>
      </Card>
    );
    expect(screen.getByTestId('header')).toBeInTheDocument();
  });

  it('应该渲染 CardTitle', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle data-testid="title">卡片标题</CardTitle>
        </CardHeader>
      </Card>
    );
    expect(screen.getByText('卡片标题')).toBeInTheDocument();
  });

  it('CardTitle 应该应用默认样式', () => {
    render(
      <Card>
        <CardTitle data-testid="title">标题</CardTitle>
      </Card>
    );
    expect(screen.getByTestId('title')).toHaveClass('font-semibold', 'tracking-tight');
  });

  it('应该渲染 CardDescription', () => {
    render(
      <Card>
        <CardDescription data-testid="desc">卡片描述</CardDescription>
      </Card>
    );
    expect(screen.getByTestId('desc')).toHaveTextContent('卡片描述');
  });

  it('CardDescription 应该应用默认样式', () => {
    render(
      <Card>
        <CardDescription data-testid="desc">描述</CardDescription>
      </Card>
    );
    expect(screen.getByTestId('desc')).toHaveClass('text-muted-foreground', 'text-sm');
  });

  it('应该渲染 CardContent', () => {
    render(
      <Card>
        <CardContent data-testid="content">内容区域</CardContent>
      </Card>
    );
    expect(screen.getByTestId('content')).toHaveTextContent('内容区域');
  });

  it('应该渲染 CardFooter', () => {
    render(
      <Card>
        <CardFooter data-testid="footer">底部区域</CardFooter>
      </Card>
    );
    expect(screen.getByTestId('footer')).toHaveTextContent('底部区域');
  });

  it('应该渲染 CardAction', () => {
    render(
      <Card>
        <CardHeader>
          <CardAction data-testid="action">操作</CardAction>
        </CardHeader>
      </Card>
    );
    expect(screen.getByTestId('action')).toHaveTextContent('操作');
  });

  it('应该组合所有子组件', () => {
    render(
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>完整卡片</CardTitle>
          <CardDescription>这是一个完整的卡片组件</CardDescription>
        </CardHeader>
        <CardContent>主要内容在这里</CardContent>
        <CardFooter>底部操作区</CardFooter>
      </Card>
    );

    expect(screen.getByTestId('card')).toBeInTheDocument();
    expect(screen.getByText('完整卡片')).toBeInTheDocument();
    expect(screen.getByText('这是一个完整的卡片组件')).toBeInTheDocument();
    expect(screen.getByText('主要内容在这里')).toBeInTheDocument();
    expect(screen.getByText('底部操作区')).toBeInTheDocument();
  });
});
