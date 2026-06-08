/**
 * Input: 新建报关单页、customsDeclarationService、router、toast
 * Output: 新建报关单页交互测试结果
 * Pos: 报关单管理创建页测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreateCustomsDeclarationPage from './page';

const mockPush = vi.fn();
const mockCreate = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();

const setFieldValue = (label: string, value: string) => {
  fireEvent.change(screen.getByLabelText(label), {
    target: { value },
  });
};

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/customs-declarations/create',
  useRouter: () => ({
    push: mockPush,
    back: vi.fn(),
  }),
}));

vi.mock('@/services/customsDeclaration.service', () => ({
  customsDeclarationService: {
    create: (...args: unknown[]) => mockCreate(...args),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

describe('CreateCustomsDeclarationPage 交互逻辑', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockCreate.mockReset();
    mockToastError.mockReset();
    mockToastSuccess.mockReset();
  });

  it('展示创建页关键字段并提交标准化 payload', async () => {
    mockCreate.mockResolvedValue({
      data: {
        id: 'cd-new',
      },
    });
    const user = userEvent.setup();

    render(<CreateCustomsDeclarationPage />);

    expect(screen.getByRole('heading', { name: '新建报关单' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('报关单号'), 'CUS-2026-010');
    await user.type(screen.getByLabelText('发货人'), '捷淞供应链');
    await user.type(screen.getByLabelText('收货人'), 'Bogota Ceramica');
    await user.type(screen.getByLabelText('目的国'), '哥伦比亚');
    await user.type(screen.getByLabelText('起运港'), '上海');
    await user.type(screen.getByLabelText('目的港'), 'Buenaventura');
    await user.type(screen.getByLabelText('申报日期'), '2026-03-06');
    await user.type(screen.getByLabelText('成交币种'), 'USD');
    await user.type(screen.getByLabelText('货值总额'), '88000');
    await user.type(screen.getByLabelText('总件数'), '1200');
    await user.type(screen.getByLabelText('毛重 (kg)'), '18000');
    await user.type(screen.getByLabelText('净重 (kg)'), '17350');
    await user.type(screen.getByLabelText('商品名称'), '釉面砖');
    await user.type(screen.getByLabelText('商品 HS 编码'), '69072190');
    await user.type(screen.getByLabelText('申报数量'), '1200');
    await user.type(screen.getByLabelText('单价'), '73.33');
    await user.type(screen.getByLabelText('备注'), '整柜出运');

    await user.click(screen.getByRole('button', { name: '保存并查看详情' }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        declarationNo: 'CUS-2026-010',
        status: 'DRAFT',
        exporter: '捷淞供应链',
        consignee: 'Bogota Ceramica',
        destinationCountry: '哥伦比亚',
        portOfLoading: '上海',
        portOfDestination: 'Buenaventura',
        declarationDate: '2026-03-06',
        releaseDate: null,
        transportMode: '',
        currency: 'USD',
        totalAmount: 88000,
        totalPackages: 1200,
        grossWeight: 18000,
        netWeight: 17350,
        remarks: '整柜出运',
        items: [
          {
            productName: '釉面砖',
            hsCode: '69072190',
            quantity: 1200,
            unit: '',
            unitPrice: 73.33,
            totalPrice: null,
          },
        ],
      });
    });

    expect(mockToastSuccess).toHaveBeenCalledWith('报关单创建成功');
    expect(mockPush).toHaveBeenCalledWith('/dashboard/customs-declarations/cd-new');
  });

  it('创建失败时提示错误', async () => {
    mockCreate.mockRejectedValue(new Error('create failed'));
    const user = userEvent.setup();

    render(<CreateCustomsDeclarationPage />);

    setFieldValue('报关单号', 'CUS-2026-011');
    setFieldValue('发货人', '捷淞供应链');
    setFieldValue('收货人', 'Santiago Stone');
    setFieldValue('目的国', '智利');
    setFieldValue('起运港', '宁波');
    setFieldValue('目的港', 'San Antonio');
    setFieldValue('申报日期', '2026-03-07');
    setFieldValue('成交币种', 'USD');
    setFieldValue('货值总额', '68000');
    setFieldValue('总件数', '960');
    setFieldValue('毛重 (kg)', '14000');
    setFieldValue('净重 (kg)', '13500');
    setFieldValue('商品名称', '抛光砖');
    setFieldValue('商品 HS 编码', '69072290');
    setFieldValue('申报数量', '960');
    setFieldValue('单价', '70.83');

    await user.click(screen.getByRole('button', { name: '保存并查看详情' }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('创建报关单失败');
    });
  });
});
