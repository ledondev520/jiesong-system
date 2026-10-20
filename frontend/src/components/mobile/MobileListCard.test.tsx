import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MobileListCard } from './MobileListCard';

describe('MobileListCard', () => {
  it('完整展示传入字段，卡片导航与独立操作互不触发', () => {
    const openDetail = vi.fn();
    const edit = vi.fn();
    render(
      <MobileListCard
        title="出口合同"
        onClick={openDetail}
        fields={Array.from({ length: 5 }, (_, index) => ({ label: `字段${index + 1}`, value: `内容${index + 1}` }))}
        action={<button onClick={edit}>编辑</button>}
      />,
    );
    expect(screen.getByText('内容5')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /出口合同/ }));
    expect(openDetail).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    expect(edit).toHaveBeenCalledTimes(1);
    expect(openDetail).toHaveBeenCalledTimes(1);
  });
});
