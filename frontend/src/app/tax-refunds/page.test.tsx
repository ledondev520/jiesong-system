import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TaxRefundsPage from './page';

describe('TaxRefundsPage', () => {
  it('renders the tax refund service content', () => {
    render(<TaxRefundsPage />);

    expect(screen.getByRole('heading', { name: '出口退税申报工作台' })).toBeInTheDocument();
    expect(screen.getByText('单证归集')).toBeInTheDocument();
    expect(screen.getByText('按批次整理申报口径与凭证缺口')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '进入退税排期' })).toHaveAttribute('href', '/login');
  });
});
