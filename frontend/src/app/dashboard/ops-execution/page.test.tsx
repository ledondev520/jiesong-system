/**
 * Input: 经营执行中台页面、opsExecution 服务、toast
 * Output: 经营执行中台交互测试
 * Pos: 经营执行模块
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OpsExecutionPage from './page';

const mockGetUnshippedList = vi.fn();
const mockAssignUnshippedAssignee = vi.fn();
const mockGeneratePurchaseChecklist = vi.fn();
const mockCreateTask = vi.fn();
const mockGetTasks = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock('@/services/opsExecution.service', () => ({
  opsExecutionService: {
    getUnshippedList: (...args: unknown[]) => mockGetUnshippedList(...args),
    assignUnshippedAssignee: (...args: unknown[]) => mockAssignUnshippedAssignee(...args),
    generatePurchaseChecklist: (...args: unknown[]) => mockGeneratePurchaseChecklist(...args),
    createTask: (...args: unknown[]) => mockCreateTask(...args),
    getTasks: (...args: unknown[]) => mockGetTasks(...args),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

if (!HTMLElement.prototype.hasPointerCapture) {
  HTMLElement.prototype.hasPointerCapture = () => false;
}

if (!HTMLElement.prototype.setPointerCapture) {
  HTMLElement.prototype.setPointerCapture = () => {};
}

if (!HTMLElement.prototype.releasePointerCapture) {
  HTMLElement.prototype.releasePointerCapture = () => {};
}

if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => {};
}

const baseResponse = {
  data: {
    items: [
      {
        key: 'sales-1:prod-1:PACKING',
        salesContractId: 'sales-1',
        orderNo: 'EXP001',
        productId: 'prod-1',
        skuName: '餐桌',
        skuCode: '9403609990',
        status: 'PACKING',
        quantity: 15,
        unit: '件',
        recordCount: 2,
        assigneeName: '小周',
        assigneeUpdatedAt: '2026-03-15T12:00:00.000Z',
        latestUpdatedAt: '2026-03-15T11:00:00.000Z',
      },
    ],
    summary: {
      totalItems: 1,
      totalOrders: 1,
      totalQuantity: 15,
      unassignedItems: 0,
    },
    pagination: {
      total: 1,
      page: 1,
      pageSize: 50,
      totalPages: 1,
    },
  },
};

const checklistResponse = {
  data: {
    templateId: '标准店:筹备期',
    templateName: '标准店-筹备期',
    storeType: '标准店',
    openingStage: '筹备期',
    items: [
      { id: 'i-1', category: '前厅', itemName: '收银台', quantity: 1, unit: '套', notes: '基础配置', required: true },
    ],
    summary: {
      totalItems: 1,
      requiredCount: 1,
      optionalCount: 0,
    },
  },
};

const tasksResponse = {
  data: {
    items: [
      {
        id: 'task-1',
        title: '跟进 EXP001 未发货',
        description: '',
        assigneeName: '小周',
        priority: 'HIGH',
        status: 'TODO',
        dueAt: '2026-03-16T10:00:00.000Z',
        remindAt: '2026-03-16T08:00:00.000Z',
        secondRemindAt: '2026-03-16T11:00:00.000Z',
        sourceText: '提醒小周明天10点跟进EXP001未发货，高优先级',
      },
    ],
    summary: {
      totalItems: 1,
      overdueItems: 0,
      dueTodayItems: 0,
      highPriorityItems: 1,
    },
  },
};

describe('OpsExecutionPage', () => {
  beforeEach(() => {
    mockGetUnshippedList.mockReset();
    mockAssignUnshippedAssignee.mockReset();
    mockGeneratePurchaseChecklist.mockReset();
    mockCreateTask.mockReset();
    mockGetTasks.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
    mockGetUnshippedList.mockResolvedValue(baseResponse);
    mockGeneratePurchaseChecklist.mockResolvedValue(checklistResponse);
    mockGetTasks.mockResolvedValue(tasksResponse);
  });

  it('渲染未发货清单', async () => {
    render(<OpsExecutionPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '经营执行中台' })).toBeInTheDocument();
      expect(screen.getByText('EXP001')).toBeInTheDocument();
      expect(screen.getByText('餐桌')).toBeInTheDocument();
      expect(screen.getByDisplayValue('小周')).toBeInTheDocument();
    });
  });

  it('按状态筛选时重新请求数据', async () => {
    const user = userEvent.setup();
    render(<OpsExecutionPage />);

    await waitFor(() => {
      expect(screen.getByText('EXP001')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('combobox', { name: '仓库状态筛选' }));
    await user.click(screen.getByRole('option', { name: '包装中' }));

    await waitFor(() => {
      expect(mockGetUnshippedList).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 50,
        keyword: undefined,
        status: 'PACKING',
        assigneeName: undefined,
      });
    });
  });

  it('可以分发负责人', async () => {
    const user = userEvent.setup();
    mockAssignUnshippedAssignee.mockResolvedValue({
      data: {
        key: 'sales-1:prod-1:PACKING',
        assigneeName: '小李',
      },
    });

    render(<OpsExecutionPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('小周')).toBeInTheDocument();
    });

    const assigneeInput = screen.getByLabelText('负责人-EXP001-餐桌');
    await user.clear(assigneeInput);
    await user.type(assigneeInput, '小李');
    await user.click(screen.getByRole('button', { name: '保存负责人-EXP001-餐桌' }));

    await waitFor(() => {
      expect(mockAssignUnshippedAssignee).toHaveBeenCalledWith({
        salesContractId: 'sales-1',
        productId: 'prod-1',
        status: 'PACKING',
        assigneeName: '小李',
      });
      expect(mockToastSuccess).toHaveBeenCalledWith('负责人已更新');
    });
  });

  it('可以生成门店采购清单', async () => {
    const user = userEvent.setup();
    render(<OpsExecutionPage />);

    await user.click(screen.getByRole('tab', { name: '门店采购清单' }));
    await user.click(screen.getByRole('button', { name: '生成采购清单' }));

    await waitFor(() => {
      expect(mockGeneratePurchaseChecklist).toHaveBeenCalledWith({
        storeType: '标准店',
        openingStage: '筹备期',
      });
      expect(screen.getByText('收银台')).toBeInTheDocument();
    });
  });

  it('可以自然语言创建任务', async () => {
    const user = userEvent.setup();
    mockCreateTask.mockResolvedValue({
      data: tasksResponse.data.items[0],
    });

    render(<OpsExecutionPage />);

    await user.click(screen.getByRole('tab', { name: '任务提醒引擎' }));
    await user.type(screen.getByLabelText('自然语言建任务输入框'), '提醒小周明天10点跟进EXP001未发货，高优先级');
    await user.click(screen.getByRole('button', { name: '创建任务' }));

    await waitFor(() => {
      expect(mockCreateTask).toHaveBeenCalledWith({
        naturalLanguageInput: '提醒小周明天10点跟进EXP001未发货，高优先级',
      });
      expect(screen.getByText('跟进 EXP001 未发货')).toBeInTheDocument();
    });
  });
});
