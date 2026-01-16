'use client';

import { useState } from 'react';
import { SalesContract, SalesStatus, PaymentType } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CreditCard } from 'lucide-react';
import { PaymentDialog } from '../components/PaymentDialog';
import { toast } from 'sonner';

export default function ReceivablePage() {
  const [contracts, setContracts] = useState<SalesContract[]>([
    { 
      id: '1', 
      contractNo: 'EXP250001', 
      totalAmount: 15000, 
      receivedAmount: 5000, 
      exchangeRate: 6.8, 
      status: SalesStatus.CONFIRMED,
      createdAt: '', 
      updatedAt: ''
    }
  ]);
  const [selectedContract, setSelectedContract] = useState<SalesContract | null>(null);

  const handleReceive = (contract: SalesContract) => {
    setSelectedContract(contract);
  };

  const handleSubmit = async (data: any) => {
    if (selectedContract) {
      const newReceived = selectedContract.receivedAmount + Number(data.amount);
      setContracts(contracts.map(c => c.id === selectedContract.id ? { ...c, receivedAmount: newReceived } : c));
      toast.success('收款记录成功');
    }
    setSelectedContract(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">应收账款</h2>
          <p className="text-muted-foreground">门店收款跟踪。</p>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>合同编号</TableHead>
              <TableHead className="text-right">总金额 ($)</TableHead>
              <TableHead className="text-right">已收 ($)</TableHead>
              <TableHead className="text-right">待收 ($)</TableHead>
              <TableHead className="w-[100px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contracts.map((contract) => (
              <TableRow key={contract.id}>
                <TableCell className="font-medium">{contract.contractNo}</TableCell>
                <TableCell className="text-right">${contract.totalAmount.toLocaleString()}</TableCell>
                <TableCell className="text-right text-green-600">${contract.receivedAmount.toLocaleString()}</TableCell>
                <TableCell className="text-right text-red-600 font-bold">
                  ${(contract.totalAmount - contract.receivedAmount).toLocaleString()}
                </TableCell>
                <TableCell>
                  <Button size="sm" onClick={() => handleReceive(contract)}>
                    <CreditCard className="mr-2 h-3 w-3" /> 记录收款
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
          type={PaymentType.RECEIVABLE}
          contractId={selectedContract.id}
          contractNo={selectedContract.contractNo}
          remainingAmount={selectedContract.totalAmount - selectedContract.receivedAmount}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
