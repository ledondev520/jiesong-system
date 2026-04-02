import { describe, expect, it, vi } from 'vitest';
import TaxRefundsPage from './page';

const mockRedirect = vi.fn();

vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

describe('TaxRefundsPage', () => {
  it('统一退税入口并跳转到 dashboard 业务页', () => {
    try {
      TaxRefundsPage();
    } catch {
      // next redirect throws by design
    }

    expect(mockRedirect).toHaveBeenCalledWith('/dashboard/tax-refunds');
  });
});
