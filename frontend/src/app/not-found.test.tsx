import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import NotFoundPage from './not-found';

describe('NotFoundPage', () => {
  it('提供业务友好的 404 文案与返回入口', () => {
    render(<NotFoundPage />);

    expect(screen.getByRole('heading', { name: '页面不存在' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '返回工作台' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: '返回登录页' })).toHaveAttribute('href', '/login');
  });
});
