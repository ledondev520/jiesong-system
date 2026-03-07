import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ForexVerificationsPage from './page';

describe('ForexVerificationsPage', () => {
  it('renders the forex verification service content', () => {
    render(<ForexVerificationsPage />);

    expect(screen.getByRole('heading', { name: '外汇核销加速通道' })).toBeInTheDocument();
    expect(screen.getByText('收汇核对')).toBeInTheDocument();
    expect(screen.getByText('银行回单与报关单交叉校验')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '启动核销预审' })).toHaveAttribute('href', '/login');
  });
});
