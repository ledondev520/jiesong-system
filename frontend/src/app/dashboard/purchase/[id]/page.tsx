/**
 * Input: 采购合同详情API、购销合同生成服务、SortableTableHead、useTableSort
 * Output: 采购合同详情页面（含可排序商品明细、付款记录、合同文档预览）
 * Pos: 采购管理子页面，展示单个采购合同的完整信息
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState, useEffect, use, useCallback, useMemo } from 'react';
import { PurchaseContract, PurchaseItem, PurchaseStatus } from '@/types';
import { purchaseService } from '@/services/purchase.service';
import { contractDocService } from '@/services/contractDoc.service';
import { listContractFiles, type ContractFile } from '@/services/contractFile.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { useTableSort } from '@/lib/hooks/useTableSort';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { SemanticBadge } from '@/components/ui/semantic-badge';
import { Progress } from '@/components/ui/progress';
import { Package, DollarSign, Building2, FileDown, Loader2, Eye, Download } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { PageHeader } from '@/components/layout/PageHeader';
import ContractFiles from '@/components/contract/ContractFiles';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function PurchaseDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const [contract, setContract] = useState<PurchaseContract | null>(null);
  const [loading, setLoading] = useState(true);
  
  // 生成合同文档弹窗状态
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateForm, setGenerateForm] = useState({
    storeName: '',
    deliveryAddress: '',
    deliveryContact: '',
    depositRate: '30',
  });
  
  // PDF预览状态
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [contractFiles, setContractFiles] = useState<ContractFile[]>([]);

  /**
   * 职责：加载采购合同详情 + 附件列表
   */
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [contractRes, filesRes] = await Promise.all([
        purchaseService.getById(id),
        listContractFiles(id, 'PURCHASE'),
      ]);
      setContract(contractRes.data || null);
      if (filesRes.data) setContractFiles(filesRes.data);
    } catch {
      toast.error('加载合同详情失败');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  /**
   * 职责：获取状态徽章
   */
  const getStatusBadge = (status: PurchaseStatus) => {
    const statusMap: Record<PurchaseStatus, { label: string; tone: React.ComponentProps<typeof SemanticBadge>["tone"] }> = {
      [PurchaseStatus.DRAFT]: { label: '草稿', tone: 'neutral' },
      [PurchaseStatus.SIGNED]: { label: '已签订', tone: 'info' },
      [PurchaseStatus.PRODUCING]: { label: '生产中', tone: 'warning' },
      [PurchaseStatus.SHIPPED]: { label: '已发货', tone: 'progress' },
      [PurchaseStatus.RECEIVED]: { label: '已收货', tone: 'secondary' },
      [PurchaseStatus.COMPLETED]: { label: '已完成', tone: 'success' },
      [PurchaseStatus.CANCELLED]: { label: '已取消', tone: 'danger' },
    };
    const config = statusMap[status] || { label: status, tone: 'neutral' as const };
    return <SemanticBadge tone={config.tone}>{config.label}</SemanticBadge>;
  };

  /**
   * 职责：生成购销合同文档
   */
  const handleGenerateContract = async () => {
    if (!contract) return;
    
    setGenerateLoading(true);
    try {
      const blob = await contractDocService.generateFromPurchase(
        contract.id,
        generateForm
      );
      
      // 下载文件
      const filename = `购销合同${contract.contractNo?.replace('PO', 'CG') || ''}.docx`;
      contractDocService.downloadDocument(blob, filename);
      
      toast.success('合同文档已生成');
      setGenerateOpen(false);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '生成合同文档失败';
      toast.error(message);
    } finally {
      setGenerateLoading(false);
    }
  };

  /**
   * 职责：查看已上传的合同PDF
   */
  const viewContractPdf = async () => {
    if (!contract) return;
    
    setPdfLoading(true);
    try {
      // 尝试获取合同PDF（假设有此API）
      const response = await contractDocService.getContractPdf(contract.id);
      if (response) {
        const url = URL.createObjectURL(response);
        setPdfUrl(url);
        setPdfDialogOpen(true);
      } else {
        toast.info('暂无合同文档，请先生成');
      }
    } catch {
      toast.info('暂无合同文档，请点击"生成购销合同"创建');
    } finally {
      setPdfLoading(false);
    }
  };

  /**
   * 职责：导出合同 PDF
   */
  const handleExportPdf = async () => {
    if (!contract) return;

    setExportingPdf(true);
    try {
      await contractDocService.exportPurchasePdf(contract.id, contract.contractNo);
      toast.success('合同 PDF 已下载');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '导出 PDF 失败';
      toast.error(message);
    } finally {
      setExportingPdf(false);
    }
  };

  const purchaseLineItems = useMemo(() => contract?.items ?? [], [contract?.items]);

  /**
   * 职责：采购明细行排序取值（名称、规格、数量、单价、小计）
   */
  const purchaseLineAccessor = useCallback((item: PurchaseItem, key: string) => {
    switch (key) {
      case 'productName':
        return item.product?.customsName ?? '';
      case 'spec':
        return item.specification || item.product?.specification || '';
      case 'quantity':
        return item.quantity;
      case 'unitPrice':
        return Number(item.unitPrice) || 0;
      case 'lineTotal':
        return (
          Number(item.totalPrice) ||
          Number(item.quantity || 0) * Number(item.unitPrice || 0)
        );
      default:
        return null;
    }
  }, []);

  const purchaseLineSort = useTableSort(purchaseLineItems, purchaseLineAccessor);

  if (loading) {
    return <div className="flex items-center justify-center h-64">加载中...</div>;
  }

  if (!contract) {
    return <div className="text-center py-10">合同不存在</div>;
  }

  // 计算付款进度
  const paidPercent = contract.totalAmount > 0 
    ? Math.min((contract.paidAmount / contract.totalAmount) * 100, 100) 
    : 0;

  return (
    <div className="space-y-6 pb-10">
      {/* 页头 */}
      <PageHeader
        title={contract.contractNo}
        description={`供应商: ${contract.supplier?.name || '未知'} | 签订日期: ${contract.signedAt ? format(new Date(contract.signedAt), 'yyyy-MM-dd') : '-'}`}
        actions={
          <div className="flex items-center gap-2">
            {getStatusBadge(contract.status)}
            <Button variant="outline" onClick={handleExportPdf} disabled={exportingPdf}>
              {exportingPdf ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              导出 PDF
            </Button>
            <Button variant="outline" onClick={viewContractPdf} disabled={pdfLoading}>
              {pdfLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Eye className="mr-2 h-4 w-4" />
              )}
              查看合同
            </Button>
            <Button onClick={() => setGenerateOpen(true)}>
              <FileDown className="mr-2 h-4 w-4" />
              生成购销合同
            </Button>
          </div>
        }
      />

      {/* 汇总卡片 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              <div>
                <div className="text-2xl font-bold">¥{contract.totalAmount.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">合同金额</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              <div>
                <div className="text-2xl font-bold">¥{contract.paidAmount.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">已付金额</p>
              </div>
            </div>
            <Progress value={paidPercent} className="mt-2 h-2" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              <div>
                <div className="text-2xl font-bold">
                  ¥{(contract.totalAmount - contract.paidAmount).toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">待付金额</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              <div>
                <div className="text-lg font-medium truncate max-w-[150px]" title={contract.supplier?.name}>
                  {contract.supplier?.name || '-'}
                </div>
                <p className="text-xs text-muted-foreground">供应商</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 商品明细 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            商品明细
          </CardTitle>
          <CardDescription>采购合同包含的商品列表</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead
                  sortKey="productName"
                  currentSortKey={purchaseLineSort.sortKey}
                  currentSortDir={purchaseLineSort.sortDir}
                  onSort={purchaseLineSort.onSort}
                >
                  商品名称
                </SortableTableHead>
                <SortableTableHead
                  sortKey="spec"
                  currentSortKey={purchaseLineSort.sortKey}
                  currentSortDir={purchaseLineSort.sortDir}
                  onSort={purchaseLineSort.onSort}
                >
                  规格
                </SortableTableHead>
                <SortableTableHead
                  sortKey="quantity"
                  currentSortKey={purchaseLineSort.sortKey}
                  currentSortDir={purchaseLineSort.sortDir}
                  onSort={purchaseLineSort.onSort}
                  className="text-right"
                >
                  数量
                </SortableTableHead>
                <SortableTableHead
                  sortKey="unitPrice"
                  currentSortKey={purchaseLineSort.sortKey}
                  currentSortDir={purchaseLineSort.sortDir}
                  onSort={purchaseLineSort.onSort}
                  className="text-right"
                >
                  单价 (¥)
                </SortableTableHead>
                <SortableTableHead
                  sortKey="lineTotal"
                  currentSortKey={purchaseLineSort.sortKey}
                  currentSortDir={purchaseLineSort.sortDir}
                  onSort={purchaseLineSort.onSort}
                  className="text-right"
                >
                  小计 (¥)
                </SortableTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!purchaseLineSort.sortedData.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                    暂无商品明细
                  </TableCell>
                </TableRow>
              ) : (
                purchaseLineSort.sortedData.map((item: PurchaseItem) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.product?.customsName || '未知商品'}
                    </TableCell>
                    <TableCell>
                      {item.specification || item.product?.specification || '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.quantity} {item.unit || item.product?.unit}
                    </TableCell>
                    <TableCell className="text-right">
                      ¥{(Number(item.unitPrice) || 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      ¥{(Number(item.totalPrice) || Number(item.quantity || 0) * Number(item.unitPrice || 0)).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 备注 */}
      {contract.note && (
        <Card>
          <CardHeader>
            <CardTitle>备注</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{contract.note}</p>
          </CardContent>
        </Card>
      )}

      {/* 合同附件 */}
      <ContractFiles
        contractId={id}
        contractType="PURCHASE"
        files={contractFiles}
        onChange={setContractFiles}
        title="合同附件"
        description="支持 PDF、JPG、PNG、XLSX、DOCX 格式，单文件最大 10MB，用于归档原始合同或补充文件"
        emptyHint="暂无附件，点击「上传附件」归档合同文件"
      />

      {/* 生成购销合同弹窗 */}
      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileDown className="h-5 w-5 text-primary" />
              生成购销合同
            </DialogTitle>
            <DialogDescription>
              填写收货信息后，系统将自动生成标准购销合同文档
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="storeName">收货店铺名称</Label>
              <Input 
                id="storeName"
                placeholder="例如：米尔皮塔"
                value={generateForm.storeName}
                onChange={(e) => setGenerateForm(prev => ({ ...prev, storeName: e.target.value }))}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="deliveryAddress">收货地址</Label>
              <Input 
                id="deliveryAddress"
                placeholder="完整收货地址"
                value={generateForm.deliveryAddress}
                onChange={(e) => setGenerateForm(prev => ({ ...prev, deliveryAddress: e.target.value }))}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="deliveryContact">收货联系人</Label>
              <Input 
                id="deliveryContact"
                placeholder="联系人及电话"
                value={generateForm.deliveryContact}
                onChange={(e) => setGenerateForm(prev => ({ ...prev, deliveryContact: e.target.value }))}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="depositRate">首付比例 (%)</Label>
              <Input 
                id="depositRate"
                type="number"
                min="0"
                max="100"
                placeholder="默认30%"
                value={generateForm.depositRate}
                onChange={(e) => setGenerateForm(prev => ({ ...prev, depositRate: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">合同中&quot;第一笔款项&quot;的比例，默认为30%</p>
            </div>
          </div>
          
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setGenerateOpen(false)}>
              取消
            </Button>
            <Button onClick={handleGenerateContract} disabled={generateLoading}>
              {generateLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <FileDown className="mr-2 h-4 w-4" />
                  生成合同
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* PDF预览弹窗 */}
      <Dialog open={pdfDialogOpen} onOpenChange={(open) => {
        setPdfDialogOpen(open);
        if (!open && pdfUrl) {
          URL.revokeObjectURL(pdfUrl);
          setPdfUrl(null);
        }
      }}>
        <DialogContent className="max-w-4xl h-[80vh]">
          <DialogHeader>
            <DialogTitle>合同预览：{contract.contractNo}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 h-full">
            {pdfUrl ? (
              <iframe 
                src={pdfUrl} 
                className="w-full h-full border rounded"
                title="合同预览"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                暂无合同文档
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
