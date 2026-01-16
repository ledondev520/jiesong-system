'use client';

import { useState } from 'react';
import { PurchaseContract, PurchaseStatus, PaymentType } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { CreditCard } from 'lucide-react';
import { PaymentDialog } from '../components/PaymentDialog';
import { toast } from 'sonner';

export default function PayablePage() {
  const [contracts, setContracts] = useState<PurchaseContract[]>([
    { 
      id: '1', 
      contractNo: 'CG250001', 
      supplierId: '1', 
      supplier: { id: '1', name: '佛山XX陶瓷', hasQualityIssue: false, isActive: true, createdAt: '', updatedAt: '' },
      totalAmount: 45000, 
      paidAmount: 13500, 
      status: PurchaseStatus.PRODUCING,
      createdAt: '', 
      updatedAt: ''
    }
  ]);
  const [selectedContract, setSelectedContract] = useState<PurchaseContract | null>(null);

  const handlePay = (contract: PurchaseContract) => {
    setSelectedContract(contract);
  };

  const handleSubmit = async (data: any) => {
    // Simulate API update
    if (selectedContract) {
      const newPaid = selectedContract.paidAmount + Number(data.amount);
      setContracts(contracts.map(c => c.id === selectedContract.id ? { ...c, paidAmount: newPaid } : c));
      toast.success('付款记录成功');
    }
    setSelectedContract(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">应付账款</h2>
          <p className="text-muted-foreground">供应商付款跟踪。</p>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>合同编号</TableHead>
              <TableHead>供应商</TableHead>
              <TableHead className="text-right">总金额</TableHead>
              <TableHead className="text-right">已付</TableHead>
              <TableHead className="text-right">待付</TableHead>
              <TableHead className="w-[100px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contracts.map((contract) => (
              <TableRow key={contract.id}>
                <TableCell className="font-medium">{contract.contractNo}</TableCell>
                <TableCell>{contract.supplier?.name}</TableCell>
                <TableCell className="text-right">¥{contract.totalAmount.toLocaleString()}</TableCell>
                <TableCell className="text-right text-green-600">¥{contract.paidAmount.toLocaleString()}</TableCell>
                <TableCell className="text-right text-red-600 font-bold">
                  ¥{(contract.totalAmount - contract.paidAmount).toLocaleString()}
                </TableCell>
                <TableCell>
                  <Button size="sm" onClick={() => handlePay(contract)}>
                    <CreditCard className="mr-2 h-3 w-3" /> 记录付款
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {selectedContract && (
        <PaymentDialog 
          open={!!selectedContract} 
          onOpenChange={(open) => !open && setSelectedContract(null)}
          type={PaymentType.PAYABLE}
          contractId={selectedContract.id}
          contractNo={selectedContract.contractNo}
          remainingAmount={selectedContract.totalAmount - selectedContract.paidAmount}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
