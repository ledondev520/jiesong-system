import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AgentAccountDialog } from './AgentAccountDialog';

describe('AgentAccountDialog', () => {
  it('展示当前固定能力集说明，而不是手动配置权限文案', async () => {
    render(
      <AgentAccountDialog
        open
        onOpenChange={vi.fn()}
        onSubmit={vi.fn(async () => {})}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/当前实现会自动附加固定能力集/)).toBeInTheDocument();
      expect(screen.getByText(/暂不支持在这里逐项勾选权限/)).toBeInTheDocument();
    });
  });
});
