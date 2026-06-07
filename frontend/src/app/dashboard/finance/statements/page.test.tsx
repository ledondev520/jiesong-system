import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FinancialStatementsPage from './page';

vi.mock('./components/FinancialStatementsPageContent', () => ({
  FinancialStatementsPageContent: () => <div data-testid="financial-statements-page-content" />,
}));

describe('FinancialStatementsPage', () => {
  it('渲染财务报表独立页面内容', () => {
    render(<FinancialStatementsPage />);

    expect(screen.getByTestId('financial-statements-page-content')).toBeInTheDocument();
  });
});
