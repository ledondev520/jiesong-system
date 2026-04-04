/**
 * PDF Export 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  exportTableToPDF,
  exportSalesContract,
  exportSalesList,
  exportFinanceReport,
  type PDFColumn,
} from './pdf-export';
import jsPDF from 'jspdf';

// Mock jspdf
vi.mock('jspdf', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      setFontSize: vi.fn(),
      setFont: vi.fn(),
      text: vi.fn(),
      save: vi.fn(),
      setTextColor: vi.fn(),
      internal: {
        pageSize: {
          width: 210,
          height: 297,
        },
      },
    })),
  };
});

vi.mock('jspdf-autotable', () => ({
  default: vi.fn(),
}));

describe('PDF Export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('exportTableToPDF', () => {
    it('应该导出表格数据为 PDF', () => {
      const data = [
        { id: 1, name: 'Test 1', amount: 100 },
        { id: 2, name: 'Test 2', amount: 200 },
      ];
      const columns: PDFColumn[] = [
        { header: 'ID', dataKey: 'id' },
        { header: 'Name', dataKey: 'name' },
        { header: 'Amount', dataKey: 'amount' },
      ];

      exportTableToPDF(data, columns, {
        title: 'Test Report',
        filename: 'test.pdf',
      });

      expect(jsPDF).toHaveBeenCalledWith({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });
    });

    it('应该支持横向布局', () => {
      const data = [{ id: 1 }];
      const columns: PDFColumn[] = [{ header: 'ID', dataKey: 'id' }];

      exportTableToPDF(data, columns, {
        title: 'Landscape Report',
        orientation: 'landscape',
      });

      expect(jsPDF).toHaveBeenCalledWith(
        expect.objectContaining({
          orientation: 'landscape',
        })
      );
    });

    it('应该处理空数据', () => {
      const data: Record<string, unknown>[] = [];
      const columns: PDFColumn[] = [{ header: 'ID', dataKey: 'id' }];

      exportTableToPDF(data, columns, {
        title: 'Empty Report',
      });

      expect(jsPDF).toHaveBeenCalled();
    });
  });

  describe('exportSalesContract', () => {
    it('应该导出销售合同 PDF', () => {
      const contract = {
        contractNo: 'EXP001',
        signedAt: '2024-01-15',
        port: 'Shanghai',
        storeName: 'Store A',
        customerName: 'Customer B',
        status: 'active',
        totalBoxes: 100,
        volume: 50.5,
        totalAmount: 50000,
        currency: 'USD',
        packingLists: [
          {
            hsCode: '123456',
            description: 'Product A',
            quantity: 10,
            unit: 'pcs',
            weight: 100,
            volume: 5,
          },
        ],
      };

      exportSalesContract(contract);

      const mockDoc = vi.mocked(jsPDF).mock.results[0].value;
      expect(mockDoc.save).toHaveBeenCalledWith('出口合同_EXP001.pdf');
    });

    it('应该处理没有装箱明细的合同', () => {
      const contract = {
        contractNo: 'EXP002',
        signedAt: '2024-01-15',
      };

      exportSalesContract(contract);

      expect(jsPDF).toHaveBeenCalled();
    });
  });

  describe('exportSalesList', () => {
    it('应该导出销售合同列表', () => {
      const contracts = [
        {
          contractNo: 'EXP001',
          port: 'Shanghai',
          storeName: 'Store A',
          customerName: 'Customer B',
          status: 'active',
          signedAt: '2024-01-15',
          totalBoxes: 100,
          volume: 50.5,
          totalAmount: 50000,
        },
      ];

      exportSalesList(contracts);

      expect(jsPDF).toHaveBeenCalledWith(
        expect.objectContaining({
          orientation: 'landscape',
        })
      );
    });
  });

  describe('exportFinanceReport', () => {
    it('应该导出财务报表', () => {
      const data = {
        period: '2024-01',
        totalReceipts: 100000,
        totalPayments: 80000,
        netAmount: 20000,
        pendingReceipts: 5000,
        pendingPayments: 3000,
      };

      exportFinanceReport(data);

      expect(jsPDF).toHaveBeenCalled();
    });

    it('应该处理带交易明细的报表', () => {
      const data = {
        period: '2024-01',
        totalReceipts: 100000,
        transactions: [
          {
            date: '2024-01-01',
            type: '收款',
            contractNo: 'EXP001',
            counterparty: 'Customer A',
            amount: 50000,
            status: 'completed',
          },
        ],
      };

      exportFinanceReport(data);

      expect(jsPDF).toHaveBeenCalled();
    });
  });
});
