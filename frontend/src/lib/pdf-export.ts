/**
 * PDF 导出功能
 * 支持导出合同、表格、报表等数据为 PDF 格式
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// 扩展 jsPDF 类型以支持 autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: typeof autoTable;
  }
}

export interface PDFColumn {
  header: string;
  dataKey: string;
  width?: number;
}

export interface PDFExportOptions {
  title: string;
  subtitle?: string;
  filename?: string;
  orientation?: 'portrait' | 'landscape';
  pageSize?: 'a4' | 'letter' | 'legal';
  margin?: { top: number; right: number; bottom: number; left: number };
}

/**
 * 导出表格数据为 PDF
 */
export function exportTableToPDF<T extends Record<string, unknown>>(
  data: T[],
  columns: PDFColumn[],
  options: PDFExportOptions
): void {
  const {
    title,
    subtitle,
    filename = 'export.pdf',
    orientation = 'portrait',
    pageSize = 'a4',
  } = options;

  // 创建 PDF 文档
  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: pageSize,
  });

  // 添加中文字体支持（使用内置的 HeiseiKakuGothic 字体）
  doc.setFont('helvetica');

  // 添加标题
  doc.setFontSize(18);
  doc.text(title, 14, 20);

  // 添加副标题
  if (subtitle) {
    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text(subtitle, 14, 28);
  }

  // 添加生成时间
  doc.setFontSize(10);
  doc.setTextColor(128);
  doc.text(`生成时间: ${new Date().toLocaleString('zh-CN')}`, 14, subtitle ? 34 : 28);

  // 准备表格数据
  const headers = columns.map((col) => col.header);
  const body = data.map((row) =>
    columns.map((col) => {
      const value = row[col.dataKey];
      return formatCellValue(value);
    })
  );

  // 添加表格
  autoTable(doc, {
    head: [headers],
    body,
    startY: subtitle ? 40 : 34,
    styles: {
      font: 'helvetica',
      fontSize: 10,
      cellPadding: 3,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [41, 128, 185],
      textColor: 255,
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },
    columnStyles: columns.reduce((acc, col, index) => {
      if (col.width) {
        acc[index] = { cellWidth: col.width };
      }
      return acc;
    }, {} as Record<number, { cellWidth: number }>),
    didDrawPage: (data) => {
      // 添加页脚
      doc.setFontSize(8);
      doc.setTextColor(128);
      doc.text(
        `第 ${data.pageNumber} 页`,
        doc.internal.pageSize.width / 2,
        doc.internal.pageSize.height - 10,
        { align: 'center' }
      );
    },
  });

  // 保存文件
  doc.save(filename);
}

/**
 * 格式化单元格值
 */
function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '-';
  }
  if (value instanceof Date) {
    return value.toLocaleDateString('zh-CN');
  }
  if (typeof value === 'number') {
    return value.toLocaleString('zh-CN');
  }
  if (typeof value === 'boolean') {
    return value ? '是' : '否';
  }
  return String(value);
}

/**
 * 导出销售合同为 PDF
 */
export function exportSalesContract(contract: SalesContractData): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // 标题
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('出口合同', 105, 20, { align: 'center' });

  // 合同编号
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`合同编号: ${contract.contractNo}`, 14, 35);
  doc.text(`签订日期: ${contract.signedAt}`, 14, 42);

  // 基本信息
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('基本信息', 14, 55);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  const basicInfo = [
    [`港口: ${contract.port || '-'}`, `门店: ${contract.storeName || '-'}`],
    [`客户: ${contract.customerName || '-'}`, `状态: ${contract.status || '-'}`],
    [`总箱数: ${contract.totalBoxes || 0}`, `总体积: ${contract.volume || 0} CBM`],
    [`总金额: $${contract.totalAmount?.toLocaleString() || 0}`, `币种: ${contract.currency || 'USD'}`],
  ];

  let y = 62;
  basicInfo.forEach((row) => {
    doc.text(row[0], 14, y);
    doc.text(row[1], 105, y);
    y += 7;
  });

  // 装箱明细
  if (contract.packingLists && contract.packingLists.length > 0) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('装箱明细', 14, y + 5);

    const packingData = contract.packingLists.map((item, index) => [
      (index + 1).toString(),
      item.hsCode || '-',
      item.description || '-',
      item.quantity?.toString() || '-',
      item.unit || '-',
      item.weight?.toString() || '-',
      item.volume?.toString() || '-',
    ]);

    autoTable(doc, {
      head: [['序号', 'HS编码', '品名', '数量', '单位', '重量(KG)', '体积(CBM)']],
      body: packingData,
      startY: y + 10,
      styles: {
        font: 'helvetica',
        fontSize: 9,
        cellPadding: 2,
      },
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: 255,
      },
    });
  }

  // 签名区域
  const docWithTable = doc as { lastAutoTable?: { finalY: number } };
  const finalY = docWithTable.lastAutoTable?.finalY || y + 10;
  doc.setFontSize(11);
  doc.text('卖方签字: _________________', 14, finalY + 20);
  doc.text('买方签字: _________________', 105, finalY + 20);

  doc.save(`出口合同_${contract.contractNo}.pdf`);
}

/**
 * 导出销售合同列表
 */
export function exportSalesList(contracts: SalesContractListItem[]): void {
  const columns: PDFColumn[] = [
    { header: '合同编号', dataKey: 'contractNo', width: 30 },
    { header: '港口', dataKey: 'port', width: 20 },
    { header: '门店', dataKey: 'storeName', width: 25 },
    { header: '客户', dataKey: 'customerName', width: 30 },
    { header: '状态', dataKey: 'status', width: 20 },
    { header: '签订日期', dataKey: 'signedAt', width: 25 },
    { header: '总箱数', dataKey: 'totalBoxes', width: 15 },
    { header: '体积(CBM)', dataKey: 'volume', width: 20 },
    { header: '金额($)', dataKey: 'totalAmount', width: 25 },
  ];

  exportTableToPDF(contracts as unknown as Record<string, unknown>[], columns, {
    title: '出口合同列表',
    subtitle: `共 ${contracts.length} 条记录`,
    filename: `出口合同列表_${new Date().toISOString().slice(0, 10)}.pdf`,
    orientation: 'landscape',
  });
}

/**
 * 导出财务报表
 */
export function exportFinanceReport(data: FinanceReportData): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // 标题
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('财务报表', 105, 20, { align: 'center' });

  // 统计摘要
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`报表期间: ${data.period}`, 14, 35);
  doc.text(`生成时间: ${new Date().toLocaleString('zh-CN')}`, 14, 42);

  // 汇总数据
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('汇总数据', 14, 55);

  const summary = [
    ['总收款金额:', `$${data.totalReceipts?.toLocaleString() || 0}`],
    ['总付款金额:', `$${data.totalPayments?.toLocaleString() || 0}`],
    ['净额:', `$${data.netAmount?.toLocaleString() || 0}`],
    ['待收款:', `$${data.pendingReceipts?.toLocaleString() || 0}`],
    ['待付款:', `$${data.pendingPayments?.toLocaleString() || 0}`],
  ];

  let y = 62;
  summary.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(label, 14, y);
    doc.setFont('helvetica', 'normal');
    doc.text(value, 60, y);
    y += 8;
  });

  // 明细表格
  if (data.transactions && data.transactions.length > 0) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('交易明细', 14, y + 10);

    const columns: PDFColumn[] = [
      { header: '日期', dataKey: 'date' },
      { header: '类型', dataKey: 'type' },
      { header: '合同号', dataKey: 'contractNo' },
      { header: '客户/供应商', dataKey: 'counterparty' },
      { header: '金额', dataKey: 'amount' },
      { header: '状态', dataKey: 'status' },
    ];

    exportTableToPDF(data.transactions, columns, {
      title: '',
      filename: `财务报表_${data.period}.pdf`,
    });
  } else {
    doc.save(`财务报表_${data.period}.pdf`);
  }
}

// 类型定义
interface SalesContractData {
  contractNo: string;
  signedAt: string;
  port?: string;
  storeName?: string;
  customerName?: string;
  status?: string;
  totalBoxes?: number;
  volume?: number;
  totalAmount?: number;
  currency?: string;
  packingLists?: Array<{
    hsCode?: string;
    description?: string;
    quantity?: number;
    unit?: string;
    weight?: number;
    volume?: number;
  }>;
}

interface SalesContractListItem {
  contractNo: string;
  port?: string;
  storeName?: string;
  customerName?: string;
  status?: string;
  signedAt?: string;
  totalBoxes?: number;
  volume?: number;
  totalAmount?: number;
}

interface FinanceReportData {
  period: string;
  totalReceipts?: number;
  totalPayments?: number;
  netAmount?: number;
  pendingReceipts?: number;
  pendingPayments?: number;
  transactions?: Array<{
    date: string;
    type: string;
    contractNo: string;
    counterparty: string;
    amount: number;
    status: string;
  }>;
}
